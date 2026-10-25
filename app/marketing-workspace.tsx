'use client';
// Workspace query destinations restore server context on document navigation.
/* eslint-disable @next/next/no-html-link-for-pages */

import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {ArrowRight,Brain,Check,FlaskConical,Layers3,Loader2,Mail,Megaphone,Plus,Puzzle,Video} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import type {MarketingPluginId,MarketingPluginState} from '@/lib/marketing-plugins';
import type {Product} from '@/lib/product';
import {marketingGroups,marketingGroupFor,type MarketingDestination} from '@/lib/marketing-navigation';
import {GrowthDashboard} from './growth-dashboard';
import {JourneyReport} from './journey-report';
import {ShareLinkResults} from './tracked-share-links';
import {GrowthVSL} from './growth-vsl';
import {LeadCaptureWorkspace} from './lead-capture-workspace';
import {FunnelBuilder} from './funnel-builder';
import {CreatorContextPicker} from './creator-context-picker';
import {CampaignStudio} from './campaign-studio';
import {AutomationStudio} from './automation-studio';
import {OfferLab} from './offer-lab';
import {ConnectedLaunch} from './connected-launch';
import {SharedMarketingBrief} from './shared-marketing-brief';
import './marketing-workspace.css';
import {useEditorSaveRegistry} from './editor-save-registry';

export type MarketingTab=MarketingDestination;
const plugins: {id:MarketingPluginId;name:string;icon:typeof Video;description:string;detail:string}[]=[
  {id:'vsl',name:'Sales video',icon:Video,description:'Prepare your sales video script and creator recording.',detail:'Use your own message; choose AI assistance only when needed.'},
  {id:'funnel-builder',name:'Funnel Builder',icon:Layers3,description:'Map the strategy from first interest to the next customer action.',detail:'Plan a private journey and hand work to Sales page, Lead capture, Campaigns or Emails. The graph does not publish or send.'},
  {id:'funnel',name:'Lead capture',icon:Layers3,description:'Collect requests, interest or applications.',detail:'Use a purpose-aware page and separate optional marketing consent.'},
  {id:'campaigns',name:'Campaigns',icon:Megaphone,description:'Prepare promotional assets and manual publishing reminders.',detail:'Review email copy here; activate delivery separately in Emails.'},
  {id:'automations',name:'Emails',icon:Mail,description:'Create email follow-up sequences.',detail:'Review and activate messages for opted-in leads or verified buyers.'},
  {id:'offer',name:'Test my offer',icon:FlaskConical,description:'Test a product’s positioning without changing its price.',detail:'Publish a survey and learn from real audience responses.'},
  {id:'voice',name:'Creator references',icon:Brain,description:'Choose optional private references for this product.',detail:'Manage reusable recordings, stories and profile in Creator library.'},
];

