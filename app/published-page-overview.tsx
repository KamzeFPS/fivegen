'use client';
import {useEffect,useRef,useState} from 'react';
import {Loader2,RefreshCw} from 'lucide-react';
import type {PublicProductPage} from '@/lib/product-page';
import {SalesLandingPage} from './sales-landing-page';
import './sales-page-studio.css';
type Props={productId:string;publicationVersion:number};
export function PublishedPageOverview({productId,publicationVersion}:Props){
 const [loaded,setLoaded]=useState<{key:string;page:PublicProductPage}|null>(null),[failure,setFailure]=useState<{key:string;message:string}|null>(null),[attempt,setAttempt]=useState(0),[width,setWidth]=useState(360);
 const requestKey=`${productId}:${publicationVersion}:${attempt}`,page=loaded?.key===requestKey?loaded.page:null,error=failure?.key===requestKey?failure.message:'',loading=!page&&!error;
 const container=useRef<HTMLDivElement>(null);
 useEffect(()=>{const controller=new AbortController();void fetch(`/api/products/${encodeURIComponent(productId)}/page/preview`,{signal:controller.signal,cache:'no-store'}).then(async response=>{const value=await response.json() as {page:PublicProductPage;error?:string};if(!response.ok)throw new Error(value.error||'Your published page preview could not load.');if(value.page.product.id!==productId)throw new Error('This preview does not match the selected product.');if(!controller.signal.aborted){setLoaded({key:requestKey,page:value.page});}}).catch(reason=>{if(!controller.signal.aborted)setFailure({key:requestKey,message:reason instanceof Error?reason.message:'Your published page preview could not load.'});});return()=>controller.abort();},[productId,publicationVersion,attempt,requestKey]);
 useEffect(()=>{const element=container.current;if(!element)return;const measure=()=>setWidth(Math.max(1,element.clientWidth));measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
 const config=page?{...page.config,sections:page.config.sections.map(section=>section.type==='video'?{...section,videoUrl:''}:section)}:null;
 return <div className="cl-page-preview" ref={container} aria-label="Published sales page preview" aria-busy={loading}>{loading?<p className="cl-preview-state" role="status"><Loader2 size={18} className="spin"/>Loading your published page…</p>:error||!page||!config?<div className="cl-preview-state" role="status"><p>{error||'The published page is no longer available. Your draft is safe.'}</p><button type="button" className="button secondary" onClick={()=>setAttempt(value=>value+1)}><RefreshCw size={14}/>Retry preview</button></div>:<><div className="cl-page-preview-canvas" aria-hidden="true" inert style={{transform:`scale(${width/390})`}}><SalesLandingPage product={page.product} config={config} commerce={page.commerce} reviewSummary={page.reviewSummary} iconUrl={config.iconUploadId?`/api/product-pages/${encodeURIComponent(page.product.slug)}/image/icon`:null} bannerUrl={config.bannerUploadId?`/api/product-pages/${encodeURIComponent(page.product.slug)}/image/banner`:null} preview/></div><span className="cl-preview-caption">Published version · read-only preview</span></>}</div>;
}
