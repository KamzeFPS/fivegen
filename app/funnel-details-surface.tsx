'use client';

import {useSyncExternalStore,type ReactNode} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';

/** Keep the diagram in view on desktop; isolate details in a real modal on phones. */
export function FunnelDetailsSurface({children,title,onClose}:{children:ReactNode;title:string;onClose:()=>void}){
  const mobile=useSyncExternalStore(callback=>{const media=window.matchMedia('(max-width:900px)');media.addEventListener('change',callback);return()=>media.removeEventListener('change',callback);},()=>window.matchMedia('(max-width:900px)').matches,()=>false);
  if(!mobile)return children;
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="fj-mobile-dialog funnel-builder" showCloseButton={false}><DialogHeader className="sr-only"><DialogTitle>{title}</DialogTitle><DialogDescription>Explore this funnel step, edit your plan or schedule content.</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>;
}