async function settings(productId:string,body?:unknown):Promise<MarketingPluginState>{
  const response=await fetch(`/api/products/${encodeURIComponent(productId)}/marketing-plugins`,{method:body?'PATCH':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json() as MarketingPluginState&{error?:string};
  if(!response.ok)throw new Error(data.error||'Could not update your marketing tools.');
  return data;
}

type Props={product:Product;tab:MarketingTab;aiReady:boolean;cost:number;unlimited:boolean;onTab:(tab:MarketingTab)=>void;onResolveTab:(tab:MarketingTab)=>void;onUpdate:()=>void;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void};
export function MarketingWorkspace(props:Props){return <MarketingProductWorkspace key={props.product.id} {...props}/>;}
function MarketingProductWorkspace({product,tab,aiReady,cost,unlimited,onTab,onResolveTab,onUpdate,onDirtyChange,onBusyChange}:Props){
  const [state,setState]=useState<MarketingPluginState|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[attempt,setAttempt]=useState(0);
  const [manager,setManager]=useState(false),[mutation,setMutation]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[removing,setRemoving]=useState<MarketingPluginId|null>(null);
  const [activity,setActivity]=useState<{id:MarketingPluginId;active:boolean;summary:string;items?:{id:string;title:string;href:string;summary:string}[]}[]|null>(null),[activityError,setActivityError]=useState('');
  const [panelDirty,setPanelDirty]=useState(false),[panelBusy,setPanelBusy]=useState(false);
  const editorSaves=useEditorSaveRegistry();
  const panelId=useId(),busy=!!mutation||panelBusy;
  const removalPrompt=useRef<HTMLDivElement>(null);
  const active:MarketingTab=tab==='dashboard'||tab==='results'||plugins.some(p=>p.id===tab)?tab:'dashboard';
  const load=useCallback(()=>{setLoading(true);setLoadError('');setAttempt(v=>v+1);},[]);
  useEffect(()=>{
    let current=true;
    void settings(product.id).then(data=>{if(current)setState(data);}).catch(e=>{if(current)setLoadError(e.message);}).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[product.id,attempt]);
  useEffect(()=>{onDirtyChange(panelDirty);return()=>onDirtyChange(false);},[panelDirty,onDirtyChange]);
  useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
  useEffect(()=>{if(removing){removalPrompt.current?.focus({preventScroll:true});removalPrompt.current?.scrollIntoView({block:'nearest'});}},[removing]);
  // A deep link opens the requested workspace without changing its shortcut visibility.
  useEffect(()=>{if(state&&!loading&&!loadError&&active!==tab)onResolveTab('dashboard');},[state,loading,loadError,active,tab,onResolveTab]);
  function openManager(){
    if(busy){setNotice('Wait for the current operation to finish.');return;}
    if(editorSaves){editorSaves.requestNavigation(showManager);return;}
    if(panelDirty){setNotice('Save your current changes before managing tools.');return;}showManager();
  }
  function showManager(){
    setNotice('');setError('');setRemoving(null);setManager(true);setActivity(null);setActivityError('');void fetch(`/api/products/${product.id}/marketing-activity`,{cache:'no-store'}).then(async response=>{const data=await response.json() as {activity:{id:MarketingPluginId;active:boolean;summary:string;items?:{id:string;title:string;href:string;summary:string}[]}[];error?:string};if(!response.ok)throw new Error(data.error||'Activity could not be checked.');setActivity(data.activity);}).catch(e=>setActivityError(e.message));
  }
  async function changePlugin(id:MarketingPluginId,enabled:boolean){
    if(!state||busy||panelDirty)return;
    setMutation(id);setError('');setNotice('');
    try{const next=await settings(product.id,{pluginId:id,enabled,expectedUpdatedAt:state.updatedAt});setState(next);window.dispatchEvent(new CustomEvent('fivegen:marketing-plugins-updated',{detail:{productId:product.id,installed:next.installed}}));setRemoving(null);setNotice(`${plugins.find(p=>p.id===id)?.name} ${enabled?'added to':'hidden from'} this product’s Marketing.`);return next;}
    catch(e){setError((e as Error).message);try{setState(await settings(product.id));}catch{/* Keep the last known state and offer another attempt. */}}
    finally{setMutation('');}
  }
  if(loading)return <div className="marketing-loading" role="status"><Loader2 size={20} className="spin"/>Opening your marketing workspace…</div>;
  if(loadError||!state)return <div className="marketing-load-error" role="alert"><p>{loadError||'Could not load your marketing workspace.'}</p><button className="button secondary" onClick={load}>Try again</button></div>;
  const selectedCampaign=typeof window==='undefined'?undefined:new URLSearchParams(location.search).get('campaign')||undefined;
  const selected=plugins.find(p=>p.id===active);
  const group=marketingGroupFor(active),groupInfo=marketingGroups.find(item=>item.id===group)!;
  const toolOptions=[{id:'dashboard' as const,name:'Growth plan'},...plugins].filter(tool=>marketingGroupFor(tool.id)===group&&(tool.id==='dashboard'||tool.id===active||state.installed.includes(tool.id)));
  return <section className="marketing-workspace" aria-label="Product marketing">
    <div className="marketing-toolbar">
      <div className="marketing-tabs" role="tablist" aria-label="Marketing workflow" onKeyDown={event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||busy)return;
        const keys=marketingGroups,index=keys.findIndex(item=>item.id===group);
        const next=event.key==='Home'?0:event.key==='End'?keys.length-1:(index+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;
        event.preventDefault();onTab(keys[next].defaultTab);event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
      }}>
        {marketingGroups.map(({id,label,defaultTab})=><button type="button" key={id} id={`${panelId}-group-${id}`} role="tab" aria-selected={group===id} aria-controls={panelId} tabIndex={group===id?0:-1} disabled={busy} onClick={()=>{if(group!==id)onTab(defaultTab);}}>{label}</button>)}
      </div>
      <button type="button" className="button secondary marketing-add" disabled={busy} onClick={openManager}><Puzzle size={15}/>All tools</button>
    </div>
    <div className="marketing-context-row">
      {toolOptions.length>1?<label>Workspace<select aria-label={`${groupInfo.label} workspace`} value={active} disabled={busy} onChange={event=>onTab(event.target.value as MarketingTab)}>{toolOptions.map(tool=><option key={tool.id} value={tool.id}>{tool.name}</option>)}</select></label>:<strong>{active==='results'?'Your results':selected?.name}</strong>}
      <p>{groupInfo.description}</p>
    </div>
    {notice&&!manager&&<p className="marketing-notice" role="status">{notice}</p>}
    <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-group-${group}`} className="marketing-panel">
      {active==='results'?<><JourneyReport productId={product.id} campaignId={selectedCampaign}/><details className="growth-plan-checklist"><summary>Share-link performance</summary><ShareLinkResults productId={product.id} campaignId={selectedCampaign}/></details><details className="growth-plan-checklist"><summary>Business metrics & earnings for this product</summary><p>This separate report shows sales, net earnings and older marketing-page activity. Its own date, payment mode and currency labels apply; it is not a conversion funnel.</p><GrowthDashboard productId={product.id}/></details></>:active==='dashboard'?<>
        <SharedMarketingBrief productId={product.id}/>
        <ConnectedLaunch productId={product.id} onBusyChange={setPanelBusy} onDirtyChange={setPanelDirty} onResults={()=>onTab('results')} onOpen={tool=>onTab(tool)} onToolsChanged={()=>{void settings(product.id).then(next=>{setState(next);window.dispatchEvent(new CustomEvent('fivegen:marketing-plugins-updated',{detail:{productId:product.id,installed:next.installed}}));}).catch(e=>setError(e.message));}}/>
      </>:<>
        <div key={active}>
          {active==='vsl'&&<GrowthVSL product={product} aiReady={aiReady} cost={cost} unlimited={unlimited} onUpdate={onUpdate} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy}/>}
          {active==='funnel-builder'&&<FunnelBuilder product={product} aiReady={aiReady} cost={cost} unlimited={unlimited} onUpdate={onUpdate} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy}/>}
          {active==='funnel'&&<LeadCaptureWorkspace product={product} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy}/>}
          {active==='voice'&&<section className="creator-marketing"><h2>This product’s creator references</h2><p>Choose only the reviewed private profile and sources relevant to {product.title}. Manage reusable sources in your global Creator library. Source approval is AI-use permission and never makes a private recording publicly playable.</p><CreatorContextPicker productId={product.id} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy}/><a className="button secondary" href="/?view=creator-library">Open Creator library</a></section>}
          {active==='campaigns'&&<CampaignStudio product={product} aiReady={aiReady} cost={cost} unlimited={unlimited} onUpdate={onUpdate} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy} onOpenAutomations={()=>onTab('automations')}/>}
          {active==='automations'&&<AutomationStudio product={product} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy}/>}
          {active==='offer'&&<OfferLab product={product} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy}/>}
        </div>
      </>}
    </div>
    <Dialog open={manager} onOpenChange={value=>{if(!mutation){setManager(value);setRemoving(null);}}}><DialogContent className="marketing-plugin-dialog"><DialogHeader><DialogTitle>Customize visible tools</DialogTitle><DialogDescription>Choose what this product needs. Growth plan and Results are always available. Showing or hiding a shortcut never starts or stops publishing, delivery, research or access.</DialogDescription></DialogHeader>
      <div className="marketing-plugin-scroll">
        {error&&<p className="marketing-plugin-error" role="alert">{error}</p>}
        {notice&&<p className="marketing-notice" role="status"><Check size={14}/>{notice}</p>}
        {removing&&<div className="marketing-remove-warning" role="alert" ref={removalPrompt} tabIndex={-1}><strong>Hide {plugins.find(p=>p.id===removing)?.name} from Marketing?</strong><p>This changes navigation only. Saved work stays available. Published pages and active email sequences keep running. Open the tool to review its current activity or pause it before hiding.</p><p className="marketing-activity-summary">{activity?.find(item=>item.id===removing)?.summary||activityError||'Checking current activity…'}</p>{activity?.find(item=>item.id===removing)?.items?.map(item=><p key={item.id}><a href={item.href}>{item.title} · Review publication</a><br/><small>{item.summary}</small></p>)}<div><button className="button secondary" disabled={!!mutation} onClick={()=>{setManager(false);onTab(removing);}}>Review live activity / pause</button><button className="button secondary" disabled={!!mutation} onClick={()=>setRemoving(null)}>Keep tool</button><button className="button secondary" disabled={!!mutation} onClick={()=>void changePlugin(removing,false)}>{mutation?<Loader2 size={14} className="spin"/>:null}Hide tool</button></div></div>}
        <div className="marketing-plugin-grid">{plugins.map(({id,name,icon:Icon,description,detail})=>{const installed=state.installed.includes(id);return <article className={`marketing-plugin-card ${installed?'is-installed':''}`} key={id} data-plugin={id}>
          <div className="marketing-plugin-card-top"><span className="marketing-plugin-symbol"><Icon size={19}/></span><div><h3>{name}</h3><small>{installed?<><Check size={12}/>Visible</>:'Hidden shortcut'}</small></div></div>
          <p>{description} {detail}</p>
          <div className="marketing-plugin-card-actions">{installed?<><button className="button secondary" disabled={!!mutation} onClick={()=>{setManager(false);setRemoving(null);onTab(id);}}>Open<ArrowRight size={14}/></button><button className="marketing-remove" aria-label={`Hide ${name}`} disabled={!!mutation} onClick={()=>{setError('');setNotice('');setRemoving(id);}}>Hide</button></>:<button className="button secondary" aria-label={`Add ${name}`} disabled={!!mutation} onClick={()=>void changePlugin(id,true)}>{mutation===id?<Loader2 className="spin" size={14}/>:<Plus size={14}/>}Show shortcut</button>}</div>
        </article>;})}</div>
      </div>
      <div className="marketing-plugin-footer"><span>Tools are saved for this product only.</span><button className="button primary" disabled={!!mutation} onClick={()=>setManager(false)}>Done<Check size={14}/></button></div>
    </DialogContent></Dialog>
  </section>;
}
