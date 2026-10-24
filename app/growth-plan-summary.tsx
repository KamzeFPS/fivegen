'use client';
// Workspace query destinations restore server context on document navigation.
import {useEffect,useState} from 'react';
import type {ConnectedLaunch} from '@/lib/connected-launch';
/** Read the same saved plan as Marketing; product delivery has no separate marketing recipe. */
export function GrowthPlanSummary({productId}:{productId:string}){
 const [loaded,setLoaded]=useState<{productId:string;plan:ConnectedLaunch|null;error:string}|null>(null);
 useEffect(()=>{const c=new AbortController();void fetch(`/api/products/${productId}/connected-launch`,{cache:'no-store',signal:c.signal}).then(async r=>{const v=await r.json() as {launch:ConnectedLaunch;error?:string};if(!r.ok)throw new Error(v.error||'Could not load the saved Growth plan.');if(!c.signal.aborted)setLoaded({productId,plan:v.launch,error:''});}).catch(e=>{if(!c.signal.aborted)setLoaded({productId,plan:null,error:e.message});});return()=>c.abort();},[productId]);
 const current=loaded?.productId===productId?loaded:null,plan=current?.plan;
 return <section className="cl-growth-plan"><span className="cl-eyebrow">GROWTH PLAN</span><h3>{plan?.goal?(plan.ready?'Your selected journey is ready':plan.nextAction?.title||'Review your selected journey'):'Attract your next customer'}</h3><p>{!current?'Checking the same saved Growth plan used in Marketing…':current.error?'Your saved plan could not be checked. Open Marketing to retry.':plan?.goal?plan.nextAction?.detail||'Required steps for your chosen goal are reviewed. Follow real results before deciding what to change.':'Choose a lead, sale or application goal in Marketing. A script, private references and email are optional.'}</p><a className="button secondary" href={`/?project=${productId}&area=dashboard`}>Open Growth plan</a><a className="button secondary" href={`/?project=${productId}&area=results`}>Results</a></section>;
}
