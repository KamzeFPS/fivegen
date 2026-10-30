'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,Package} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import type {ProductReadyCompletion} from '@/lib/workspace-product-ready';
import './workspace-product-ready.css';

/** A confirmed new product save, never a claim that the product is published. */
export function WorkspaceProductReady({completion,onClose,onOpen}:{completion:ProductReadyCompletion;onClose:()=>void;onOpen:()=>void}){
 const [seconds,setSeconds]=useState(5);
 const primaryRef=useRef<HTMLButtonElement>(null),settledRef=useRef(false);
 const timerRef=useRef<ReturnType<typeof setTimeout>|null>(null),openRef=useRef(onOpen);
 openRef.current=onOpen;
 function stopTimer(){if(timerRef.current!==null){clearTimeout(timerRef.current);timerRef.current=null;}}
 function openProduct(){if(settledRef.current)return;settledRef.current=true;stopTimer();openRef.current();}
 function stayInChat(){if(settledRef.current)return;settledRef.current=true;stopTimer();onClose();}

 useEffect(()=>{
  let remaining=5,active=true;settledRef.current=false;setSeconds(remaining);
  function schedule(){
   if(!active||settledRef.current||document.hidden)return;
   timerRef.current=setTimeout(()=>{
    timerRef.current=null;if(!active||settledRef.current||document.hidden)return;
    remaining--;setSeconds(remaining);
    if(remaining===0){settledRef.current=true;openRef.current();}else schedule();
   },1000);
  }
  function visibilityChanged(){stopTimer();if(!document.hidden)schedule();}
  document.addEventListener('visibilitychange',visibilityChanged);schedule();
  return()=>{active=false;stopTimer();document.removeEventListener('visibilitychange',visibilityChanged);};
 },[completion.key]);

 return <Dialog open onOpenChange={open=>{if(!open)stayInChat();}}>
  <DialogContent className="wa-product-ready" onOpenAutoFocus={event=>{event.preventDefault();primaryRef.current?.focus();}} onCloseAutoFocus={event=>event.preventDefault()}>
   <div className="wa-product-ready-mark" aria-hidden="true"><Check/></div>
   <DialogHeader>
    <span className="wa-product-ready-eyebrow">SAVED IN PRODUCTS</span>
    <DialogTitle>Your product draft is ready</DialogTitle>
    <DialogDescription>Saved privately in your workspace. Review your content before you publish.</DialogDescription>
   </DialogHeader>
   <div className="wa-product-ready-product"><Package aria-hidden="true"/><span>{completion.title}</span></div>
   <div className="wa-product-ready-actions">
    <Button ref={primaryRef} size="lg" onClick={openProduct}>Open product<ArrowRight data-icon="inline-end" aria-hidden="true"/></Button>
    <Button variant="ghost" size="lg" onClick={stayInChat}>Stay in chat</Button>
   </div>
   <p className="wa-product-ready-countdown" aria-live="off">{seconds>0?<>Opening your product in <strong>{seconds}</strong> {seconds===1?'second':'seconds'}…</>:'Opening your product…'}</p>
  </DialogContent>
 </Dialog>;
}
