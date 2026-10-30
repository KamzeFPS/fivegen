'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Banknote,Megaphone,TrendingUp,ArrowDownToLine,ArrowLeft,BookOpen,Check,FileText,ImagePlus,Loader2,Plus,Users,X} from 'lucide-react';
import {toast} from 'sonner';
import {Toaster} from '@/components/ui/sonner';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {AIProviders,MediaStudio} from './ai-components';
import {CreditsPanel} from './credits-panel';
import {ConnectionsPanel} from './connections-panel';
import {FileWorkbench} from './file-workbench';
import {WorkspaceChat} from './workspace-chat';
import {WorkspaceMarketingHub,WorkspaceDesignHub} from './workspace-tool-hubs';
import {CreatorContent} from './creator-content';
import {CreatorLibrary} from './creator-library';
import {WorkspaceCalendar} from './workspace-calendar';
import {WorkspaceDomains} from './workspace-domains';
import {GrowthCRM} from './growth-crm';
import {GrowthDashboard} from './growth-dashboard';
import CommercePanel from './commerce-panel';
import {MarketingWorkspace,type MarketingTab} from './marketing-workspace';
import {WorkspaceNavigation} from './workspace-navigation';
import {WorkspaceProductRail,WorkspaceProductSidebar,productDestinationPath,type ProductArea,type ProductDestination} from './workspace-product-navigation';
import {ProductPageStudio} from './product-page-studio';
import {WorkspaceProductLibrary} from './workspace-product-library';
import {ProductDeletePanel} from './product-delete-dialog';
import {GenCompanion} from './gen-companion';
import {EditorSaveProvider,useEditorSaveRegistry,useRegisterEditorSave} from './editor-save-registry';
import {productTypes,type Product} from '@/lib/product';
import {studioFormats} from '@/lib/studio-plan';
import type {AssistantConversation} from '@/lib/workspace-assistant';
import type {CreditBalance} from '@/lib/credit-policy';
import {marketingWorkspaceAreas} from '@/lib/marketing-plugins';
import {workspaceAttachmentDraftKey,moveWorkspaceAttachmentDraft,deleteWorkspaceAttachmentDraft,clearWorkspaceAttachmentDrafts} from '@/lib/workspace-attachment-draft';
import {clearWorkspaceDrafts} from '@/lib/workspace-drafts';
import {initialWorkspaceView,workspaceProductDestination,type WorkspaceBuilderSummary,type WorkspaceFileSummary,type WorkspaceView} from '@/lib/workspace-library';
import type {AICreditPermission} from './ai-credit-consent';

