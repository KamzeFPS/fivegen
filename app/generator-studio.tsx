'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Banknote,Megaphone,TrendingUp,ArrowDownToLine,ArrowLeft,ArrowRight,BookOpen,Check,FileText,ImagePlus,Loader2,Plus,ShieldCheck,Sparkles,Upload,Users,X} from 'lucide-react';
import {Toaster,toast} from 'sonner';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {AIProviders,MediaStudio} from './ai-components';
import {CreditsPanel} from './credits-panel';
import {ConnectionsPanel} from './connections-panel';
import {FileWorkbench} from './file-workbench';
import {StudioChat} from './studio-chat';
import {CreatorContent} from './creator-content';
import {CreatorLibrary} from './creator-library';
import {GrowthCRM} from './growth-crm';
import {GrowthDashboard} from './growth-dashboard';
import CommercePanel from './commerce-panel';
import {MarketingWorkspace,type MarketingTab} from './marketing-workspace';
import {WorkspaceNavigation} from './workspace-navigation';
import {WorkspaceProductRail,WorkspaceProductSidebar,productDestinationPath,type ProductArea,type ProductDestination} from './workspace-product-navigation';
import {ProductPageStudio} from './product-page-studio';
import {WorkspaceProductLibrary} from './workspace-product-library';
import {GenCompanion} from './gen-companion';
import {EditorSaveProvider,useEditorSaveRegistry,useRegisterEditorSave} from './editor-save-registry';
import {productTypes,type Product} from '@/lib/product';
import {studioFormats,type StudioConversation} from '@/lib/studio-plan';
import type {CreditBalance} from '@/lib/credit-policy';
import {clearWorkspaceDrafts} from '@/lib/workspace-drafts';
import {initialWorkspaceView,workspaceProductDestination,type WorkspaceBuilderSummary,type WorkspaceFileSummary} from '@/lib/workspace-library';

type Workspace={admin:boolean;products:Product[];fileSales?:WorkspaceFileSummary[];builders?:WorkspaceBuilderSummary[];credits:CreditBalance;textCost:number;capabilities:{ai:boolean;media:boolean}};
type View='create'|'overview'|'library'|'crm'|'credits'|'connections'|'creator-library'|'admin';
type EditorTab=ProductArea|MarketingTab|'overview'|'customers'|'settings';
type HistoryItem={id:string;title:string;product_id:string|null;updated_at:number};
async function request<T>(url:string,body?:unknown,method=body?'POST':'GET'):Promise<T>{
  const response=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  if(response.status===401||response.status===428){location.assign('/welcome?return_to='+encodeURIComponent(location.pathname+location.search));throw new Error('Please sign in to continue.');}
  const data=await response.json() as T&{error?:string};if(!response.ok)throw new Error(data.error||'Something went wrong. Please try again.');return data;
}
function readMessageDraft(id?:string|null){try{return sessionStorage.getItem('fivegen:idea:'+(id||'new'))||'';}catch{return '';}}
const marketingTabs:EditorTab[]=['dashboard','results','voice','vsl','funnel','campaigns','automations','offer'];
const tabs:[EditorTab,typeof FileText,string][]=[['page',BookOpen,'Product home'],['content',BookOpen,'Content'],['commerce',Banknote,'Checkout & access'],['files',FileText,'Resources'],['media',ImagePlus,'Creative assets']];
function editorArea(area:string|null):EditorTab{if(['overview','customers','settings'].includes(area||''))return area as EditorTab;return marketingTabs.includes(area as EditorTab)?area as EditorTab:tabs.some(([key])=>key===area)?area as EditorTab:'page';}

