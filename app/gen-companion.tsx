'use client';
import {useCallback,useEffect,useRef,useState,type PointerEvent,type KeyboardEvent,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {GenMascot,type GenMood} from './gen-mascot';
import {useMascotSales} from '@/lib/use-mascot-sales';
import './gen-companion.css';

export type GenPosition={left:number;top:number;width:number;height:number};
type Point={left:number;top:number};
type Drag={pointerId:number;x:number;y:number;left:number;top:number;moved:boolean};
type Props={onOpen:()=>void;mood?:GenMood;status?:string;expanded?:boolean;hidden?:boolean;salesEnabled?:boolean;launcherRef?:RefObject<HTMLButtonElement|null>;onPositionChange?:(position:GenPosition)=>void;defaultMinimized?:boolean};
const positionKey='fivegen:gen-position:v1';
const minimizedKey='fivegen:gen-minimized:v1';
export function GenCompanion({onOpen,mood='idle',status='',expanded,hidden=false,salesEnabled=true,launcherRef,onPositionChange,defaultMinimized=false}:Props){
 const [dock,setDock]=useState<HTMLElement|null|undefined>(undefined);
 useEffect(()=>{let current=true;queueMicrotask(()=>{if(current)setDock(document.getElementById('workspace-gen-slot'));});return()=>{current=false;};},[]);
 const docked=!!dock;
 const [hover,setHover]=useState(false),[attentive,setAttentive]=useState(false),[celebration,setCelebration]=useState(''),[saleKey,setSaleKey]=useState('');
 const [minimized,setMinimized]=useState(defaultMinimized);
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(active)try{{const saved=localStorage.getItem(minimizedKey);setMinimized(saved===null?defaultMinimized:saved==='true');}}catch{/* Optional preference. */}});return()=>{active=false;};},[defaultMinimized]);
 function toggleMinimized(){const next=!minimized;setMinimized(next);try{localStorage.setItem(minimizedKey,String(next));}catch{/* Works without storage. */}}
 const [position,setPosition]=useState<Point|null>(null),[dragging,setDragging]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),root=useRef<HTMLDivElement>(null),point=useRef<Point|null>(null),drag=useRef<Drag|null>(null),suppressClick=useRef(false);
 const lastRect=useRef<GenPosition>({left:0,top:0,width:104,height:112}),positionCallback=useRef(onPositionChange),resetFrame=useRef<number|null>(null);
 useEffect(()=>{positionCallback.current=onPositionChange;},[onPositionChange]);
 const onSale=useCallback((sale:{id:string;mode:'test'|'live'})=>{if(timer.current)clearTimeout(timer.current);setSaleKey(sale.id);setCelebration(sale.mode==='test'?'A test sale! Looking good.':'A new sale! You did it!');timer.current=setTimeout(()=>setCelebration(''),6500);},[]);
 useMascotSales({onSale,enabled:salesEnabled});
 const measure=useCallback(()=>{
  const rect=root.current?.getBoundingClientRect();
  return rect&&rect.width>0&&rect.height>0?{left:rect.left,top:rect.top,width:rect.width,height:rect.height}:lastRect.current;
 },[]);
 const viewport=useCallback(()=>{const view=window.visualViewport;return {left:view?.offsetLeft||0,top:view?.offsetTop||0,width:view?.width||window.innerWidth,height:view?.height||window.innerHeight};},[]);
 const move=useCallback((next:Point,persist=false)=>{
  const rect=measure(),view=viewport(),left=Math.min(Math.max(view.left+12,next.left),Math.max(view.left+12,view.left+view.width-rect.width-12)),top=Math.min(Math.max(view.top+12,next.top),Math.max(view.top+12,view.top+view.height-rect.height-12));
  point.current={left,top};setPosition({left,top});lastRect.current={left,top,width:rect.width,height:rect.height};positionCallback.current?.(lastRect.current);
  if(persist)try{localStorage.setItem(positionKey,JSON.stringify({left,top}));}catch{/* Moving Gen also works when browser storage is unavailable. */}
 },[measure,viewport]);
 useEffect(()=>{
  let saved:Point|null=null;
  try{const value:unknown=JSON.parse(localStorage.getItem(positionKey)||'null');if(value&&typeof value==='object'&&'left' in value&&'top' in value&&typeof value.left==='number'&&Number.isFinite(value.left)&&typeof value.top==='number'&&Number.isFinite(value.top))saved={left:value.left,top:value.top};}catch{}
  const sync=()=>{
   if(hidden)return;
   if(docked){const rect=measure();lastRect.current=rect;positionCallback.current?.(rect);return;}
   if(point.current){move(point.current,true);return;}
   const rect=measure(),view=viewport();lastRect.current=rect;
   const outside=rect.left<view.left+12||rect.top<view.top+12||rect.left+rect.width>view.left+view.width-12||rect.top+rect.height>view.top+view.height-12;
   if(outside)move(rect);else positionCallback.current?.(rect);
  };
  const frame=requestAnimationFrame(()=>{if(hidden)return;if(saved&&!docked)move(saved);else sync();}),visual=window.visualViewport;
  window.addEventListener('resize',sync);visual?.addEventListener('resize',sync);visual?.addEventListener('scroll',sync);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',sync);visual?.removeEventListener('resize',sync);visual?.removeEventListener('scroll',sync);};
 },[hidden,minimized,docked,measure,move,viewport]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);if(resetFrame.current!==null)cancelAnimationFrame(resetFrame.current);},[]);
 useEffect(()=>{let rest:ReturnType<typeof setTimeout>|undefined;const notice=(event:Event)=>{const target=event.target;if(!(target instanceof HTMLTextAreaElement)&&!(target instanceof HTMLInputElement&&['text','number','search','url'].includes(target.type)))return;setAttentive(true);if(rest)clearTimeout(rest);rest=setTimeout(()=>setAttentive(false),3500);};document.addEventListener('input',notice);return()=>{document.removeEventListener('input',notice);if(rest)clearTimeout(rest);};},[]);
 function pointerDown(event:PointerEvent<HTMLButtonElement>){
  if(docked)return;
  if(!event.isPrimary||event.button!==0)return;
  suppressClick.current=false;const rect=measure();drag.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,moved:false};
  event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
 }
 function pointerMove(event:PointerEvent<HTMLButtonElement>){
  const start=drag.current;if(!start||start.pointerId!==event.pointerId)return;
  const x=event.clientX-start.x,y=event.clientY-start.y;
  if(!start.moved&&Math.hypot(x,y)<6)return;
  start.moved=true;suppressClick.current=true;setDragging(true);event.preventDefault();move({left:start.left+x,top:start.top+y});
 }
 function pointerEnd(event:PointerEvent<HTMLButtonElement>){
  const start=drag.current;if(!start||start.pointerId!==event.pointerId)return;
  drag.current=null;setDragging(false);
  if(start.moved){suppressClick.current=true;event.preventDefault();if(point.current)move(point.current,true);}
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 function keyboardMove(event:KeyboardEvent<HTMLButtonElement>){
  if(docked)return;
  if(event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.key==='Home'){
   event.preventDefault();point.current=null;setPosition(null);try{localStorage.removeItem(positionKey);}catch{}
   if(resetFrame.current!==null)cancelAnimationFrame(resetFrame.current);
   resetFrame.current=requestAnimationFrame(()=>{resetFrame.current=null;const rect=measure(),view=viewport();if(rect.left<view.left+12||rect.top<view.top+12||rect.left+rect.width>view.left+view.width-12||rect.top+rect.height>view.top+view.height-12)move(rect);else{lastRect.current=rect;positionCallback.current?.(rect);}});return;
  }
  const directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},direction=directions[event.key];if(!direction)return;
  event.preventDefault();const rect=measure(),step=event.shiftKey?24:12;move({left:rect.left+direction[0]*step,top:rect.top+direction[1]*step},true);
 }
 const expression=celebration?'happy':(hover||attentive)&&mood==='idle'?'curious':mood;
 const copy=celebration||status||(expression==='thinking'?'Thinking it through…':expression==='curious'?'What are we making?':expression==='helping'?'Let’s make it a little clearer.':expression==='concerned'?'We can try that together.':'Need a little hand?');
 if(dock===undefined)return null;
 const companion=<div ref={root} className={'gen-companion'+(docked?' is-docked':'')+(expanded?' is-expanded':'')+(hidden?' is-hidden':'')+(minimized?' is-minimized':'')+(dragging?' is-dragging':'')+(!docked&&position&&position.left<220?' is-left':'')+(!docked&&position&&position.top<100?' is-high':'')} style={!docked&&position?{left:position.left,top:position.top,right:'auto',bottom:'auto'}:undefined} data-mood={expression} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
  <div className={'gen-companion-speech'+(celebration||mood==='thinking'||mood==='concerned'?' is-visible':'')} aria-hidden="true">{copy}</div>
  <span className="gen-companion-announcement" role="status" aria-live="polite" aria-atomic="true">{celebration}</span>
  {!docked&&<span className="gen-companion-announcement" id="gen-companion-move-hint">Drag to move Gen. You can also use the arrow keys, or Home to reset the position.</span>}
  <button ref={launcherRef} type="button" className="gen-companion-launcher" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd} onKeyDown={keyboardMove} onClick={event=>{if(suppressClick.current&&event.detail!==0){suppressClick.current=false;event.preventDefault();event.stopPropagation();return;}suppressClick.current=false;onOpen();}} aria-label={expanded?'Close Gen, your product assistant':'Ask Gen, your product assistant'} aria-describedby={docked?undefined:'gen-companion-move-hint'} aria-keyshortcuts={docked?undefined:'ArrowUp ArrowDown ArrowLeft ArrowRight Home'} aria-expanded={expanded} aria-controls={expanded===undefined?undefined:'fivegen-assistant-panel'} aria-haspopup={expanded===undefined?undefined:'dialog'} title={docked?'Ask Gen':expanded?'Close Gen · drag to move':'Ask Gen · drag to move'}><GenMascot key={saleKey} mood={expression} size={94}/><span className="gen-companion-name">{docked||minimized?'Ask Gen':'Gen'}</span></button>
  {!docked&&!expanded&&<button type="button" className="gen-companion-minimize" aria-label={minimized?'Restore Gen mascot':'Minimize Gen mascot'} aria-pressed={minimized} title={minimized?'Restore Gen mascot':'Minimize Gen mascot'} onClick={toggleMinimized}>{minimized?'+':'−'}</button>}
 </div>;
 return dock?createPortal(companion,dock):companion;
}