type Workspace={admin:boolean;products:Product[];fileSales?:WorkspaceFileSummary[];builders?:WorkspaceBuilderSummary[];credits:CreditBalance;textCost:number;capabilities:{ai:boolean;media:boolean}};
type View=WorkspaceView;
type EditorTab=ProductArea|MarketingTab|'overview'|'customers'|'settings';
type HistoryItem={id:string;title:string;product_id:string|null;updated_at:number};
async function request<T>(url:string,body?:unknown,method=body?'POST':'GET'):Promise<T>{
  const response=await fetch(url,{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  if(response.status===401||response.status===428){location.assign('/welcome?return_to='+encodeURIComponent(location.pathname+location.search));throw new Error('Please sign in to continue.');}
  const data=await response.json() as T&{error?:string;requestState?:string};if(!response.ok)throw Object.assign(new Error(data.error||'Something went wrong. Please try again.'),{status:response.status,requestState:data.requestState});return data;
}
function readMessageDraft(id?:string|null){try{return sessionStorage.getItem('fivegen:idea:'+(id||'new'))||'';}catch{return '';}}
function rememberChat(email:string,id:string|null){try{const key='fivegen:last-assistant-conversation:'+email;if(id)sessionStorage.setItem(key,id);else sessionStorage.removeItem(key);}catch{}}
const marketingTabs:EditorTab[]=[...marketingWorkspaceAreas];
const tabs:[EditorTab,typeof FileText,string][]=[['page',BookOpen,'Product home'],['content',BookOpen,'Content'],['commerce',Banknote,'Checkout & access'],['files',FileText,'Resources'],['media',ImagePlus,'Creative assets']];
function editorArea(area:string|null):EditorTab{if(['overview','customers','settings'].includes(area||''))return area as EditorTab;return marketingTabs.includes(area as EditorTab)?area as EditorTab:tabs.some(([key])=>key===area)?area as EditorTab:'page';}

export default function GeneratorStudio({user}:{user:{name:string;email:string}|null}){return <EditorSaveProvider><GeneratorWorkspace user={user}/></EditorSaveProvider>;}
function GeneratorWorkspace({user}:{user:{name:string;email:string}|null}){
  const editorSaves=useEditorSaveRegistry();
  const pageSaver=useRef<(()=>Promise<void>)|null>(null);
  const registerPageSaver=useCallback((save:(()=>Promise<void>)|null)=>{pageSaver.current=save;},[]);
  const [workspace,setWorkspace]=useState<Workspace|null>(null),[loading,setLoading]=useState(!!user),[error,setError]=useState('');
  const [view,setView]=useState<View>('create'),[conversation,setConversation]=useState<AssistantConversation|null>(null),[history,setHistory]=useState<HistoryItem[]>([]),[remaining,setRemaining]=useState(20);
  const [draftReady,setDraftReady]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(''),[sent,setSent]=useState('');
  const [product,setProduct]=useState<Product|null>(null),[baseline,setBaseline]=useState(''),[editorTab,setEditorTab]=useState<EditorTab>('content');
  const [pageMode,setPageMode]=useState<'creator'|'member'>('creator'),[pageTab,setPageTab]=useState<'home'|'content'|'reviews'>('home'),[editingPage,setEditingPage]=useState(0),[productDetailsOpen,setProductDetailsOpen]=useState(false);
  const [childDirty,setChildDirty]=useState(false),[childBusy,setChildBusy]=useState(false);
  const [manual,setManual]=useState(false),[manualTitle,setManualTitle]=useState(''),[manualFormat,setManualFormat]=useState<(typeof studioFormats)[number]>('Video course');
  const busyRef=useRef(false),initialRoute=useRef(false),routeRevision=useRef(0),leavingWorkspace=useRef(false);
  const dirty=!!product&&JSON.stringify(product)!==baseline;
  const receiveProduct=useCallback((p:Product)=>{setProduct(p);setBaseline(JSON.stringify(p));setWorkspace(w=>w?{...w,products:[{...p,pageIconUploadId:p.pageIconUploadId??w.products.find(item=>item.id===p.id)?.pageIconUploadId},...w.products.filter(v=>v.id!==p.id)]}:w);},[]);
  const load=useCallback(async()=>{
    if(!user)return;
    try{const data=await request<Workspace>('/api/workspace');setWorkspace(data);const plans=await request<{conversations:HistoryItem[];remaining:number}>('/api/studio/conversations');setHistory(plans.conversations);setRemaining(plans.remaining);setError('');}
    catch(e){setError((e as Error).message);}finally{setLoading(false);}
  },[user]);
  useEffect(()=>{
    let active=true;
    const query=new URLSearchParams(location.search),id=query.get('conversation'),revision=routeRevision.current;
    const draft=readMessageDraft(id);
    // Restore browser state together with its server data. A navigation or edit
    // made while requests are pending takes precedence over the initial URL.
    async function initialize(){
      const [workspaceResult,plansResult,conversationResult]=await Promise.allSettled([
        user?request<Workspace>('/api/workspace'):Promise.resolve(null),
        user?request<{conversations:HistoryItem[];remaining:number}>('/api/studio/conversations'):Promise.resolve(null),
        user&&id?request<{conversation:AssistantConversation;remaining:number}>('/api/studio/assistant?id='+encodeURIComponent(id)):Promise.resolve(null),
      ]);
      if(!active)return;
      const data=workspaceResult.status==='fulfilled'?workspaceResult.value:null;
      if(data)setWorkspace(data);
      if(plansResult.status==='fulfilled'&&plansResult.value){setHistory(plansResult.value.conversations);setRemaining(plansResult.value.remaining);}
      if(!initialRoute.current&&routeRevision.current===revision){
        initialRoute.current=true;
        setMessage(draft);
        if(conversationResult.status==='fulfilled'&&conversationResult.value){setConversation(conversationResult.value.conversation);if(user)rememberChat(user.email,conversationResult.value.conversation.id);setRemaining(conversationResult.value.remaining);}
        const p=data?.products.find(value=>value.id===query.get('project'));
        const requestedView=query.get('view')||'',area=editorArea(query.get('area')||(requestedView==='marketing'?'dashboard':requestedView==='vsl'?'vsl':requestedView==='funnel'?'funnel':null));
        if(query.has('billing'))setView('credits');else if(query.get('connect')==='mcp')setView('connections');
        else if(['vsl','funnel'].includes(requestedView)){
          setView(p?'library':'marketing');
          if(!p)window.history.replaceState(null,'','/?view=marketing');
        }
        else setView(initialWorkspaceView(!!user,query));
        if(p&&requestedView==='design'){
          if(data?.builders?.some(builder=>builder.productId===p.id)){leavingWorkspace.current=true;location.replace(`/build/${encodeURIComponent(p.id)}?area=design`);return;}
          setView('design');window.history.replaceState(null,'','/?view=design');
        }else if(p){
          if(data?.builders?.some(builder=>builder.productId===p.id)&&!marketingTabs.includes(area)){const kept=new URLSearchParams();for(const key of ['area','mode','tab','customize'])if(query.has(key))kept.set(key,query.get(key)!);leavingWorkspace.current=true;location.replace(`/build/${encodeURIComponent(p.id)}${kept.size?'?'+kept:''}`);return;}
          if(data?.fileSales?.some(sale=>sale.productId===p.id)&&area!=='page'&&!marketingTabs.includes(area)){
            leavingWorkspace.current=true;location.replace(`/sell/${encodeURIComponent(p.id)}${area==='commerce'?'?stage=1':''}`);return;
          }else{const tab=area;receiveProduct(p);setEditorTab(tab);setPageMode(query.get('mode')==='member'?'member':'creator');setPageTab(query.get('tab')==='reviews'?'reviews':query.get('tab')==='content'?'content':'home');if(query.get('customize')==='1')setEditingPage(Date.now());setView('library');}
        }
        const failed=[workspaceResult,plansResult,conversationResult].find(result=>result.status==='rejected');
        if(failed?.status==='rejected')setError(failed.reason instanceof Error?failed.reason.message:'Could not open your workspace. Please try again.');
      }
      initialRoute.current=true;setDraftReady(true);setLoading(false);
    }
    void initialize();
    return()=>{active=false;};
  },[user,receiveProduct]);
  useEffect(()=>{if(!draftReady)return;try{sessionStorage.setItem('fivegen:idea:'+(conversation?.id||'new'),message);}catch{}},[message,conversation?.id,draftReady]);
  useEffect(()=>{const handler=(event:BeforeUnloadEvent)=>{if(!leavingWorkspace.current&&(dirty||childDirty||childBusy||busy)){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty,childDirty,childBusy,busy]);
  function navigate(action:()=>void){
    if(busyRef.current||childBusy||editorSaves?.registry.isBusy()){toast.info('Wait for the current operation to finish.');return;}
    if(editorSaves?.registry.hasDirty()){routeRevision.current++;editorSaves.requestNavigation(action);return;}
    if(childDirty){toast.info('Save your changes in this panel before moving on.');return;}
    routeRevision.current++;action();
  }
  function editMessage(value:string){routeRevision.current++;setMessage(value);}
  function replaceRoute(tab?:EditorTab,id?:string){window.history.replaceState(null,'',id?'/?project='+encodeURIComponent(id)+'&area='+(tab||'content'):'/');}
  function changeView(next:View){navigate(()=>{
    setError('');setView(next);setProduct(null);if(next==='create'){setConversation(null);setMessage(readMessageDraft(null));}window.history.replaceState(null,'',next==='create'?'/':'/?view='+next);
    window.scrollTo({top:0,left:0,behavior:'instant'});
  });}
  function newIdea(){leaveWorkspace('/build/new');}
  function removeDeletedProduct(id:string){
    setWorkspace(current=>current?{...current,products:current.products.filter(item=>item.id!==id),builders:current.builders?.filter(item=>item.productId!==id),fileSales:current.fileSales?.filter(item=>item.productId!==id)}:current);
    if(product?.id===id){setProduct(null);setBaseline('');setView('library');window.history.replaceState(null,'','/?view=library');}
    toast.success('Product deleted.');void load();
  }
  function leaveWorkspace(path:string,clearDrafts=false){navigate(()=>{
    if(clearDrafts){clearWorkspaceDrafts();void clearWorkspaceAttachmentDrafts().finally(()=>{leavingWorkspace.current=true;location.assign(path);});return;}
    leavingWorkspace.current=true;
    location.assign(path);
  });}
  function isFileSale(p:Product){return !!workspace?.fileSales?.some(sale=>sale.productId===p.id);}
  function openProduct(p:Product,tab:EditorTab='page'){navigate(()=>{
    const destination=workspaceProductDestination(p,workspace?.builders,workspace?.fileSales);
    if(destination&&!marketingTabs.includes(tab)&&!(isFileSale(p)&&tab==='page')){leavingWorkspace.current=true;location.assign(destination+(destination.startsWith('/build/')&&tab!=='page'?'?area='+encodeURIComponent(tab):isFileSale(p)&&tab==='commerce'?'?stage=1':''));return;}
    if(isFileSale(p)&&tab!=='page'&&!marketingTabs.includes(tab)){
      leavingWorkspace.current=true;location.assign(`/sell/${encodeURIComponent(p.id)}${tab==='commerce'?'?stage=1':''}`);return;
    }
    receiveProduct(p);setEditorTab(tab);setPageMode('creator');setPageTab('home');setEditingPage(0);setView('library');setError('');replaceRoute(tab,p.id);
  });}
  function openHubMarketing(productId:string,tool:MarketingTab){const selected=workspace?.products.find(item=>item.id===productId&&!item.archivedAt);if(selected&&marketingTabs.includes(tool))openProduct(selected,tool);}
  function openProductId(id:string){const found=workspace?.products.find(item=>item.id===id);if(found)openProduct(found);}
  function openPage(mode:'creator'|'member',tab:'home'|'content'|'reviews'='home',customize=false){if(product&&workspace?.builders?.some(builder=>builder.productId===product.id)){leaveWorkspace(`/build/${encodeURIComponent(product.id)}?area=page&mode=${mode}&tab=${tab}${customize?'&customize=1':''}`);return;}navigate(()=>{setEditorTab('page');setPageMode(mode);setPageTab(tab);setEditingPage(customize?Date.now():0);setView('library');replaceRoute('page',product?.id);});}
  function openProductDetails(){if(product&&isFileSale(product)){leaveWorkspace(`/sell/${encodeURIComponent(product.id)}?area=details`);return;}if(product&&workspace?.builders?.some(builder=>builder.productId===product.id)){leaveWorkspace(`/build/${encodeURIComponent(product.id)}?area=details`);return;}navigate(()=>{setEditorTab('content');setProductDetailsOpen(true);replaceRoute('content',product?.id);});}
  function openProductDestination(destination:ProductDestination){
    if(!product)return;
    if(workspace?.builders?.some(item=>item.productId===product.id)){leaveWorkspace(productDestinationPath(product.id,destination));return;}
    if(destination==='sales-page'){openPage('creator','home',true);return;}
    if(destination==='marketing'){switchTab('dashboard');return;}
    if(destination==='content'){switchTab('content');return;}
    if(destination==='commerce'){switchTab('commerce');return;}
    navigate(()=>{const tab:EditorTab=destination==='settings'?'settings':destination==='customers'?'customers':'overview';setEditorTab(tab);if(tab==='settings')setProductDetailsOpen(true);replaceRoute(tab,product.id);setView('library');});
  }
  function syncProductIcon(iconUploadId:string|null){if(!product)return;const id=product.id;setWorkspace(current=>current?{...current,products:current.products.map(item=>item.id===id?{...item,pageIconUploadId:iconUploadId}:item)}:current);setProduct(current=>current?.id===id?{...current,pageIconUploadId:iconUploadId}:current);setBaseline(current=>current?JSON.stringify({...JSON.parse(current),pageIconUploadId:iconUploadId}):current);}
  function switchTab(tab:EditorTab){if(tab==='page'){openPage('creator');return;}if(product&&workspace?.builders?.some(builder=>builder.productId===product.id)&&['content','commerce','files','media'].includes(tab)){leaveWorkspace(`/build/${encodeURIComponent(product.id)}?area=${tab==='files'?'resources':tab==='commerce'?'commerce':tab==='media'?'appearance':tab}`);return;}if(product&&isFileSale(product)&&!marketingTabs.includes(tab)){leaveWorkspace(`/sell/${encodeURIComponent(product.id)}${tab==='commerce'?'?stage=1':''}`);return;}navigate(()=>{setEditorTab(tab);setView('library');replaceRoute(tab,product?.id);});}
  function resolveMarketingTab(tab:MarketingTab){setEditorTab(tab);replaceRoute(tab,product?.id);}
  function openConversation(id:string){navigate(()=>{setDraftReady(false);setBusy('history');busyRef.current=true;void request<{conversation:AssistantConversation;remaining:number}>('/api/studio/assistant?id='+encodeURIComponent(id)).then(data=>{setConversation(data.conversation);if(user)rememberChat(user.email,data.conversation.id);setMessage(readMessageDraft(data.conversation.id));setRemaining(data.remaining);setProduct(null);setView('create');setError('');window.history.replaceState(null,'','/?conversation='+encodeURIComponent(id));}).catch(e=>setError(e.message)).finally(()=>{setDraftReady(true);setBusy('');busyRef.current=false;});});}
  function newChat(){navigate(()=>{void deleteWorkspaceAttachmentDraft(workspaceAttachmentDraftKey(user?.email||'guest'));try{sessionStorage.removeItem('fivegen:idea:new');sessionStorage.removeItem('fivegen:workspace-chat:new');}catch{}if(user){rememberChat(user.email,null);try{sessionStorage.removeItem(`fivegen:assistant-request:${user.email}:new`);}catch{}}setConversation(null);setMessage('');setProduct(null);setView('create');setError('');window.history.replaceState(null,'','/?view=create');window.scrollTo({top:0,behavior:'instant'});});}
  function resumeChat(){
    if(!conversation&&user){let id='';try{id=sessionStorage.getItem('fivegen:last-assistant-conversation:'+user.email)||'';}catch{}if(/^[a-f0-9-]{36}$/i.test(id)){openConversation(id);return;}}
    navigate(()=>{setProduct(null);setView('create');setError('');window.history.replaceState(null,'',conversation?'/?conversation='+encodeURIComponent(conversation.id):'/?view=create');});
  }
  async function send(promptValue=message,attachmentIds:string[]=[],permission?:AICreditPermission):Promise<boolean>{
    if(!permission?.allowGeneration){setError('Review the AI step and approve its cost before sending.');return false;}
    if(attachmentIds.length>4||new Set(attachmentIds).size!==attachmentIds.length)return false;const prompt=promptValue.trim()||(attachmentIds.length?'Help me with these attached files.':'');if(busyRef.current||prompt.length<1||prompt.length>3000)return false;
    if(!user){location.assign('/signin-with-chatgpt?return_to='+encodeURIComponent('/?view=create'));return false;}
    const pendingKey=`fivegen:assistant-request:${user.email}:${conversation?.id||'new'}`;
    type Turn={id:string;requestId:string;message:string;attachmentIds:string[];expectedUpdatedAt:number;allowGeneration:true;maxCredits:number;timezone:string};
    let payload:Turn={id:conversation?.id||crypto.randomUUID(),requestId:crypto.randomUUID(),message:prompt,attachmentIds:[...attachmentIds],expectedUpdatedAt:conversation?.updatedAt||0,allowGeneration:true,maxCredits:permission.maxCredits,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'};
    try{const pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null') as Turn|null;if(pending?.message===prompt&&JSON.stringify(pending.attachmentIds||[])===JSON.stringify(attachmentIds)&&pending.expectedUpdatedAt===payload.expectedUpdatedAt&&(!conversation||pending.id===conversation.id))payload={...pending,allowGeneration:true,maxCredits:permission.maxCredits};sessionStorage.setItem(pendingKey,JSON.stringify(payload));}catch{/* Retry protection also works on the server when storage is unavailable. */}
    const draft=message;routeRevision.current++;busyRef.current=true;setBusy('planning');setError('');setSent(prompt);setMessage('');
    try{const data=await request<{conversation:AssistantConversation;remaining:number}>('/api/studio/assistant',payload);setConversation(data.conversation);if(user)rememberChat(user.email,data.conversation.id);window.history.replaceState(null,'','/?conversation='+encodeURIComponent(data.conversation.id));setRemaining(data.remaining);try{sessionStorage.removeItem(pendingKey);sessionStorage.removeItem('fivegen:idea:new');}catch{}void load();return true;}
    catch(e){
      const {status,requestState}=e as Error&{status?:number;requestState?:string};
      if(status===409||status===402){
        try{const data=await request<{conversation:AssistantConversation;remaining:number}>('/api/studio/assistant?id='+encodeURIComponent(payload.id));if(requestState==='pending'){try{const resolvedKey=`fivegen:assistant-request:${user.email}:${data.conversation.id}`;sessionStorage.setItem(resolvedKey,JSON.stringify(payload));if(resolvedKey!==pendingKey)sessionStorage.removeItem(pendingKey);}catch{}}if(!conversation&&user)await moveWorkspaceAttachmentDraft(workspaceAttachmentDraftKey(user.email),workspaceAttachmentDraftKey(user.email,data.conversation.id));setConversation(data.conversation);if(user)rememberChat(user.email,data.conversation.id);setRemaining(data.remaining);window.history.replaceState(null,'','/?conversation='+encodeURIComponent(data.conversation.id));if(data.conversation.messages.some(item=>item.id===payload.requestId)){try{sessionStorage.removeItem(pendingKey);}catch{}void load();return true;}}catch{/* Preserve the original error and draft. */}
      }
      if(status&&(status!==409||requestState!=='pending'))try{sessionStorage.removeItem(pendingKey);}catch{}
      setError((e as Error).message);setMessage(draft);return false;
    }finally{setBusy('');setSent('');busyRef.current=false;}
  }
  async function approveStep(stepId:string,decision:'approve'|'skip',permission?:AICreditPermission):Promise<boolean>{
    if(!user||!conversation?.workflow||busyRef.current)return false;
    routeRevision.current++;busyRef.current=true;setBusy('action:'+stepId);setError('');
    try{const data=await request<{conversation:AssistantConversation}>('/api/studio/assistant/actions',{conversationId:conversation.id,planId:conversation.workflow.id,stepId,expectedUpdatedAt:conversation.updatedAt,decision,requestId:crypto.randomUUID(),...permission});setConversation(data.conversation);if(user)rememberChat(user.email,data.conversation.id);void load();return true;}
    catch(e){setError((e as Error).message);void load();try{const data=await request<{conversation:AssistantConversation;remaining:number}>('/api/studio/assistant?id='+encodeURIComponent(conversation.id));setConversation(data.conversation);if(user)rememberChat(user.email,data.conversation.id);setRemaining(data.remaining);const recovered=data.conversation.workflow?.id===conversation.workflow.id&&data.conversation.workflow.steps.find(step=>step.id===stepId)?.status===(decision==='approve'?'completed':'skipped');if(recovered){setError('');void load();return true;}}catch{/* Keep the reviewed plan if refresh is interrupted. */}return false;}
    finally{setBusy('');busyRef.current=false;}
  }
  async function create(manualMode=false){
    if(busyRef.current)return;if(!user){location.assign('/signin-with-chatgpt?return_to=%2F%3Fview%3Dcreate');return;}
    routeRevision.current++;busyRef.current=true;setBusy('create');setError('');
    try{const data=await request<{product:Product}>('/api/products',manualMode?{title:manualTitle,description:'Add your product description and the outcome you help people achieve.',audience:'Define your audience',format:manualFormat,price:0,color:'orange',generationMode:'manual'}:{conversationId:conversation?.id,expectedUpdatedAt:conversation?.updatedAt});await request(`/api/builder/${data.product.id}`,{},'POST');leavingWorkspace.current=true;location.assign(`/build/${encodeURIComponent(data.product.id)}`);}
    catch(e){setError((e as Error).message);}finally{setBusy('');busyRef.current=false;}
  }
  const save=useCallback(async()=>{
    if(!product)return false;if(!dirty)return true;if(busyRef.current)return false;
    busyRef.current=true;setBusy('save');setError('');
    try{const data=await request<{product:Product}>(`/api/products/${product.id}`,{title:product.title,description:product.description,audience:product.audience,format:product.format,price:product.price,color:product.color,content:product.content,instructions:product.instructions,language:product.language,quality:product.quality,angle:product.angle,duration:product.duration,status:'draft',expectedUpdatedAt:product.updatedAt},'PATCH');receiveProduct(data.product);toast.success('Product saved');return true;}
    catch(e){setError((e as Error).message);return false;}finally{setBusy('');busyRef.current=false;}
  },[product,dirty,receiveProduct]);
  useRegisterEditorSave({label:'Sales page draft',dirty:editorTab==='page'&&childDirty,busy:editorTab==='page'&&childBusy,priority:20,save:async()=>{if(!pageSaver.current)return false;try{await pageSaver.current();return true;}catch(reason){setError((reason as Error).message);return false;}}});
  useRegisterEditorSave({label:'Product content',dirty,busy:!!busy,save,priority:30});
  const costs=workspace?.textCost||10,unlimited=!!workspace?.credits.unlimited;
  const label=product?product.title:{create:'Home',overview:'Dashboard',library:'My products',marketing:'Marketing',design:'Design',crm:'Your CRM',credits:'AI credits',connections:'Connected assistants','creator-library':'Creator library',domains:'Domains',calendar:'Calendar',admin:'Platform settings'}[view];
  return <div onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const anchor=(event.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement|null;if(!anchor||anchor.target==='_blank'||anchor.hasAttribute('download')||anchor.getAttribute('href')?.startsWith('#'))return;const url=new URL(anchor.href,location.href);if(url.origin!==location.origin||(!dirty&&!childDirty&&!editorSaves?.registry.hasDirty()&&!editorSaves?.registry.isBusy()))return;event.preventDefault();leaveWorkspace(url.pathname+url.search+url.hash);}} className={`gen-app growth-app${view==='create'&&!product?' gen-chat-active':''}`}>
    <Toaster position="bottom-right" richColors/>
    {user&&view!=='calendar'&&view!=='create'&&!(product&&editorTab==='funnel-builder')&&<GenCompanion defaultMinimized={!!product} mood={busy==='planning'||childBusy?'thinking':busy?'helping':error?'concerned':'idle'} status={busy==='planning'?'Thinking through your next step…':busy==='create'?'Getting your workspace ready…':''} onOpen={()=>leaveWorkspace('/?view=create&planning=1')}/>}
    <div className="gen-main">
      <WorkspaceNavigation user={user} productContext={!!product} view={product&&marketingTabs.includes(editorTab)?'marketing':view} label={label} admin={!!workspace?.admin} products={(workspace?.products||[]).filter(item=>!item.archivedAt)} creditsLabel={unlimited?'Unlimited':workspace?`${workspace.credits.total.toLocaleString()} credits`:'AI credits'} history={history} onCreate={newIdea} onChat={resumeChat} onHome={()=>leaveWorkspace('/')} onView={changeView} onProduct={openProductId} onConversation={openConversation} onVisit={path=>leaveWorkspace(path)} onSignOut={()=>leaveWorkspace('/signout-with-chatgpt',true)}/>
      <div className={`workspace-shell ${product?'has-product':''}`}><WorkspaceProductRail products={workspace?.products||[]} selectedId={product?.id} onProduct={openProductId} onLibrary={()=>changeView('library')} onCreate={newIdea}/>{product&&<WorkspaceProductSidebar product={{...product,pageIconUploadId:workspace?.products.find(item=>item.id===product.id)?.pageIconUploadId??product.pageIconUploadId}} products={workspace?.products||[]} tab={(['overview','customers','settings'].includes(editorTab)?'content':editorTab) as ProductArea} activeDestination={editorTab==='overview'?'overview':editorTab==='customers'?'customers':editorTab==='settings'?'settings':undefined} onDestination={openProductDestination} mode={pageMode} onProduct={openProductId} onTab={switchTab} onMode={mode=>{if(mode==='member')leaveWorkspace(`/build/${encodeURIComponent(product.id)}?area=content&mode=member`);else openPage('creator');}} onCustomize={()=>openPage('creator','home',true)} onReviews={()=>openPage('creator','reviews')}/>}<div className="workspace-stage"><main className="workspace-content" id="workspace-content" tabIndex={-1}>
      {error&&<div className="gen-error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
      {loading||busy==='history'?<div className="gen-loading"><Loader2 size={28} className="spin"/><p>Opening your workspace…</p></div>:product?<div className={`gen-editor gen-enter ${editorTab==='page'?'is-product-page':editorTab==='funnel-builder'?'gen-marketing-editor gen-funnel-editor':marketingTabs.includes(editorTab)?'gen-marketing-editor':''}`}>
        <div className="gen-editor-heading"><button className="gen-back" onClick={()=>changeView('library')}><ArrowLeft size={16}/>All products</button>{!marketingTabs.includes(editorTab)&&<div className="gen-save-actions"><span aria-live="polite">{busy==='save'?'Saving…':error&&dirty?'Couldn’t save · changes kept':dirty?'Unsaved changes':'Saved privately'}</span><button className="button secondary" disabled={!dirty||!!busy||childBusy} onClick={()=>void save()}>{busy==='save'?<Loader2 className="spin" size={15}/>:<Check size={15}/>}Save product</button><button className="button secondary" disabled={!!busy||childBusy||(!product.content.sections.some(s=>s.body.trim())&&!product.content.files?.some(f=>f.content.trim()))} onClick={async()=>{if(await save())location.assign(`/api/products/${product.id}/bundle`);}}><ArrowDownToLine size={15}/>Download</button></div>}</div>
        <div className="gen-editor-title"><span className="gen-tag">{product.format} <span>·</span> {marketingTabs.includes(editorTab)?'Marketing':'Product'}</span><h1>{product.title}</h1><p>{marketingTabs.includes(editorTab)?'Plan your content, prepare your assets and follow up with the right people.':'Your content and delivery, together in one place.'}</p></div>
        <div className="workspace-groups" aria-label="Workspace areas"><button className={!marketingTabs.includes(editorTab)?'active':''} onClick={()=>switchTab('content')}><BookOpen size={16}/>Product</button><button className={marketingTabs.includes(editorTab)?'active':''} onClick={()=>switchTab('dashboard')}><Megaphone size={16}/>Marketing</button></div>
        {marketingTabs.includes(editorTab)?<MarketingWorkspace key={product.id} product={product} tab={editorTab as MarketingTab} aiReady={!!workspace?.capabilities.ai} cost={costs} unlimited={unlimited} onTab={switchTab} onResolveTab={resolveMarketingTab} onUpdate={()=>void load()} onDirtyChange={setChildDirty} onBusyChange={setChildBusy}/>:<>
        <div className="gen-editor-tabs" role="tablist" aria-label="Product workspace">{tabs.filter(([key])=>!workspace?.builders?.some(builder=>builder.productId===product.id)||key==='media').map(([key,Icon,title])=><button role="tab" aria-selected={editorTab===key} key={key} onClick={()=>switchTab(key)}><Icon size={17}/>{title}</button>)}</div>
        <div role="tabpanel" className="gen-tab-content" key={product.id+editorTab}>
          {editorTab==='overview'&&<GrowthDashboard productId={product.id}/>}
          {editorTab==='customers'&&<><p className="product-scope-note">Customers for {product.title}. Open global Customers to see other products.</p><GrowthCRM productId={product.id} onDirtyChange={setChildDirty} onBusyChange={setChildBusy}/></>}
          {editorTab==='page'&&<ProductPageStudio product={product} mode={pageMode} onModeChange={mode=>openPage(mode)} initialTab={pageTab} editingRequested={editingPage} onBrandingChange={syncProductIcon} onProductDetails={openProductDetails} onRegisterSave={registerPageSaver} onDirtyChange={setChildDirty} onBusyChange={setChildBusy}/>}
          {(editorTab==='content'||editorTab==='settings')&&<><details className="growth-product-details" open={productDetailsOpen} onToggle={event=>setProductDetailsOpen(event.currentTarget.open)}><summary>Product details</summary><fieldset disabled={!!busy}><label>Product name<input value={product.title} maxLength={100} onChange={e=>setProduct({...product,title:e.target.value})}/></label><label>Who it is for<input value={product.audience} maxLength={300} onChange={e=>setProduct({...product,audience:e.target.value})}/></label><label>Product description<textarea value={product.description} rows={3} maxLength={12000} onChange={e=>setProduct({...product,description:e.target.value})}/></label></fieldset></details>{editorTab==='content'&&<CreatorContent product={product} onChange={setProduct} disabled={!!busy} onBusyChange={setChildBusy}/>}</>}
          {editorTab==='settings'&&<ProductDeletePanel product={product} disabled={dirty||!!busy||childDirty||childBusy} onDeleted={()=>removeDeletedProduct(product.id)}/>}
          {editorTab==='commerce'&&<CommercePanel product={product} onDirtyChange={setChildDirty} onBusyChange={setChildBusy}/>}
          {editorTab==='files'&&<fieldset disabled={!!busy}><FileWorkbench product={product} onChange={setProduct}/><div className="gen-download-links">{product.content.files?.map((f,i)=><button className="button secondary" key={i} disabled={dirty} onClick={()=>location.assign(`/api/products/${product.id}/files/${i}`)}><ArrowDownToLine size={15}/>{f.name}</button>)}{dirty&&<p>Save your changes before downloading updated resources.</p>}</div></fieldset>}
          {editorTab==='media'&&<MediaStudio key={product.id} product={product} onSetup={()=>changeView('credits')}/>}
        </div></>}
      </div>:view==='create'?<WorkspaceChat conversation={conversation} message={message} sent={sent} busy={busy} name={user?.name||'You'} remaining={remaining} cost={costs} unlimited={unlimited} productRunsRemaining={workspace?.credits.products.remaining} credits={workspace?.credits.total} aiReady={!!workspace?.capabilities.ai} onMessage={editMessage} attachmentScope={user?.email||'guest'} onBusyChange={setChildBusy} onAuthRequired={()=>{leavingWorkspace.current=true;location.assign('/welcome?return_to='+encodeURIComponent(location.pathname+location.search));}} onSend={send} onAction={approveStep} onNewChat={newChat} products={workspace?.products} onVisit={path=>leaveWorkspace(path)}/>:view==='marketing'?<WorkspaceMarketingHub products={workspace?.products||[]} signedIn={!!user} onOpen={openHubMarketing} onVisit={path=>leaveWorkspace(path)} onHome={()=>changeView('create')}/>:view==='design'?<WorkspaceDesignHub products={workspace?.products||[]} builders={workspace?.builders} signedIn={!!user} onVisit={path=>leaveWorkspace(path)} onHome={()=>changeView('create')}/>:view==='domains'?<WorkspaceDomains signedIn={!!user} onVisit={path=>leaveWorkspace(path)}/>:view==='library'?<WorkspaceProductLibrary products={workspace?.products||[]} builders={workspace?.builders} files={workspace?.fileSales} onDeletedProduct={removeDeletedProduct} onOpen={p=>{const destination=workspaceProductDestination(p,workspace?.builders,workspace?.fileSales);if(destination)leaveWorkspace(destination);else openProduct(p,'content');}} onCreateFrom={source=>leaveWorkspace('/build/new?source='+source)}/>:<div className={`gen-settings gen-enter${view==='calendar'?' gen-calendar-host':''}`}>{view==='overview'?(user?<GrowthDashboard/>:<div className="gen-empty"><TrendingUp size={32}/><h2>See your launch grow.</h2><p>Sign in to track visits, customers, and sales.</p><a className="button primary" href="/signin-with-chatgpt?return_to=%2F%3Fview%3Doverview">Sign in</a></div>):view==='crm'?(user?<GrowthCRM onDirtyChange={setChildDirty} onBusyChange={setChildBusy}/>:<div className="gen-empty"><Users size={32}/><h2>Your next customer starts here.</h2><p>Sign in to capture leads and manage your follow-up.</p><a className="button primary" href="/signin-with-chatgpt?return_to=%2F%3Fview%3Dcrm">Sign in</a></div>):view==='calendar'?(user?<WorkspaceCalendar products={workspace?.products||[]}/>:<div className="gen-empty"><h2>Your schedule, in one place.</h2><p>Sign in to plan content and events across your accounts.</p><a className="button primary" href="/signin-with-chatgpt?return_to=%2F%3Fview%3Dcalendar">Sign in</a></div>):view==='creator-library'?<CreatorLibrary products={workspace?.products||[]} aiReady={!!workspace?.capabilities.ai} cost={costs} unlimited={unlimited} onUpdate={()=>void load()} onDirtyChange={setChildDirty} onBusyChange={setChildBusy}/>:view==='credits'?<CreditsPanel signedIn={!!user}/>:view==='connections'?<ConnectionsPanel signedIn={!!user}/>:workspace?.admin?<AIProviders signedIn={!!user} onUpdate={()=>void load()}/>:null}</div>}
      </main>
      <footer className="gen-footer"><span>FiveGen</span><div><a href="/pricing">Plans & credits</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refund">Refunds</a><a href="mailto:kamzewac@gmail.com">Contact</a></div></footer></div></div>
    </div>
    <Dialog open={manual} onOpenChange={v=>{if(!busy)setManual(v);}}><DialogContent><DialogHeader><DialogTitle>Create your product, your way.</DialogTitle><DialogDescription>Bring your own lessons, recordings, or resources. Set up your growth tools whenever you’re ready.</DialogDescription></DialogHeader><form className="gen-manual-form" onSubmit={e=>{e.preventDefault();void create(true);}}><label>Product name<input autoFocus minLength={3} maxLength={100} required value={manualTitle} onChange={e=>setManualTitle(e.target.value)} placeholder="Give your expertise a home"/></label><label>Product type<select value={manualFormat} onChange={e=>setManualFormat(e.target.value as typeof manualFormat)}>{studioFormats.map(f=><option key={f}>{f}</option>)}</select></label><p className="growth-muted">{productTypes.find(t=>t.value===manualFormat)?.description}</p><button className="button primary full" disabled={!!busy||manualTitle.trim().length<3}>{busy==='create'?<Loader2 size={16} className="spin"/>:<Plus size={16}/>}Create product</button></form></DialogContent></Dialog>

  </div>;
}
