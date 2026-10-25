'use client';
import {useEffect,useState} from 'react';
import {Mail} from 'lucide-react';
import type {MarketingDestination} from '@/lib/marketing-destination';
import {useRegisterEditorSave} from './editor-save-registry';
type Choice={id:string;delayHours:number;mode:'append'|'update'};
type ImportPreview={campaignId:string;campaignTitle:string;campaignRevision:number;sequenceRevision:number;existingSteps:number;activeRevision:number|null;sequenceStatus:string;destination:MarketingDestination|null;items:{id:string;title:string;subject:string;body:string;sourceIds:string[];eligible:boolean;handoff:{stepId:string|null;sequenceId:string|null;sequenceRevision:number;approvedRevision:number|null;status:string;changed:boolean;accepted:number}}[];readiness:{ready:boolean;message:string}};
type Props={productId:string;campaignId?:string;itemId?:string;disabled:boolean;onOpenAutomations?:()=>void;onBusyChange?:(value:boolean)=>void};
export function CampaignEmailHandoff({productId,campaignId,itemId,disabled,onOpenAutomations,onBusyChange}:Props){
 const [data,setData]=useState<ImportPreview|null>(null),[choices,setChoices]=useState<Choice[]>([]),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const path=`/api/products/${productId}/campaigns/import-emails`;
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
 async function preview(){
  if(busy||disabled)return;setBusy(true);setError('');setNotice('');
  try{const r=await fetch(path+(campaignId?'?campaignId='+campaignId:''),{cache:'no-store'}),v=await r.json() as ImportPreview&{error?:string};if(!r.ok)throw new Error(v.error||'Could not review email handoff');
   const items=itemId?v.items.filter(item=>item.id===itemId):v.items;setData({...v,items});setChoices(items.filter(i=>i.eligible&&!i.handoff.stepId).map((i,index)=>({id:i.id,mode:'append',delayHours:index?48:v.existingSteps?48:0})));setConsent(false);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const added=choices.filter(c=>c.mode==='append').length;
 async function apply(){
  if(!data||busy||disabled||!consent||!choices.length||data.existingSteps+added>12)return false;
  setBusy(true);setError('');
  try{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId:data.campaignId,expectedCampaignUpdatedAt:data.campaignRevision,expectedSequenceRevision:data.sequenceRevision,items:choices,acknowledgeConsent:consent})}),v=await r.json() as {error?:string;notice?:string};if(!r.ok)throw new Error(v.error||'Email handoff failed');setNotice(v.notice||'Reviewed emails saved in a delivery draft.');setData(null);return true;}
  catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
 }
 useRegisterEditorSave({label:'Campaign email handoff review',dirty:!!data,busy,save:apply,priority:30});
 return <section className="campaign-import-review" aria-label={itemId?'Email copy to delivery':'Campaign email handoff'}>
  <div className="creator-inline-heading"><div><h3>Next: prepare this email for delivery</h3><p>Review copy here, then choose the audience, sender and activation in Emails. Saving this handoff sends nothing.</p></div><button className="button secondary" disabled={disabled||busy} onClick={()=>void preview()}><Mail size={15}/>Review email handoff</button></div>
  {disabled&&!busy&&<p className="creator-muted">Save the campaign and source selection before continuing.</p>}
  {error&&<p className="growth-error" role="alert">{error} <button className="button secondary" disabled={busy||disabled} onClick={()=>data?void apply():void preview()}>{data?'Retry reviewed handoff':'Retry review'}</button></p>}
  {notice&&<p className="growth-notice" role="status">{notice} {onOpenAutomations&&<button className="button secondary" onClick={onOpenAutomations}>Review audience & activate in Emails</button>}</p>}
  {data&&<>
   <ol className="creator-source-checklist" aria-label="Email delivery preparation"><li className="done">1 · Review campaign copy</li><li>2 · Set wait and save handoff</li><li>3 · Review sender & activate in Emails</li></ol>
   <p><strong>Recipient rule:</strong> new leads who separately opt into marketing for this product after activation. Buyers and unsubscribed people are excluded; a purchase stops sales follow-up.</p>
   <p><strong>Destination:</strong> {data.destination?data.destination.path:'Choose a published destination in Emails before activation.'}</p>
   {!data.items.length&&<p>Write an email in this campaign, save it and approve its copy first.</p>}
   {data.items.map(item=>{const choice=choices.find(c=>c.id===item.id);return <article key={item.id}><strong>{item.title}</strong><p>{item.handoff.status}</p>
    {!item.eligible&&<p>Approve the current campaign copy first. Existing delivery snapshots are unchanged.</p>}
    <label className="creator-checkbox"><input type="checkbox" disabled={busy||!item.eligible} checked={!!choice} onChange={e=>setChoices(e.target.checked?[...choices,{id:item.id,delayHours:48,mode:item.handoff.stepId?'update':'append'}]:choices.filter(c=>c.id!==item.id))}/><span>{item.handoff.stepId?'Update linked delivery draft':'Append new delivery draft'}<small>{item.subject}</small></span></label>
    <pre>{item.body}</pre>{choice&&<label>Wait after the previous email (hours)<input type="number" min={0} max={2160} value={choice.delayHours} disabled={busy} onChange={e=>setChoices(choices.map(c=>c.id===item.id?{...c,delayHours:Number(e.target.value)}:c))}/></label>}
    <details><summary>Details · saved copy and delivery history</summary><p>Draft revision {item.handoff.sequenceRevision}{item.handoff.approvedRevision?` · approved revision ${item.handoff.approvedRevision}`:''} · {item.handoff.accepted} recent provider-accepted messages. Acceptance does not confirm inbox delivery.</p><p>{item.sourceIds.length} source references. {choice?.mode==='update'?'Updates the linked draft copy and delay only; active recipients keep their approved snapshot.':'Duplicate imports are blocked. New sequence steps stay in draft until reviewed.'}</p><a href={`/?project=${productId}&area=results&campaign=${data.campaignId}`}>View campaign results</a></details>
   </article>;})}
   <label className="creator-checkbox"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/><span>I reviewed the copy, append/update actions, delays, consent rule and purchase exit. I will review the public destination and sender in Emails.</span></label>
   {!data.readiness.ready&&<div className="automation-setup"><strong>FiveGen platform setup needed</strong><p>{data.readiness.message} You can still save a delivery draft. Activation remains unavailable until the platform is ready.</p></div>}
   <details><summary>Details · this handoff</summary><p>{data.campaignTitle} · campaign revision {data.campaignRevision} · {data.existingSteps} draft emails · {data.sequenceStatus}{data.activeRevision?` · approved revision ${data.activeRevision} stays unchanged`:''}.</p><p>Existing contacts do not enroll automatically. This review cannot grant marketing permission or buyer access.</p></details>
   <div className="creator-actions"><button className="button primary" disabled={busy||disabled||!consent||!choices.length||data.existingSteps+added>12} onClick={()=>void apply()}>Save {choices.length} reviewed handoff{choices.length===1?'':'s'}</button>{onOpenAutomations&&<button className="button secondary" disabled={busy} onClick={onOpenAutomations}>Review delivery in Emails</button>}<button className="button secondary" disabled={busy} onClick={()=>{setData(null);setError('');}}>Keep editing campaign</button></div>
  </>}
 </section>;
}
