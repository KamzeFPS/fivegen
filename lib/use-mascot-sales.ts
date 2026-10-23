'use client';

import {useEffect,useRef,useState} from 'react';

export type MascotSale={id:string;paidAt:number;amount:number;currency:string};
export type MascotSaleEvent=MascotSale&{mode:'test'|'live'};
export type MascotSalesState={mode:'test'|'live'|null;configured:boolean;paidSales:number|null};
type Status=MascotSalesState&{ownerKey:string;latestSale:MascotSale|null};
type Cursor={id:string;paidAt:number};
const pollDelay=50_000;
const storagePrefix='fivegen:mascot:sales:v1:';
const newer=(sale:Cursor,previous:Cursor|null)=>!previous||sale.paidAt>previous.paidAt||sale.paidAt===previous.paidAt&&sale.id>previous.id;
function cursor(value:unknown):Cursor|null{
  if(!value||typeof value!=='object')return null;
  const record=value as Record<string,unknown>;
  return typeof record.id==='string'&&!!record.id&&record.id.length<=200&&Number.isSafeInteger(record.paidAt)&&Number(record.paidAt)>0?{id:record.id,paidAt:Number(record.paidAt)}:null;
}
function status(value:unknown):Status|null{
  if(!value||typeof value!=='object')return null;
  const record=value as Record<string,unknown>,sale=record.latestSale;
  if(typeof record.ownerKey!=='string'||!record.ownerKey||record.ownerKey.length>200||!['test','live',null].includes(record.mode as string|null)||typeof record.configured!=='boolean'||!Number.isSafeInteger(record.paidSales)||Number(record.paidSales)<0)return null;
  if(sale!==null){
    if(!cursor(sale)||typeof sale!=='object')return null;
    const fields=sale as Record<string,unknown>;
    if(!Number.isSafeInteger(fields.amount)||Number(fields.amount)<=0||typeof fields.currency!=='string'||!/^[a-z]{3}$/i.test(fields.currency))return null;
  }
  if(record.configured&&record.mode===null)return null;
  return {ownerKey:record.ownerKey,mode:record.mode as Status['mode'],configured:record.configured,paidSales:Number(record.paidSales),latestSale:sale as MascotSale|null};
}

/** Observe confirmed new sales while this page is open. The first successful
 * response is a baseline, including on remount, account or payment-mode change.
 * A cursor never moves backwards when refunds alter the latest retained sale. */
export function useMascotSales({onSale,enabled=true}:{onSale:(sale:MascotSaleEvent)=>void;enabled?:boolean}):MascotSalesState{
  const [state,setState]=useState<MascotSalesState>({mode:null,configured:false,paidSales:null});
  const callback=useRef(onSale);
  useEffect(()=>{callback.current=onSale;},[onSale]);
  useEffect(()=>{
    if(!enabled||typeof window==='undefined'||typeof document==='undefined')return;
    let disposed=false,unauthorized=false,inFlight:AbortController|null=null,timer:ReturnType<typeof setTimeout>|null=null;
    let scope='',highWater:Cursor|null=null;
    const visible=()=>document.visibilityState==='visible';
    const clearTimer=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
    const read=(key:string)=>{try{return cursor(JSON.parse(window.localStorage.getItem(key)||'null'));}catch{return null;}};
    const remember=(key:string,sale:Cursor)=>{highWater=sale;try{window.localStorage.setItem(key,JSON.stringify(sale));}catch{/* The in-memory cursor still prevents repeats when storage is unavailable. */}};
    const mergeStored=()=>{const saved=scope?read(scope):null;if(saved&&newer(saved,highWater))highWater=saved;};
    async function consume(report:Status,current:()=>boolean){
      const key=storagePrefix+encodeURIComponent(report.ownerKey)+':'+String(report.mode),sale=report.latestSale;
      if(key!==scope){
        scope=key;highWater=read(key);
        if(sale&&newer(sale,highWater)){
          // Baselines are historical only for this tab. Persisting one would
          // consume a first sale that an already-open tab has yet to observe.
          highWater=sale;
        }
        return;
      }
      if(!report.configured||!report.mode||!sale)return;
      const claim=()=>{
        if(!current()||scope!==key)return;
        mergeStored();
        if(!newer(sale,highWater))return;
        // Persist before notifying. Other tabs see the same cursor, while a
        // browser Web Lock serializes simultaneous successful polls.
        remember(key,sale);
        try{callback.current({...sale,mode:report.mode as 'test'|'live'});}catch{/* A mascot animation cannot interrupt polling or purchase access. */}
      };
      const locks=typeof navigator==='undefined'?undefined:navigator.locks;
      if(locks){try{await locks.request(key,claim);return;}catch{/* Storage remains a best-effort cross-tab fallback when locks are denied. */}}
      claim();
    }
    function schedule(){clearTimer();if(!disposed&&!unauthorized&&visible())timer=setTimeout(()=>{timer=null;void poll();},pollDelay);}
    async function poll(){
      if(disposed||unauthorized||!visible()||inFlight)return;
      clearTimer();const controller=new AbortController();inFlight=controller;
      const current=()=>!disposed&&!unauthorized&&!controller.signal.aborted&&inFlight===controller&&visible();
      try{
        const response=await fetch('/api/mascot/status',{method:'GET',cache:'no-store',credentials:'same-origin',signal:controller.signal});
        if(!current())return;
        if(response.status===401){unauthorized=true;clearTimer();return;}
        if(!response.ok)return;
        const report=status(await response.json());if(!current()||!report)return;
        setState({mode:report.mode,configured:report.configured,paidSales:report.paidSales});
        await consume(report,current);
      }catch{/* Transient failures are quiet and retry on the next visible poll. */}
      finally{if(inFlight===controller){inFlight=null;schedule();}}
    }
    const focus=()=>{if(visible())void poll();};
    const visibility=()=>{
      if(visible())void poll();
      else{clearTimer();inFlight?.abort();inFlight=null;}
    };
    const storage=(event:StorageEvent)=>{if(event.key===scope)mergeStored();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);window.addEventListener('storage',storage);
    void poll();
    return()=>{disposed=true;clearTimer();inFlight?.abort();inFlight=null;window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('storage',storage);};
  },[enabled]);
  return state;
}
