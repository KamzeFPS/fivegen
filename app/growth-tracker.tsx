'use client';
import { useEffect } from 'react';
export function GrowthTracker({ slug }: { slug: string }) {
  useEffect(()=>{
    // Respect browser tracking preferences. Counts are approximate activity,
    // never an identity or a billing/payment authority.
    if(navigator.doNotTrack==='1')return;
    let visitor=crypto.randomUUID(),campaign='direct';
    try{const key=`fivegen:visit:${slug}`,saved=sessionStorage.getItem(key);if(saved&&/^[0-9a-f-]{36}$/.test(saved))visitor=saved as typeof visitor;else sessionStorage.setItem(key,visitor);const tag=new URLSearchParams(location.search).get('utm_campaign');if(tag&&/^[a-zA-Z0-9_-]{1,80}$/.test(tag))campaign=tag;}catch{}
    const send=(event:'visit'|'vsl_play'|'cta')=>{void fetch('/api/growth/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,visitor,event,campaign}),keepalive:true}).catch(()=>{});};
    send('visit');
    const play=()=>send('vsl_play'),click=(event:MouseEvent)=>{const target=event.target;if(target instanceof Element&&target.closest('a[href="#join"],button[data-growth-cta]'))send('cta');};
    const video=document.querySelector('.growth-public-video video');video?.addEventListener('play',play);document.addEventListener('click',click);
    return()=>{video?.removeEventListener('play',play);document.removeEventListener('click',click);};
  },[slug]);
  return null;
}
