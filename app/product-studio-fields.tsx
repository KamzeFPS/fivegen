'use client';

import {useId,useLayoutEffect,useRef,type ReactNode,type RefObject} from 'react';
import {Plus,Trash2} from 'lucide-react';

export type StudioData=Record<string,unknown>;
export const studioObject=(value:unknown):StudioData=>value&&typeof value==='object'&&!Array.isArray(value)?value as StudioData:{};
export const studioRows=(value:unknown):StudioData[]=>Array.isArray(value)?value.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)) as StudioData[]:[];
export const studioStrings=(value:unknown):string[]=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[];
export const studioText=(value:unknown,fallback='')=>typeof value==='string'?value:fallback;
export const studioNumber=(value:unknown,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
export const studioDateTime=(value:unknown)=>typeof value==='number'&&value>0?new Date(value-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):'';

export function useStudioTextarea(value:unknown,active=true,forwarded?:RefObject<HTMLTextAreaElement|null>){
 const fallback=useRef<HTMLTextAreaElement>(null),input=forwarded||fallback;
 useLayoutEffect(()=>{
  const field=input.current;if(!field||!active)return;
  function fit(){
   if(!field!.clientWidth)return;
   field!.style.height='auto';
   field!.style.height=`${field!.scrollHeight+field!.offsetHeight-field!.clientHeight}px`;
  }
  fit();let width=field.clientWidth;
  const observer=new ResizeObserver(()=>{if(field.clientWidth!==width){width=field.clientWidth;fit();}});
  observer.observe(field);
  return()=>observer.disconnect();
 },[value,active,input]);
 return input;
}

export function StudioCard({title,description,children,action,eyebrow}:{title:string;description?:string;children:ReactNode;action?:ReactNode;eyebrow?:string}){
 return <section className="ps-card"><header className="ps-card-heading"><div>{eyebrow&&<span className="ps-eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description&&<p>{description}</p>}</div>{action}</header><div className="ps-card-body">{children}</div></section>;
}
export function StudioText({label,value,onChange,multiline=false,type='text',help,placeholder,maxLength=6000,min,max,step}:{label:string;value:unknown;onChange:(value:string)=>void;multiline?:boolean;type?:string;help?:string;placeholder?:string;maxLength?:number;min?:number;max?:number;step?:number}){
 const id=useId(),input=useStudioTextarea(value,multiline);
 return <label className="ps-field" data-builder-field={label} htmlFor={id}><span>{label}</span>{multiline?<textarea ref={input} id={id} rows={4} value={studioText(value)} maxLength={maxLength} placeholder={placeholder} onChange={event=>onChange(event.target.value)}/>:<input id={id} type={type} value={typeof value==='number'?value:studioText(value)} min={min} max={max} step={step} maxLength={maxLength} placeholder={placeholder} onChange={event=>onChange(event.target.value)}/>} {help&&<small>{help}</small>}</label>;
}
export function StudioSelect({label,value,onChange,options,help}:{label:string;value:unknown;onChange:(value:string)=>void;options:readonly (readonly [string,string])[];help?:string}){
 const id=useId();return <label className="ps-field" data-builder-field={label} htmlFor={id}><span>{label}</span><select id={id} value={studioText(value,options[0]?.[0]||'')} onChange={event=>onChange(event.target.value)}>{options.map(([key,text])=><option value={key} key={key}>{text}</option>)}</select>{help&&<small>{help}</small>}</label>;
}
export function StudioToggle({label,description,checked,onChange}:{label:string;description?:string;checked:boolean;onChange:(checked:boolean)=>void}){
 return <label className="ps-toggle"><span><strong>{label}</strong>{description&&<small>{description}</small>}</span><input type="checkbox" role="switch" checked={checked} onChange={event=>onChange(event.target.checked)}/></label>;
}
export function StudioLines({label,value,onChange,help,placeholder}:{label:string;value:unknown;onChange:(value:string[])=>void;help?:string;placeholder?:string}){
 return <StudioText label={label} value={studioStrings(value).join('\n')} multiline onChange={text=>onChange(text.split('\n'))} help={help||'One item per line.'} placeholder={placeholder}/>;
}
export type StudioColumn={key:string;label:string;multiline?:boolean;type?:string;options?:readonly (readonly [string,string])[];help?:string};
export function StudioRows({label,value,onChange,columns,addLabel='Add item',defaults={},titleKey='title',max=30}:{label:string;value:unknown;onChange:(rows:StudioData[])=>void;columns:StudioColumn[];addLabel?:string;defaults?:StudioData;titleKey?:string;max?:number}){
 const rows=studioRows(value);
 function change(index:number,key:string,next:string){const type=columns.find(column=>column.key===key)?.type;onChange(rows.map((row,rowIndex)=>rowIndex===index?{...row,[key]:type==='number'?Number(next):type==='timestamp'?(next?new Date(next).getTime():0):next}:row));}
 return <div className="ps-collection"><div className="ps-collection-label"><h3>{label}</h3><span>{rows.length}</span></div>{rows.map((row,index)=><details className="ps-collection-item" key={studioText(row.id,String(index))} open={rows.length===1||undefined}><summary><span className="ps-item-number">{String(index+1).padStart(2,'0')}</span><strong>{studioText(row[titleKey]).trim()||`${label.replace(/s$/,'')} ${index+1}`}</strong><span className="ps-disclosure-plus">+</span></summary><div className="ps-collection-fields">{columns.map(column=>column.options?<StudioSelect key={column.key} label={column.label} value={row[column.key]} options={column.options} help={column.help} onChange={next=>change(index,column.key,next)}/>:<StudioText key={column.key} label={column.label} value={column.type==='timestamp'?studioDateTime(row[column.key]):row[column.key]} multiline={column.multiline} type={column.type==='timestamp'?'datetime-local':column.type} help={column.help} onChange={next=>change(index,column.key,next)}/>)}<button type="button" className="ps-remove" onClick={()=>onChange(rows.filter((_,rowIndex)=>rowIndex!==index))}><Trash2 size={14}/>Remove {label.toLowerCase().replace(/s$/,'')}</button></div></details>)}<button type="button" className="ps-add" disabled={rows.length>=max} onClick={()=>onChange([...rows,{id:crypto.randomUUID(),...Object.fromEntries(columns.map(column=>[column.key,column.type==='number'||column.type==='timestamp'?0:''])),...defaults}])}><Plus size={15}/>{addLabel}</button></div>;
}
