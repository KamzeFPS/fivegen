'use client';

import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {ArrowRight,BarChart3,Brain,Check,FlaskConical,Layers3,Loader2,Mail,Megaphone,Plus,Puzzle,Video} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import type {MarketingPluginId,MarketingPluginState} from '@/lib/marketing-plugins';
import type {Product} from '@/lib/product';
import {GrowthDashboard} from './growth-dashboard';
import {GrowthVSL} from './growth-vsl';
import {GrowthFunnelPanel} from './growth-funnel-panel';
import {CreatorVoiceLibrary} from './creator-voice-library';
import {CampaignStudio} from './campaign-studio';
import {AutomationStudio} from './automation-studio';
import {OfferLab} from './offer-lab';
import './marketing-workspace.css';

export type MarketingTab='dashboard'|MarketingPluginId;
const plugins: {id:MarketingPluginId;name:string;icon:typeof Video;description:string;detail:string}[]=[
  {id:'vsl',name:'VSL',icon:Video,description:'Write your sales video script.',detail:'Shape the message and attach your own recording.'},
  {id:'funnel',name:'Funnel',icon:Layers3,description:'Build a landing page for your launch.',detail:'Capture leads and guide visitors to your product.'},
  {id:'campaigns',name:'Campaigns',icon:Megaphone,description:'Plan your product promotion.',detail:'Draft posts and emails in a promotion calendar.'},
  {id:'automations',name:'Automations',icon:Mail,description:'Create email follow-up sequences.',detail:'Review and activate messages for opted-in leads or verified buyers.'},
  {id:'offer',name:'Offer tests',icon:FlaskConical,description:'Test a product’s positioning.',detail:'Publish a survey and learn from real audience responses.'},
  {id:'voice',name:'Creator voice',icon:Brain,description:'Keep your marketing in your voice.',detail:'Build a private library of your recordings and notes.'},
];

