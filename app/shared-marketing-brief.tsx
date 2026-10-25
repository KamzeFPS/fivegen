'use client';
import {useEffect,useState} from 'react';
import type {GrowthBrief} from '@/lib/growth';
import {marketingBriefReturnPath} from '@/lib/growth';
import {useEditorSaveRegistry} from './editor-save-registry';

export type SharedBriefContext={brief:GrowthBrief;updatedAt:number};
/** A compact reference, not another form. Tool-specific drafts stay separate. */
export function SharedMarketingBrief({productId,context,className='strategy-card marketing-details',note}:{productId:string;context?:SharedBriefContext;className?:string;note?:string}){
 const editorSaves=useEditorSaveRegistry();
 const [loaded,setLoaded]=useState<SharedBriefContext|null>(null);
 const [returnPath,setReturnPath]=useState('');
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(active)setReturnPath(marketingBriefReturnPath(window.location.pathname+window.location.search,productId));});return()=>{active=false;};},[productId]);
 useEffect(()=>{if(context)return;const controller=new AbortController();void fetch(`/api/products/${encodeURIComponent(productId)}/growth`,{signal:controller.signal,cache:'no-store'}).then(async response=>{if(!response.ok)return;const value=await response.json() as {growth:SharedBriefContext};if(!controller.signal.aborted)setLoaded(value.growth);}).catch(()=>{});return()=>controller.abort();},[productId,context]);
 const current=context||loaded,href=`/?project=${encodeURIComponent(productId)}&area=vsl${returnPath?`&briefReturn=${encodeURIComponent(returnPath)}`:''}`;
 return <details className={`shared-marketing-brief ${className}`}><summary>Your product brief · reused here</summary><p>{note||'Start with the same audience, outcome and offer. Your saved drafts and approved copy are kept when this brief changes.'}</p>{current?<dl>{([{key:'icp',label:'Audience'},{key:'promise',label:'Useful outcome'},{key:'offer',label:'Offer & inclusions'},{key:'problem',label:'Customer pain points'},{key:'story',label:'Creator story'}] as const).map(field=>current.brief[field.key]?.trim()?<div key={field.key}><dt><strong>{field.label}</strong></dt><dd style={{margin:'4px 0 14px',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{current.brief[field.key]}</dd></div>:null)}</dl>:<p>View your saved product details and shared marketing answers in the brief.</p>}<a className="button secondary" href={href} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();const open=()=>window.location.assign(new URL(href,window.location.origin).href);if(editorSaves)editorSaves.requestNavigation(open);else open();}}>Edit shared product brief</a><small style={{display:'block',marginTop:8}}>Saving the brief does not publish pages, change prices or replace approved marketing.</small></details>;
}
