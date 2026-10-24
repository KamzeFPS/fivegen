'use client';
import {useEffect,useState} from 'react';
import {ProductPageView,type ProductPageViewProps} from './product-page-view';
import {journeyTrackingAllowed,productJourneySession,trackProductJourney,setJourneyMeasurementPreference} from './product-journey-tracker';
import {applyExperimentCopy,type PageExperimentAssignment} from '@/lib/page-experiment';
const preferenceKey='fivegen-anonymous-page-measurement';
/** Public-only wrapper: private lessons, editor preview and verified reviews bypass assignment. */
type Props=ProductPageViewProps&{publishedAt:number};
export function ProductPageExperiment(props:Props){return <PageExperimentView key={`${props.product.id}:${props.publishedAt}`} {...props}/>;}
function PageExperimentView(props:Props){
 const [state,setState]=useState<'loading'|'choice'|'assigning'|'ready'>('loading'),[assignment,setAssignment]=useState<PageExperimentAssignment|null>(null),[retry,setRetry]=useState(0),[memoryConsent,setMemoryConsent]=useState(''),slug=props.product.slug;
 useEffect(()=>{let active=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),3000);async function open(){
  if(props.preview||props.memberContent||props.reviewOrderId||!journeyTrackingAllowed()){setState('ready');return;}
  try{const response=await fetch(`/api/page-experiment?slug=${encodeURIComponent(slug)}`,{signal:controller.signal,cache:'no-store'}),available=await response.json() as {available?:boolean};if(!active)return;if(!response.ok||!available.available){setState('ready');return;}
   let preference=memoryConsent;try{preference=preference||localStorage.getItem(preferenceKey)||'';}catch{/* Measurement is optional when private storage is unavailable. */}
   if(preference==='no'){setState('ready');return;}if(preference!=='yes'){setState('choice');return;}
   setState('assigning');const sessionId=productJourneySession(slug);if(!sessionId){setState('ready');return;}
   const result=await fetch('/api/page-experiment',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,sessionId,consent:true})}),data=await result.json() as {assignment:PageExperimentAssignment|null};if(!active)return;if(result.ok&&data.assignment?.pagePublishedAt===props.publishedAt)setAssignment(data.assignment);setState('ready');
  }catch{if(active)setState('ready');}
 }void open();return()=>{active=false;clearTimeout(timeout);controller.abort();};},[slug,props.publishedAt,props.preview,props.memberContent,props.reviewOrderId,retry,memoryConsent]);
 useEffect(()=>{if(state!=='ready'||props.preview||props.memberContent||props.reviewOrderId)return;trackProductJourney(slug,'visit');if(assignment)trackProductJourney(slug,'experiment-view');},[state,slug,assignment,props.preview,props.memberContent,props.reviewOrderId]);
 function choose(allow:boolean){setJourneyMeasurementPreference(allow);setMemoryConsent(allow?'yes':'no');try{localStorage.setItem(preferenceKey,allow?'yes':'no');}catch{/* Declining or storage failure never blocks the page. */}if(allow){setState('loading');setRetry(v=>v+1);}else setState('ready');}
 return <>{state==='choice'&&<section className="page-measurement-choice" aria-label="Optional anonymous measurement" style={{maxWidth:1200,margin:'16px auto',padding:'16px 24px',border:'1px solid var(--border,#454545)',borderRadius:12}}><strong>Help improve this page?</strong><p>The creator is comparing a headline or button. Allow this page version to be compared using anonymous clicks and checkout outcomes in this browser. Your name and email are not part of the comparison. The product and price stay the same.</p><div className="creator-actions"><button className="button primary" onClick={()=>choose(false)}>Continue without measurement</button><button className="button secondary" onClick={()=>choose(true)}>Allow page comparison</button></div></section>}{state==='assigning'&&<small role="status">Applying your anonymous page version…</small>}<ProductPageView {...props} config={assignment?applyExperimentCopy(props.config,assignment):props.config}/>{assignment&&<details style={{maxWidth:1200,margin:'16px auto',padding:'0 24px',fontSize:12}}><summary>Anonymous page comparison is on</summary><p>Only this page version, clicks and same-session checkout outcomes are associated. <button className="sales-text-button" onClick={()=>{const sessionId=productJourneySession(slug);if(sessionId)void fetch('/api/page-experiment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,sessionId,consent:false}),keepalive:true}).catch(()=>{});setAssignment(null);choose(false);}}>Stop page comparison</button></p></details>}</>;
}