async function settings(productId:string,body?:unknown):Promise<MarketingPluginState>{
  const response=await fetch(`/api/products/${encodeURIComponent(productId)}/marketing-plugins`,{method:body?'PATCH':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json() as MarketingPluginState&{error?:string};
  if(!response.ok)throw new Error(data.error||'Could not update your marketing plugins.');
  return data;
}

type Props={product:Product;tab:MarketingTab;aiReady:boolean;cost:number;unlimited:boolean;onTab:(tab:MarketingTab)=>void;onResolveTab:(tab:MarketingTab)=>void;onUpdate:()=>void;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void};
export function MarketingWorkspace({product,tab,aiReady,cost,unlimited,onTab,onResolveTab,onUpdate,onDirtyChange,onBusyChange}:Props){
  const [state,setState]=useState<MarketingPluginState|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[attempt,setAttempt]=useState(0);
  const [manager,setManager]=useState(false),[mutation,setMutation]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[removing,setRemoving]=useState<MarketingPluginId|null>(null);
  const [panelDirty,setPanelDirty]=useState(false),[panelBusy,setPanelBusy]=useState(false);
  const panelId=useId(),busy=!!mutation||panelBusy;
  const removalPrompt=useRef<HTMLDivElement>(null);
  const active:MarketingTab=tab==='dashboard'||state?.installed.includes(tab)?tab:'dashboard';
  const load=useCallback(()=>{setLoading(true);setLoadError('');setAttempt(v=>v+1);},[]);
  useEffect(()=>{
    let current=true;setLoading(true);setLoadError('');
    void settings(product.id).then(data=>{if(current)setState(data);}).catch(e=>{if(current)setLoadError(e.message);}).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[product.id,attempt]);
  useEffect(()=>{onDirtyChange(panelDirty);return()=>onDirtyChange(false);},[panelDirty,onDirtyChange]);
  useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
  useEffect(()=>{if(removing){removalPrompt.current?.focus({preventScroll:true});removalPrompt.current?.scrollIntoView({block:'nearest'});}},[removing]);
  // An old deep link is not consent to install a tool. The permanent sales
  // dashboard is shown instead, without loading the disabled tool's data.
  useEffect(()=>{if(state&&!loading&&!loadError&&active!==tab)onResolveTab('dashboard');},[state,loading,loadError,active,tab,onResolveTab]);
  function openManager(){
    if(busy||panelDirty){setNotice(panelDirty?'Save your current changes before managing plugins.':'Wait for the current operation to finish.');return;}
    setNotice('');setError('');setRemoving(null);setManager(true);
  }
  async function changePlugin(id:MarketingPluginId,enabled:boolean){
    if(!state||busy||panelDirty)return;
    setMutation(id);setError('');setNotice('');
    try{const next=await settings(product.id,{pluginId:id,enabled,expectedUpdatedAt:state.updatedAt});setState(next);setRemoving(null);setNotice(`${plugins.find(p=>p.id===id)?.name} ${enabled?'added to':'removed from'} this product’s Marketing.`);}
    catch(e){setError((e as Error).message);try{setState(await settings(product.id));}catch{/* Keep the last known state and offer another attempt. */}}
    finally{setMutation('');}
  }
  if(loading)return <div className="marketing-loading" role="status"><Loader2 size={20} className="spin"/>Opening your marketing workspace…</div>;
  if(loadError||!state)return <div className="marketing-load-error" role="alert"><p>{loadError||'Could not load your marketing workspace.'}</p><button className="button secondary" onClick={load}>Try again</button></div>;
  const selected=plugins.find(p=>p.id===active);
  return <section className="marketing-workspace" aria-label="Product marketing">
    <div className="marketing-toolbar">
      <div className="marketing-tabs" role="tablist" aria-label="Marketing tools" onKeyDown={event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||busy||panelDirty)return;
        const keys:MarketingTab[]=['dashboard',...plugins.filter(p=>state.installed.includes(p.id)).map(p=>p.id)],index=keys.indexOf(active);
        const next=event.key==='Home'?0:event.key==='End'?keys.length-1:(index+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;
        event.preventDefault();onTab(keys[next]);event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
      }}>
        {[{id:'dashboard' as const,name:'Sales',icon:BarChart3},...plugins.filter(p=>state.installed.includes(p.id))].map(({id,name,icon:Icon})=><button type="button" key={id} id={`${panelId}-${id}`} role="tab" aria-selected={active===id} aria-controls={panelId} tabIndex={active===id?0:-1} disabled={busy} onClick={()=>onTab(id)}><Icon size={16}/>{name}</button>)}
      </div>
      <button type="button" className="button secondary marketing-add" disabled={busy} onClick={openManager}><Plus size={15}/>Add plugin{state.installed.length>0&&<span>{state.installed.length}</span>}</button>
    </div>
    {notice&&!manager&&<p className="marketing-notice" role="status">{notice}</p>}
    <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${active}`} className="marketing-panel">
      {active==='dashboard'?<>
        <GrowthDashboard productId={product.id}/>
        {!state.installed.length&&<div className="marketing-optional-callout"><span className="marketing-plugin-symbol"><Puzzle size={22}/></span><div><h2>More tools, only when you need them</h2><p>Add a sales video, funnel, campaign, or automation. Every plugin is optional.</p></div><button className="button secondary" onClick={openManager}>Explore plugins<ArrowRight size={15}/></button></div>}
      </>:<>
        <div className="marketing-active-tool"><span><Puzzle size={13}/>{selected?.name} plugin</span><button type="button" onClick={openManager} disabled={busy}>Manage plugins</button></div>
        <div key={active}>
          {active==='vsl'&&<GrowthVSL product={product} aiReady={aiReady} cost={cost} unlimited={unlimited} onUpdate={onUpdate} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy}/>}
          {active==='funnel'&&<GrowthFunnelPanel product={product} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy}/>}
          {active==='voice'&&<CreatorVoiceLibrary product={product} aiReady={aiReady} cost={cost} unlimited={unlimited} onUpdate={onUpdate} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy}/>}
          {active==='campaigns'&&<CampaignStudio product={product} aiReady={aiReady} cost={cost} unlimited={unlimited} onUpdate={onUpdate} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy}/>}
          {active==='automations'&&<AutomationStudio product={product} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy}/>}
          {active==='offer'&&<OfferLab product={product} onDirtyChange={setPanelDirty} onBusyChange={setPanelBusy}/>}
        </div>
      </>}
    </div>
    <Dialog open={manager} onOpenChange={value=>{if(!mutation){setManager(value);setRemoving(null);}}}><DialogContent className="marketing-plugin-dialog"><DialogHeader><DialogTitle>Marketing plugins</DialogTitle><DialogDescription>Add tools for this product. Your sales dashboard is always included. Manage contacts separately in Customers.</DialogDescription></DialogHeader>
      <div className="marketing-plugin-scroll">
        {error&&<p className="marketing-plugin-error" role="alert">{error}</p>}
        {notice&&<p className="marketing-notice" role="status"><Check size={14}/>{notice}</p>}
        {removing&&<div className="marketing-remove-warning" role="alert" ref={removalPrompt} tabIndex={-1}><strong>Remove {plugins.find(p=>p.id===removing)?.name} from Marketing?</strong><p>Saved work stays available when you add it again. Published pages and active automations keep running. Open the plugin first if you want to stop them.</p><div><button className="button secondary" disabled={!!mutation} onClick={()=>setRemoving(null)}>Keep plugin</button><button className="button secondary" disabled={!!mutation} onClick={()=>void changePlugin(removing,false)}>{mutation?<Loader2 size={14} className="spin"/>:null}Remove plugin</button></div></div>}
        <div className="marketing-plugin-grid">{plugins.map(({id,name,icon:Icon,description,detail})=>{const installed=state.installed.includes(id);return <article className={`marketing-plugin-card ${installed?'is-installed':''}`} key={id} data-plugin={id}>
          <div className="marketing-plugin-card-top"><span className="marketing-plugin-symbol"><Icon size={21}/></span><small>{installed?<><Check size={12}/>Installed</>:'Optional'}</small></div>
          <h3>{name}</h3><p>{description}</p><span className="marketing-plugin-detail">{detail}</span>
          <div className="marketing-plugin-card-actions">{installed?<><button className="button secondary" disabled={!!mutation} onClick={()=>{setManager(false);setRemoving(null);onTab(id);}}>Open<ArrowRight size={14}/></button><button className="marketing-remove" aria-label={`Remove ${name}`} disabled={!!mutation} onClick={()=>{setError('');setNotice('');setRemoving(id);}}>Remove</button></>:<button className="button secondary" aria-label={`Add ${name}`} disabled={!!mutation} onClick={()=>void changePlugin(id,true)}>{mutation===id?<Loader2 className="spin" size={14}/>:<Plus size={14}/>}Add plugin</button>}</div>
        </article>;})}</div>
      </div>
      <div className="marketing-plugin-footer"><span>Plugins are saved for this product only.</span><button className="button primary" disabled={!!mutation} onClick={()=>setManager(false)}>Done<Check size={14}/></button></div>
    </DialogContent></Dialog>
  </section>;
}
