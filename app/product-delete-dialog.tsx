'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {Loader2,Trash2} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import type {Product} from '@/lib/product';
import './product-delete.css';

type ProductSummary=Pick<Product,'id'|'title'|'updatedAt'>;
type DeletionCheck={product:ProductSummary;canDelete:boolean;blockers:string[];revision:string};

export function ProductDeleteDialog({product,open,onOpenChange,onDeleted,disabled=false}:{product:ProductSummary;open:boolean;onOpenChange:(open:boolean)=>void;onDeleted?:()=>void;disabled?:boolean}){
 const [check,setCheck]=useState<DeletionCheck|null>(null),[confirmation,setConfirmation]=useState(''),[loading,setLoading]=useState(true),[deleting,setDeleting]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const busy=useRef(false),cancelButton=useRef<HTMLButtonElement>(null),previousFocus=useRef<HTMLElement|null>(null),inputId=useId();
 useEffect(()=>{
  if(!open)return;
  const controller=new AbortController();
  setLoading(true);setCheck(null);setConfirmation('');setError('');
  void fetch(`/api/products/${encodeURIComponent(product.id)}/deletion`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json() as DeletionCheck&{error?:string};
   if(!response.ok)throw new Error(data.error||'Could not check this product. Please try again.');
   if(!controller.signal.aborted)setCheck(data);
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Could not check this product.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[open,product.id,attempt]);
 async function remove(){
  if(busy.current||disabled||!check?.canDelete||confirmation!==check.product.title)return;
  busy.current=true;setDeleting(true);setError('');
  try{
   const response=await fetch(`/api/products/${encodeURIComponent(product.id)}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:confirmation,expectedUpdatedAt:check.product.updatedAt,revision:check.revision})});
   const data=await response.json() as {deleted?:boolean;error?:string};
   if(!response.ok||!data.deleted)throw new Error(data.error||'The product could not be deleted.');
   try{sessionStorage.removeItem(`fivegen:builder-draft:${product.id}`);localStorage.removeItem(`fivegen:builder-agent:${product.id}`);}catch{/* Server deletion is already complete. */}
   if(onDeleted)onDeleted();else location.assign('/?view=library');
  }catch(reason){setError(reason instanceof Error?reason.message:'The product could not be deleted.');setCheck(null);setConfirmation('');}
  finally{busy.current=false;setDeleting(false);}
 }
 return <Dialog open={open} onOpenChange={next=>{if(!busy.current)onOpenChange(next);}}><DialogContent className="product-delete-dialog" showCloseButton={!deleting} onOpenAutoFocus={event=>{previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;event.preventDefault();cancelButton.current?.focus();}} onCloseAutoFocus={event=>{const target=previousFocus.current;if(target?.isConnected){event.preventDefault();target.focus();}else{const trigger=Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button=>button.getAttribute('aria-label')===`Actions for ${product.title}`);if(trigger){event.preventDefault();trigger.focus();}}}}>
  <DialogHeader><DialogTitle>Delete product?</DialogTitle><DialogDescription>Delete “{check?.product.title||product.title}” from your workspace. This cannot be undone.</DialogDescription></DialogHeader>
  {loading?<p className="product-delete-loading" role="status"><Loader2 size={17} className="spin"/>Checking product activity…</p>:check?.canDelete?<>
   <p>Your saved product content, public pages, leads, applications and product marketing history will be removed. Planning conversations, saved brands and shared Creator library sources stay in your workspace.</p>
   <label className="product-delete-confirm" htmlFor={inputId}><span>Type <strong>{check.product.title}</strong> to confirm</span><input id={inputId} value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} disabled={deleting||disabled}/></label>
  </>:check?<div className="product-delete-blocked"><h3>This product can’t be deleted yet</h3><ul>{check.blockers.map(reason=><li key={reason}>{reason}</li>)}</ul><p>You can pause new sales in <a href={`/?project=${encodeURIComponent(product.id)}&area=commerce`}>Price &amp; access</a>.</p></div>:null}
  {error&&<div className="product-delete-error" role="alert"><p>{error}</p><button type="button" className="text-link" disabled={loading||deleting} onClick={()=>setAttempt(value=>value+1)}>Recheck product</button></div>}
  <div className="product-delete-actions"><button type="button" ref={cancelButton} className="button secondary" disabled={deleting} onClick={()=>onOpenChange(false)}>{check&&!check.canDelete?'Close':'Keep product'}</button><button type="button" className="button product-delete-button" disabled={loading||deleting||disabled||!check?.canDelete||confirmation!==check.product.title} onClick={()=>void remove()}>{deleting?<Loader2 size={16} className="spin"/>:<Trash2 size={16}/>} {deleting?'Deleting…':'Delete product'}</button></div>
 </DialogContent></Dialog>;
}

export function ProductDeletePanel({product,disabled=false,onDeleted}:{product:ProductSummary;disabled?:boolean;onDeleted?:()=>void}){
 const [open,setOpen]=useState(false);
 return <section className="product-delete-panel" aria-label="Delete product"><div><h2>Delete product</h2><p>Permanently remove this product and its pages. Products with customers or payment records are protected.</p>{disabled&&<small>Finish saving and wait for current work to complete before deleting.</small>}</div><button type="button" className="button product-delete-button" disabled={disabled} onClick={()=>setOpen(true)}><Trash2 size={16}/>Delete product…</button><ProductDeleteDialog product={product} open={open} onOpenChange={setOpen} onDeleted={onDeleted} disabled={disabled}/></section>;
}
