'use client';

import {useRef,type ReactNode} from 'react';
import {Sparkles} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import './ai-credit-consent.css';

export type AICreditPermission={allowGeneration:true;maxCredits:number;delivery?:'in_app'|'download'|'both';exportFormat?:'pdf'|'epub'|'html'|'markdown'|'zip'|null};

/** One deliberate approval for one AI request, including included actions. */
export function AICreditConsent({open,title,description,cost,included,onCancel,onConfirm,children}:{open:boolean;title:string;description:string;cost:number;included?:string;onCancel:()=>void;onConfirm:()=>void;children?:ReactNode}){
 const cancelRef=useRef<HTMLButtonElement>(null);
 return <Dialog open={open} onOpenChange={value=>{if(!value)onCancel();}}><DialogContent className="ai-credit-consent" onOpenAutoFocus={event=>{event.preventDefault();cancelRef.current?.focus();}}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><div className="ai-credit-consent-cost"><Sparkles size={21} aria-hidden="true"/><div><strong>{cost} {cost===1?'credit':'credits'}</strong><p>{included||'For this AI step only'}</p></div></div>{children}<p className="ai-credit-consent-boundary">Only this step is approved. Gen will ask again before the next AI action.</p><DialogFooter><Button ref={cancelRef} variant="outline" onClick={onCancel}>Not now</Button><Button onClick={onConfirm}>{cost?`Approve ${cost} credits`:'Approve included AI step'}</Button></DialogFooter></DialogContent></Dialog>;
}
