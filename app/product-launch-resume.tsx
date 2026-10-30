'use client';
// Workspace and rich-builder query destinations initialize on document load.
/* eslint-disable @next/next/no-html-link-for-pages */
import {useEffect,useState} from 'react';
import {ArrowRight,Check,Loader2,RefreshCw} from 'lucide-react';
import {creatorLaunchActionHref,type CreatorLaunchState} from '@/lib/creator-launch';
import type {Product} from '@/lib/product';
import type {WorkspaceBuilderSummary} from '@/lib/workspace-library';
import {productLaunchSummary} from '@/lib/product-launch-state';
import './product-launch-resume.css';
type ResumeState={kind:'empty'}|{kind:'legacy';product:Pick<Product,'id'|'title'>}|{kind:'journey';journey:CreatorLaunchState};
/** A dashboard suggests a real saved task, not a percentage inferred from revenue. */
export function ProductLaunchResume({productId}:{productId?:string}){
 const [result,setResult]=useState<ResumeState|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();let active=true;async function load(){
  try{let selected=productId;
   if(!selected){const response=await fetch('/api/workspace',{cache:'no-store',signal:controller.signal});const data=await response.json() as {products:Product[];builders?:WorkspaceBuilderSummary[];error?:string};if(!response.ok)throw new Error(data.error||'Your next task could not load.');if(!data.products.length){if(active)setResult({kind:'empty'});return;}const summaries=data.builders||[];selected=(summaries.find(item=>!item.selling||!item.salesPagePublic)||summaries[0])?.productId;if(!selected){if(active)setResult({kind:'legacy',product:data.products[0]});return;}}
   const response=await fetch(`/api/builder/${encodeURIComponent(selected)}/launch`,{cache:'no-store',signal:controller.signal});const data=await response.json() as CreatorLaunchState&{error?:string};if(!response.ok){if(response.status===404&&productId){if(active)setResult({kind:'legacy',product:{id:productId,title:'this product'}});return;}throw new Error(data.error||'Your next task could not load.');}if(active){setResult({kind:'journey',journey:data});setError('');}
  }catch(cause){if(active&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Your next task could not load.');}
 }void load();return()=>{active=false;controller.abort();};},[productId,attempt]);
 if(error)return <section className="product-launch-resume" aria-label="Next launch task"><div><h2>Your next task could not load</h2><p role="alert">{error}</p></div><button type="button" className="button secondary" onClick={()=>{setError('');setAttempt(value=>value+1);}}><RefreshCw size={15}/>Try again</button></section>;
 if(!result)return <section className="product-launch-resume is-loading" aria-label="Next launch task" role="status"><Loader2 size={19} className="spin"/><p>Checking your next saved task…</p></section>;
 if(result.kind==='empty')return <section className="product-launch-resume"><div><span className="product-launch-resume-eyebrow">START WITH YOUR EXPERTISE</span><h2>Bring your first product to life.</h2><p>Upload content, organize your teaching or define a service. Build the sales page and follow-up around it.</p></div><a className="button primary" href="/build/new">Create your product<ArrowRight size={16}/></a></section>;
 if(result.kind==='legacy')return <section className="product-launch-resume"><div><span className="product-launch-resume-eyebrow">YOUR SAVED WORK</span><h2>Continue {result.product.title}.</h2><p>Review the product, public page and checkout before sharing your link.</p></div><a className="button primary" href={`/?project=${encodeURIComponent(result.product.id)}&area=content`}>Open product<ArrowRight size={16}/></a></section>;
 const {journey}=result,summary=journey.summary?productLaunchSummary(journey.summary):null;
 return <section className="product-launch-resume"><div><span className="product-launch-resume-eyebrow">{journey.summary?.title||'YOUR PRODUCT'} · {journey.phase==='improve'?'NEXT GROWTH ACTION':'NEXT LAUNCH TASK'}</span><h2>{journey.nextTitle}</h2><p>{journey.nextDetail}</p>{summary&&<ul aria-label="Product readiness">{summary.milestones.map(item=><li key={item.id} data-state={item.state}>{item.state==='complete'&&<Check size={12}/>}<span>{item.label}</span></li>)}</ul>}</div><a className="button primary" href={creatorLaunchActionHref(journey.productId,journey.nextAction)}>{journey.nextAction.kind==='navigate'?journey.nextAction.label:'Open launch overview'}<ArrowRight size={16}/></a></section>;
}
