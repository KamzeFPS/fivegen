'use client';

import {useRef} from 'react';
import {ArrowRight,Check,ImageIcon,Package,Sparkles} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import type {ProductReadyCompletion} from '@/lib/workspace-product-ready';
import './workspace-product-ready.css';

/** A confirmed new product save, never a claim that the product is published. */
export function WorkspaceProductReady({completion,onClose,onOpen,onImages,onMarketing}:{completion:ProductReadyCompletion;onClose:()=>void;onOpen:()=>void;onImages?:()=>void;onMarketing?:()=>void}){
 const primaryRef=useRef<HTMLButtonElement>(null),settledRef=useRef(false);
 function choose(action:()=>void){if(settledRef.current)return;settledRef.current=true;action();}
 function openProduct(){choose(onOpen);}
 function stayInChat(){choose(onClose);}

 return <Dialog open onOpenChange={open=>{if(!open)stayInChat();}}>
  <DialogContent className="wa-product-ready" onOpenAutoFocus={event=>{event.preventDefault();primaryRef.current?.focus();}} onCloseAutoFocus={event=>event.preventDefault()}>
   <div className="wa-product-ready-mark" aria-hidden="true"><Check/></div>
   <DialogHeader>
    <span className="wa-product-ready-eyebrow">SAVED IN PRODUCTS</span>
    <DialogTitle>Your product draft is ready</DialogTitle>
    <DialogDescription>{completion.delivery==='download'?'Your downloadable product is saved. Review or export the file, then choose how to launch it.':'Your private product is saved. Review it, then choose the next step toward your first customer.'}</DialogDescription>
   </DialogHeader>
   <div className="wa-product-ready-product"><Package aria-hidden="true"/><span>{completion.title}</span></div>
   {(onMarketing||onImages)&&<section className="wa-product-ready-next" aria-label="Continue your launch"><h3>What would you like to do next?</h3>{onMarketing&&<Button variant="outline" onClick={()=>choose(onMarketing)}><Sparkles data-icon="inline-start" aria-hidden="true"/><span><strong>Make a marketing plan</strong><small>Messaging, content and first-customer outreach</small></span><ArrowRight data-icon="inline-end" aria-hidden="true"/></Button>}{onImages&&<Button variant="outline" onClick={()=>choose(onImages)}><ImageIcon data-icon="inline-start" aria-hidden="true"/><span><strong>Create product images</strong><small>Choose the style, quality and cost before generating</small></span><ArrowRight data-icon="inline-end" aria-hidden="true"/></Button>}</section>}
   <div className="wa-product-ready-actions">
    {completion.downloadHref&&<Button asChild size="lg" variant={completion.delivery==='download'?'default':'outline'}><a href={completion.downloadHref} download>Download {completion.exportFormat==='markdown'?'Markdown':completion.exportFormat?.toUpperCase()}</a></Button>}
    <Button ref={primaryRef} size="lg" onClick={openProduct}>Open product<ArrowRight data-icon="inline-end" aria-hidden="true"/></Button>
    <Button variant="ghost" size="lg" onClick={stayInChat}>Stay in chat</Button>
   </div>
   <p className="wa-product-ready-countdown">Every AI step asks for your approval. Nothing is published or sent automatically.</p>
  </DialogContent>
 </Dialog>;
}
