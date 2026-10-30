'use client';

import {useEffect,useState} from 'react';
import type {DesignImageQuality} from '@/lib/design-image';
import './image-quality-control.css';

export type ImageQuality=DesignImageQuality;
const preferenceKey='fivegen:image-quality';
const preferenceEvent='fivegen:image-quality-changed';
const isQuality=(value:unknown):value is ImageQuality=>value==='low'||value==='medium'||value==='high';

export function readImageQuality():ImageQuality{
 if(typeof window==='undefined')return 'medium';
 try{const value=window.localStorage.getItem(preferenceKey);return isQuality(value)?value:'medium';}catch{return 'medium';}
}

export function rememberImageQuality(value:ImageQuality){
 if(typeof window==='undefined'||!isQuality(value))return;
 try{window.localStorage.setItem(preferenceKey,value);}catch{}
 window.dispatchEvent(new CustomEvent(preferenceEvent,{detail:value}));
}

/** One browser preference shared by the Home composer and design editor. */
export function useImageQuality(){
 const [quality,setQuality]=useState<ImageQuality>('medium');
 useEffect(()=>{
  let active=true;
  const read=()=>{if(active)setQuality(readImageQuality());};
  const changed=(event:Event)=>{const value=(event as CustomEvent<unknown>).detail;if(active&&isQuality(value))setQuality(value);};
  const stored=(event:StorageEvent)=>{if(event.key===preferenceKey||event.key===null)read();};
  queueMicrotask(read);window.addEventListener(preferenceEvent,changed);window.addEventListener('storage',stored);
  return()=>{active=false;window.removeEventListener(preferenceEvent,changed);window.removeEventListener('storage',stored);};
 },[]);
 const choose=(value:ImageQuality)=>{setQuality(value);rememberImageQuality(value);};
 return [quality,choose] as const;
}

export function ImageQualityControl({value,onChange,disabled=false,className='',label='Image quality'}:{value:ImageQuality;onChange:(value:ImageQuality)=>void;disabled?:boolean;className?:string;label?:string}){
 return <div className={`image-quality-control ${className}`.trim()} role="group" aria-label="Image quality"><span>{label}</span><div>{([{value:'low',label:'Low',name:'Low'},{value:'medium',label:'Med',name:'Medium'},{value:'high',label:'High',name:'High'}] as const).map(option=><button key={option.value} type="button" aria-label={`${option.name} image quality`} aria-pressed={value===option.value} disabled={disabled} onClick={()=>{if(!disabled)onChange(option.value);}}>{option.label}</button>)}</div></div>;
}