export default function GeneratorStudio({user}:{user:{name:string;email:string}|null}){return <EditorSaveProvider><GeneratorWorkspace user={user}/></EditorSaveProvider>;}
function GeneratorWorkspace({user}:{user:{name:string;email:string}|null}){
  const editorSaves=useEditorSaveRegistry();
  const pageSaver=useRef<(()=>Promise<void>)|null>(null);
  const registerPageSaver=useCallback((save:(()=>Promise<void>)|null)=>{pageSaver.current=save;},[]);
  const [planning,setPlanning]=useState(false);
  const [workspace,setWorkspace]=useState<Workspace|null>(null),[loading,setLoading]=useState(!!user),[error,setError]=useState('');
  const [view,setView]=useState<View>('create'),[conversation,setConversation]=useState<StudioConversation|null>(null),[history,setHistory]=useState<HistoryItem[]>([]),[remaining,setRemaining]=useState(20);
  const [draftReady,setDraftReady]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(''),[sent,setSent]=useState('');
  const [product,setProduct]=useState<Product|null>(null),[baseline,setBaseline]=useState(''),[editorTab,setEditorTab]=useState<EditorTab>('content');
  const [pageMode,setPageMode]=useState<'creator'|'member'>('creator'),[pageTab,setPageTab]=useState<'home'|'content'|'reviews'>('home'),[editingPage,setEditingPage]=useState(0),[productDetailsOpen,setProductDetailsOpen]=useState(false);
  const [childDirty,setChildDirty]=useState(false),[childBusy,setChildBusy]=useState(false);
  const [manual,setManual]=useState(false),[manualTitle,setManualTitle]=useState(''),[manualFormat,setManualFormat]=useState<(typeof studioFormats)[number]>('Video course');
  const inputRef=useRef<HTMLTextAreaElement>(null),busyRef=useRef(false),initialRoute=useRef(false),routeRevision=useRef(0),leavingWorkspace=useRef(false);
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
        user&&id?request<{conversation:StudioConversation;remaining:number}>('/api/studio/conversations?id='+encodeURIComponent(id)):Promise.resolve(null),
      ]);
      if(!active)return;
      const data=workspaceResult.status==='fulfilled'?workspaceResult.value:null;
      if(data)setWorkspace(data);
      if(plansResult.status==='fulfilled'&&plansResult.value){setHistory(plansResult.value.conversations);setRemaining(plansResult.value.remaining);}
      if(!initialRoute.current&&routeRevision.current===revision){
        initialRoute.current=true;
        setPlanning(query.get('planning')==='1');
        setMessage(draft);
        if(conversationResult.status==='fulfilled'&&conversationResult.value){setConversation(conversationResult.value.conversation);setRemaining(conversationResult.value.remaining);}
        const p=data?.products.find(value=>value.id===query.get('project'));
        const requestedView=query.get('view')||'';
        if(query.has('billing'))setView('credits');else if(query.get('connect')==='mcp')setView('connections');
        else if(['marketing','vsl','funnel'].includes(requestedView)){
          setView('library');
          if(!p)window.history.replaceState(null,'','/?view=library');
        }
        else setView(initialWorkspaceView(!!user,query));
        if(p){
          if(data?.builders?.some(builder=>builder.productId===p.id)&&!marketingTabs.includes(editorArea(query.get('area')))){const kept=new URLSearchParams();for(const key of ['area','mode','tab','customize'])if(query.has(key))kept.set(key,query.get(key)!);leavingWorkspace.current=true;location.replace(`/build/${encodeURIComponent(p.id)}${kept.size?'?'+kept:''}`);return;}
          if(data?.fileSales?.some(sale=>sale.productId===p.id)&&editorArea(query.get('area'))!=='page'&&!marketingTabs.includes(editorArea(query.get('area')))){
            leavingWorkspace.current=true;location.replace(`/sell/${encodeURIComponent(p.id)}${editorArea(query.get('area'))==='commerce'?'?stage=1':''}`);return;
          }else{const tab=editorArea(query.get('area'));receiveProduct(p);setEditorTab(tab);setPageMode(query.get('mode')==='member'?'member':'creator');setPageTab(query.get('tab')==='reviews'?'reviews':query.get('tab')==='content'?'content':'home');if(query.get('customize')==='1')setEditingPage(Date.now());setView('library');}
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
    setError('');setView(next);setProduct(null);window.history.replaceState(null,'',next==='create'?'/':'/?view='+next);
    window.scrollTo({top:0,left:0,behavior:'instant'});
  });}
  function newIdea(){leaveWorkspace('/build/new');}
  function buildFromIdea(){try{sessionStorage.setItem('fivegen:builder-new-idea',message);}catch{}leaveWorkspace('/build/new?source=ai');}
  function continueFromIdea(){if(message.trim().length<3||busyRef.current)return;if(planning)void send();else buildFromIdea();}
  function leaveWorkspace(path:string,clearDrafts=false){navigate(()=>{
    if(clearDrafts)clearWorkspaceDrafts();
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
  function openConversation(id:string){navigate(()=>{setDraftReady(false);setBusy('history');busyRef.current=true;void request<{conversation:StudioConversation;remaining:number}>('/api/studio/conversations?id='+encodeURIComponent(id)).then(data=>{setConversation(data.conversation);setMessage(readMessageDraft(data.conversation.id));setRemaining(data.remaining);setProduct(null);setView('create');setError('');window.history.replaceState(null,'','/?conversation='+encodeURIComponent(id));}).catch(e=>setError(e.message)).finally(()=>{setDraftReady(true);setBusy('');busyRef.current=false;});});}
  async function send(promptValue=message):Promise<boolean>{
    const prompt=promptValue.trim();if(busyRef.current||prompt.length<3||prompt.length>3000)return false;
    if(!user){location.assign('/signin-with-chatgpt?return_to='+encodeURIComponent(planning?'/?view=create&planning=1':'/?view=create'));return false;}
    const draft=message;routeRevision.current++;busyRef.current=true;setBusy('planning');setError('');setSent(prompt);setMessage('');
    try{const data=await request<{conversation:StudioConversation;remaining:number}>('/api/studio/conversations',{id:conversation?.id||crypto.randomUUID(),requestId:crypto.randomUUID(),message:prompt,expectedUpdatedAt:conversation?.updatedAt||0,maxCredits:remaining>0?0:workspace?.textCost||10});setConversation(data.conversation);window.history.replaceState(null,'','/?conversation='+encodeURIComponent(data.conversation.id));setRemaining(data.remaining);void load();return true;}
    catch(e){setError((e as Error).message);setMessage(draft);return false;}finally{setBusy('');setSent('');busyRef.current=false;}
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
  const label=product?product.title:{create:'Create your product',overview:'Dashboard',library:'My products',crm:'Your CRM',credits:'AI credits',connections:'Connected assistants','creator-library':'Creator library',admin:'Platform settings'}[view];
  return <div onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const anchor=(event.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement|null;if(!anchor||anchor.target==='_blank'||anchor.hasAttribute('download')||anchor.getAttribute('href')?.startsWith('#'))return;const url=new URL(anchor.href,location.href);if(url.origin!==location.origin||(!dirty&&!childDirty&&!editorSaves?.registry.hasDirty()&&!editorSaves?.registry.isBusy()))return;event.preventDefault();leaveWorkspace(url.pathname+url.search+url.hash);}} className={`gen-app growth-app ${view==='create'&&!product&&(conversation||sent)?'gen-chat-active':''}`}>
    <Toaster position="bottom-right" theme="dark" richColors/>
    {user&&<GenCompanion defaultMinimized={!!product} mood={busy==='planning'||childBusy?'thinking':busy?'helping':error?'concerned':view==='create'&&message.trim()?'curious':'idle'} status={busy==='planning'?'Thinking through your next step…':busy==='create'?'Getting your workspace ready…':''} onOpen={()=>{const composer=view==='create'?document.querySelector<HTMLTextAreaElement>('.chat-composer textarea, #creation-idea'):null;if(composer){composer.focus();composer.scrollIntoView({behavior:'auto',block:'center'});}else leaveWorkspace('/?view=create&planning=1');}}/>}
    <div className="gen-main">
      <WorkspaceNavigation user={user} view={view} label={label} admin={!!workspace?.admin} products={workspace?.products||[]} creditsLabel={unlimited?'Unlimited':workspace?`${workspace.credits.total.toLocaleString()} credits`:'AI credits'} history={history} onCreate={newIdea} onHome={()=>leaveWorkspace('/')} onView={changeView} onProduct={openProductId} onConversation={openConversation} onVisit={path=>leaveWorkspace(path)} onSignOut={()=>leaveWorkspace('/signout-with-chatgpt',true)}/>
      <div className={`workspace-shell ${product?'has-product':''}`}><WorkspaceProductRail products={workspace?.products||[]} selectedId={product?.id} onProduct={openProductId} onLibrary={()=>changeView('library')} onCreate={newIdea}/>{product&&<WorkspaceProductSidebar product={{...product,pageIconUploadId:workspace?.products.find(item=>item.id===product.id)?.pageIconUploadId??product.pageIconUploadId}} products={workspace?.products||[]} tab={(['overview','customers','settings'].includes(editorTab)?'content':editorTab) as ProductArea} activeDestination={editorTab==='overview'?'overview':editorTab==='customers'?'customers':editorTab==='settings'?'settings':undefined} onDestination={openProductDestination} mode={pageMode} onProduct={openProductId} onTab={switchTab} onMode={mode=>openPage(mode)} onCustomize={()=>openPage('creator','home',true)} onReviews={()=>openPage('creator','reviews')}/>}<div className="workspace-stage"><main className="workspace-content" id="workspace-content" tabIndex={-1}>
      {error&&<div className="gen-error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
      {loading||busy==='history'?<div className="gen-loading"><Loader2 size={28} className="spin"/><p>Opening your workspace…</p></div>:product?<div className={`gen-editor gen-enter ${editorTab==='page'?'is-product-page':marketingTabs.includes(editorTab)?'gen-marketing-editor':''}`}>
        <div className="gen-editor-heading"><button className="gen-back" onClick={()=>changeView('library')}><ArrowLeft size={16}/>All products</button>{!marketingTabs.includes(editorTab)&&<div className="gen-save-actions"><span aria-live="polite">{busy==='save'?'Saving…':error&&dirty?'Couldn’t save · changes kept':dirty?'Unsaved changes':'Saved privately'}</span><button className="button secondary" disabled={!dirty||!!busy||childBusy} onClick={()=>void save()}>{busy==='save'?<Loader2 className="spin" size={15}/>:<Check size={15}/>}Save product</button><button className="button secondary" disabled={!!busy||childBusy||(!product.content.sections.some(s=>s.body.trim())&&!product.content.files?.some(f=>f.content.trim()))} onClick={async()=>{if(await save())location.assign(`/api/products/${product.id}/bundle`);}}><ArrowDownToLine size={15}/>Download</button></div>}</div>
        <div className="gen-editor-title"><span className="gen-tag">{product.format} <span>·</span> {marketingTabs.includes(editorTab)?'Marketing':'Product'}</span><h1>{product.title}</h1><p>{marketingTabs.includes(editorTab)?'See how this product is doing. Add marketing tools when you need them.':'Your content and delivery, together in one place.'}</p></div>
        <div className="workspace-groups" aria-label="Workspace areas"><button className={!marketingTabs.includes(editorTab)?'active':''} onClick={()=>switchTab('content')}><BookOpen size={16}/>Product</button><button className={marketingTabs.includes(editorTab)?'active':''} onClick={()=>switchTab('dashboard')}><Megaphone size={16}/>Marketing</button></div>
        {marketingTabs.includes(editorTab)?<MarketingWorkspace key={product.id} product={product} tab={editorTab as MarketingTab} aiReady={!!workspace?.capabilities.ai} cost={costs} unlimited={unlimited} onTab={switchTab} onResolveTab={resolveMarketingTab} onUpdate={()=>void load()} onDirtyChange={setChildDirty} onBusyChange={setChildBusy}/>:<>
        <div className="gen-editor-tabs" role="tablist" aria-label="Product workspace">{tabs.filter(([key])=>!workspace?.builders?.some(builder=>builder.productId===product.id)||key==='media').map(([key,Icon,title])=><button role="tab" aria-selected={editorTab===key} key={key} onClick={()=>switchTab(key)}><Icon size={17}/>{title}</button>)}</div>
        <div role="tabpanel" className="gen-tab-content" key={product.id+editorTab}>
          {editorTab==='overview'&&<GrowthDashboard productId={product.id}/>}
          {editorTab==='customers'&&<><p className="product-scope-note">Customers for {product.title}. Open global Customers to see other products.</p><GrowthCRM productId={product.id} onDirtyChange={setChildDirty} onBusyChange={setChildBusy}/></>}
          {editorTab==='page'&&<ProductPageStudio product={product} mode={pageMode} onModeChange={mode=>openPage(mode)} initialTab={pageTab} editingRequested={editingPage} onBrandingChange={syncProductIcon} onProductDetails={openProductDetails} onRegisterSave={registerPageSaver} onDirtyChange={setChildDirty} onBusyChange={setChildBusy}/>}
          {(editorTab==='content'||editorTab==='settings')&&<><details className="growth-product-details" open={productDetailsOpen} onToggle={event=>setProductDetailsOpen(event.currentTarget.open)}><summary>Product details</summary><fieldset disabled={!!busy}><label>Product name<input value={product.title} maxLength={100} onChange={e=>setProduct({...product,title:e.target.value})}/></label><label>Who it is for<input value={product.audience} maxLength={300} onChange={e=>setProduct({...product,audience:e.target.value})}/></label><label>Product description<textarea value={product.description} rows={3} maxLength={12000} onChange={e=>setProduct({...product,description:e.target.value})}/></label></fieldset></details>{editorTab==='content'&&<CreatorContent product={product} onChange={setProduct} disabled={!!busy} onBusyChange={setChildBusy}/>}</>}
          {editorTab==='commerce'&&<CommercePanel product={product} onDirtyChange={setChildDirty} onBusyChange={setChildBusy}/>}
          {editorTab==='files'&&<fieldset disabled={!!busy}><FileWorkbench product={product} onChange={setProduct}/><div className="gen-download-links">{product.content.files?.map((f,i)=><button className="button secondary" key={i} disabled={dirty} onClick={()=>location.assign(`/api/products/${product.id}/files/${i}`)}><ArrowDownToLine size={15}/>{f.name}</button>)}{dirty&&<p>Save your changes before downloading updated resources.</p>}</div></fieldset>}
          {editorTab==='media'&&<MediaStudio key={product.id} product={product} onSetup={()=>changeView('credits')}/>}
        </div></>}
      </div>:view==='create'&&(conversation||sent)?<StudioChat key={conversation?.id||'new-chat'} conversation={conversation} message={message} sent={sent} busy={busy} name={user?.name||'You'} remaining={remaining} cost={costs} unlimited={unlimited} credits={workspace?.credits.total} allowance={workspace?.credits.products.remaining??3} aiReady={!!workspace?.capabilities.ai} onMessage={editMessage} onSend={send} onGenerate={()=>void create()} onOpenProduct={()=>{const p=workspace?.products.find(p=>p.id===conversation?.productId);if(p)openProduct(p);else void load();}}/>:view==='create'?<div className="gen-create gen-enter workspace-create-entry">
        <header className="creation-heading"><h1>{planning?'Not sure what to create?':'Create a product'}</h1><p>{planning?'We’ll help you find an idea and choose a product type.':'Turn an idea into a book, course, resource, or service.'}</p></header>
        <form className="creation-idea" onSubmit={event=>{event.preventDefault();continueFromIdea();}}>
          <label htmlFor="creation-idea"><Sparkles size={17}/>{planning?'What are you good at?':'Start with an idea'}</label>
          <textarea id="creation-idea" ref={inputRef} aria-label="Your product idea" placeholder={planning?'Tell us about your skills, experience, or who you’d like to help.':'What do you want to create, and who will it help?'} value={message} maxLength={3000} disabled={!!busy} onChange={event=>editMessage(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.nativeEvent.isComposing){event.preventDefault();continueFromIdea();}}}/>
          <div className="creation-idea-footer"><p>{planning?(unlimited?'Planning is included with your access.':remaining>0?`${remaining} free planning messages left this month.`:`${costs} AI credits per planning message.`):'Choose your product type next. Review the plan before you generate anything.'}</p><button type="submit" disabled={message.trim().length<3||!!busy}>{planning?'Help me choose':'Continue with AI'}<ArrowRight size={16}/></button></div>
        </form>
        <div className="creation-sources" aria-label="Other ways to create"><button type="button" disabled={!!busy} onClick={()=>leaveWorkspace('/build/new?source=upload')}><Upload size={19}/><span><strong>Upload existing content</strong><small>Bring your PDF, manuscript, lessons, or resources.</small></span><ArrowRight size={16}/></button><button type="button" disabled={!!busy} onClick={()=>leaveWorkspace('/build/new?source=manual')}><FileText size={19}/><span><strong>Start manually</strong><small>Choose a format and add your own content.</small></span><ArrowRight size={16}/></button></div>
        <p className="creation-private-note"><ShieldCheck size={14}/>Your work stays private until you publish.</p>
      </div>:view==='library'?<WorkspaceProductLibrary products={workspace?.products||[]} builders={workspace?.builders} files={workspace?.fileSales} onOpen={p=>{const destination=workspaceProductDestination(p,workspace?.builders,workspace?.fileSales);if(destination)leaveWorkspace(destination);else openProduct(p,'content');}} onCreateFrom={source=>leaveWorkspace('/build/new?source='+source)}/>:<div className="gen-settings gen-enter">{view==='overview'?(user?<GrowthDashboard/>:<div className="gen-empty"><TrendingUp size={32}/><h2>See your launch grow.</h2><p>Sign in to track visits, customers, and sales.</p><a className="button primary" href="/signin-with-chatgpt?return_to=%2F%3Fview%3Doverview">Sign in</a></div>):view==='crm'?(user?<GrowthCRM onDirtyChange={setChildDirty} onBusyChange={setChildBusy}/>:<div className="gen-empty"><Users size={32}/><h2>Your next customer starts here.</h2><p>Sign in to capture leads and manage your follow-up.</p><a className="button primary" href="/signin-with-chatgpt?return_to=%2F%3Fview%3Dcrm">Sign in</a></div>):view==='creator-library'?<CreatorLibrary products={workspace?.products||[]} aiReady={!!workspace?.capabilities.ai} cost={costs} unlimited={unlimited} onUpdate={()=>void load()} onDirtyChange={setChildDirty} onBusyChange={setChildBusy}/>:view==='credits'?<CreditsPanel signedIn={!!user}/>:view==='connections'?<ConnectionsPanel signedIn={!!user}/>:workspace?.admin?<AIProviders signedIn={!!user} onUpdate={()=>void load()}/>:null}</div>}
      </main>
      <footer className="gen-footer"><span>FiveGen</span><div><a href="/pricing">Plans & credits</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refund">Refunds</a><a href="mailto:kamzewac@gmail.com">Contact</a></div></footer></div></div>
    </div>
    <Dialog open={manual} onOpenChange={v=>{if(!busy)setManual(v);}}><DialogContent><DialogHeader><DialogTitle>Create your product, your way.</DialogTitle><DialogDescription>Bring your own lessons, recordings, or resources. Set up your growth tools whenever you’re ready.</DialogDescription></DialogHeader><form className="gen-manual-form" onSubmit={e=>{e.preventDefault();void create(true);}}><label>Product name<input autoFocus minLength={3} maxLength={100} required value={manualTitle} onChange={e=>setManualTitle(e.target.value)} placeholder="Give your expertise a home"/></label><label>Product type<select value={manualFormat} onChange={e=>setManualFormat(e.target.value as typeof manualFormat)}>{studioFormats.map(f=><option key={f}>{f}</option>)}</select></label><p className="growth-muted">{productTypes.find(t=>t.value===manualFormat)?.description}</p><button className="button primary full" disabled={!!busy||manualTitle.trim().length<3}>{busy==='create'?<Loader2 size={16} className="spin"/>:<Plus size={16}/>}Create product</button></form></DialogContent></Dialog>

  </div>;
}
