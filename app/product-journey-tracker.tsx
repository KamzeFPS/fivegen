'use client';
import {useEffect,type ReactNode} from 'react';
import {commerceCampaign} from '@/lib/commerce-v2';
const memory=new Map<string,string>();
let measurementPreference:boolean|null=null;
export function setJourneyMeasurementPreference(allow:boolean){measurementPreference=allow;try{localStorage.setItem('fivegen-anonymous-page-measurement',allow?'yes':'no');}catch{/* The current tab still honors the explicit choice when browser storage is blocked. */}}
export function journeyTrackingAllowed(){if(typeof window==='undefined'||navigator.doNotTrack==='1'||(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl===true)return false;if(measurementPreference!==null)return measurementPreference;try{return localStorage.getItem('fivegen-anonymous-page-measurement')!=='no';}catch{return true;}}
export function productJourneySession(slug:string){if(!journeyTrackingAllowed())return '';const key='fivegen-journey-'+slug;try{const prior=sessionStorage.getItem(key);if(prior&&/^[a-f0-9-]{36}$/i.test(prior))return prior;const id=crypto.randomUUID();sessionStorage.setItem(key,id);return id;}catch{let id=memory.get(key);if(!id){id=crypto.randomUUID();memory.set(key,id);}return id;}}
export function trackProductJourney(slug:string,event:'visit'|'cta'|'experiment-view'){const sessionId=productJourneySession(slug);if(!sessionId)return;void fetch('/api/journey',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,sessionId,event,campaign:commerceCampaign(location.search)})}).catch(()=>{/* Analytics failure must never block the buyer’s task. */});}
export function ProductJourneyTracker({slug}:{slug:string}){useEffect(()=>{trackProductJourney(slug,'visit');},[slug]);return null;}

export function ProductJourneyLink({slug,href,children,className}:{slug:string;href:string;children:ReactNode;className?:string}){return <a href={href} className={className} onClick={()=>trackProductJourney(slug,'cta')}>{children}</a>;}
