'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {Brand} from '@/app/ui-brand';
import { commerceMoney, isConsulting, commerceResponse } from '@/lib/commerce-v2';
import type { ProductContent } from '@/lib/product';

type Purchase = { id:string; title:string; status:string; amount:number; currency:string; mode:string };
type Content = { id:string; title:string; format:string; sections:ProductContent['sections']; files:{name:string; description:string}[]; downloads?:{id:string; name:string; mime:string; size:number}[]; service?:boolean; serviceScope?:string; preparation?:string; communityUrl?:string; intakePrompt:string; meetingUrl:string; booking:null|{starts_at:number; ends_at:number; intake:string}; slots:{id:string; starts_at:number; ends_at:number}[] };

function paidSelection(orders:Purchase[], preferred:string|null, current:string) {
  const paid = orders.filter(order => order.status === 'paid');
  return paid.find(order => order.id === current)?.id || paid.find(order => order.id === preferred)?.id || paid[0]?.id || '';
}

export function CustomerPortal() {
  const [orders, setOrders] = useState<Purchase[]>([]), [content, setContent] = useState<Content|null>(null), [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [orderError, setOrderError] = useState('');
  const [contentLoading, setContentLoading] = useState(false), [contentError, setContentError] = useState(''), [contentRetry, setContentRetry] = useState(0);
  const [intake, setIntake] = useState(''), [slot, setSlot] = useState(''), [booking, setBooking] = useState(false), [bookingError, setBookingError] = useState('');
  const mounted = useRef(false), orderRequest = useRef(0), selectedRef = useRef(selected);
  selectedRef.current = selected;

  const load = useCallback(async (initial = false) => {
    const request = ++orderRequest.current;
    if (!initial) setRefreshing(true);
    setOrderError('');
    try {
      const order = new URLSearchParams(location.search).get('order');
      const response = await fetch(`/api/commerce/customer${order ? '?order=' + encodeURIComponent(order) : ''}`, { cache:'no-store' });
      const data = await commerceResponse<{orders:Purchase[]; paymentStatusError?:string}>(response);
      if (!mounted.current || request !== orderRequest.current) return;
      setOrders(data.orders);
      setOrderError(data.paymentStatusError || '');
      setSelected(current => paidSelection(data.orders, order, current));
    } catch (error) {
      if (mounted.current && request === orderRequest.current) setOrderError(error instanceof Error ? error.message : 'Unable to load purchases.');
    } finally {
      if (mounted.current && request === orderRequest.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load(true);
    return () => { mounted.current = false; orderRequest.current++; };
  }, [load]);

  useEffect(() => {
    if (!selected) { setContent(null); setContentLoading(false); setContentError(''); return; }
    let active = true;
    setContent(null); setContentLoading(true); setContentError(''); setBookingError('');
    fetch(`/api/commerce/customer/${encodeURIComponent(selected)}`, { cache:'no-store' }).then(async response => {
      const data = await commerceResponse<Content>(response);
      if (active && mounted.current) { setContent(data); setSlot(''); setIntake(''); }
    }).catch(error => {
      if (active && mounted.current) setContentError(error instanceof Error ? error.message : 'Unable to open this product.');
    }).finally(() => { if (active && mounted.current) setContentLoading(false); });
    return () => { active = false; };
  }, [selected, contentRetry]);

  async function reserve(event:React.FormEvent) {
    event.preventDefault();
    const purchase = selected;
    setBooking(true); setBookingError('');
    try {
      const response = await fetch(`/api/commerce/customer/${encodeURIComponent(purchase)}/booking`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({slotId:slot, intake}) });
      const data = await commerceResponse<Content>(response);
      if (mounted.current && selectedRef.current === purchase) setContent(data);
    } catch (error) {
      if (mounted.current && selectedRef.current === purchase) setBookingError(error instanceof Error ? error.message : 'Unable to book.');
    } finally { if (mounted.current) setBooking(false); }
  }

  async function cancelBooking() {
    const purchase = selected;
    setBooking(true); setBookingError('');
    try {
      const response = await fetch(`/api/commerce/customer/${encodeURIComponent(purchase)}/booking`, { method:'DELETE' });
      const data = await commerceResponse<Content>(response);
      if (mounted.current && selectedRef.current === purchase) { setContent(data); setSlot(''); }
    } catch (error) {
      if (mounted.current && selectedRef.current === purchase) setBookingError(error instanceof Error ? error.message : 'Unable to cancel.');
    } finally { if (mounted.current) setBooking(false); }
  }

  const selectedContent = content?.id === selected ? content : null;
  const paidOrders = orders.filter(order=>order.status==='paid'), otherOrders = orders.filter(order=>order.status!=='paid');
  return <main className="customer-portal">
    <header><Link href="/" aria-label="FiveGen home"><Brand/></Link><span>Customer library</span><Link href="/signin-with-chatgpt?return_to=%2Fcustomer">Use your purchase email</Link></header>
    <section className="customer-heading"><span className="eyebrow">YOUR LIBRARY</span><h1>Your purchases</h1><p>Everything you’ve purchased, ready to open and download.</p></section>
    {orderError && <div className="commerce-notice customer-notice" role="alert"><p>{orderError}</p><button className="button secondary" disabled={refreshing} onClick={() => void load()}>{refreshing ? 'Checking…' : 'Retry payment status'}</button></div>}
    {loading ? <p role="status">Checking your purchases…</p> : !orders.length ? !orderError && <div className="commerce-empty"><h2>No purchases in this session</h2><p>Use the checkout return link in the browser where you purchased, or sign in with the email you used at checkout.</p></div> : <div className="customer-layout">
      <aside aria-label="Your purchases">
        <h2 className="customer-library-label">Available products <span>{paidOrders.length}</span></h2>
        {!!paidOrders.length&&<label className="customer-product-select" htmlFor="customer-product-select">Your product<select id="customer-product-select" value={selected} disabled={booking} onChange={event=>{if(event.target.value!==selected)setSelected(event.target.value);}}>{paidOrders.map(order=><option key={order.id} value={order.id}>{order.title} · {commerceMoney(order.amount,order.currency)}</option>)}</select></label>}
        <div className="customer-available-products">
        {paidOrders.map(order => <button className={`customer-purchase ${selected === order.id ? 'active' : ''}`} key={order.id} disabled={booking} aria-pressed={selected === order.id} onClick={() => {
          if (selected !== order.id) setSelected(order.id);
          else if (contentError) setContentRetry(value => value + 1);
        }}><strong>{order.title}</strong><span>{commerceMoney(order.amount, order.currency)} · paid{order.mode === 'test' ? ' · Test' : ''}</span><span className="customer-open-product">{selected === order.id ? 'Viewing product' : 'Open product'} <span aria-hidden="true">↗</span></span></button>)}
        </div>
        {!!otherOrders.length&&<details className="customer-other-orders" open={!paidOrders.length}><summary>Other orders <span>{otherOrders.length}</span></summary>{otherOrders.map(order=><div className="customer-purchase customer-purchase-pending" key={order.id}><strong>{order.title}</strong><span>{commerceMoney(order.amount, order.currency)} · {order.status}{order.mode==='test'?' · Test':''}</span>{order.status==='pending'&&<small>Waiting for payment confirmation.</small>}</div>)}</details>}
        {orders.some(order => order.status === 'pending') && <div className="customer-payment-refresh"><button className="button secondary" disabled={refreshing} onClick={() => void load()}>{refreshing ? 'Checking payment…' : 'Check payment status'}</button><small>Your paid products stay available while we check.</small></div>}
      </aside>
      <section className="customer-content" aria-label="Purchased product" aria-busy={contentLoading || !!selected && !selectedContent && !contentError}>
        {!selected ? <div className="commerce-empty"><h2>Your product is waiting for confirmation</h2><p>Check payment status to open it once your payment is confirmed.</p></div> : contentError ? <div className="commerce-notice customer-notice" role="alert"><h2>We couldn’t open your product</h2><p>{contentError}</p><button className="button secondary" onClick={() => setContentRetry(value => value + 1)}>Try opening again</button></div> : !selectedContent ? <p role="status">Opening your product…</p> : <>
          <div className="customer-product-heading"><span className="eyebrow">{selectedContent.format}</span><h2>{selectedContent.title}</h2><div className="customer-content-meta">{!!selectedContent.downloads?.length&&<span>{selectedContent.downloads.length} {selectedContent.downloads.length===1?'download':'downloads'}</span>}{!!selectedContent.sections.length&&<a href="#customer-reading">{selectedContent.sections.length} {selectedContent.sections.length===1?'section':'sections'} · Read below <span aria-hidden="true">↓</span></a>}</div></div>
          {bookingError && <div className="commerce-notice" role="alert">{bookingError}</div>}
          {!!selectedContent.downloads?.length && <article className="customer-lesson customer-resources"><h3>Download your files</h3><p>Keep a copy and open it in your preferred app.</p>{selectedContent.downloads.map(file => <a className="customer-download customer-primary-download" key={file.id} href={`/api/commerce/customer/${selectedContent.id}/uploads/${file.id}`}><strong>{file.name}</strong><span className="customer-download-action">Download your file <span aria-hidden="true">↓</span></span></a>)}</article>}
          {!!selectedContent.files.length && <article className="customer-lesson customer-resources"><h3>Your resources</h3>{selectedContent.files.map(file => <a className="customer-download" key={file.name} href={`/api/commerce/customer/${selectedContent.id}/files/${encodeURIComponent(file.name)}`}><strong>{file.name}</strong><span>{file.description}</span><span className="customer-download-action">Download resource <span aria-hidden="true">↓</span></span></a>)}</article>}
          {selectedContent.communityUrl && <article className="customer-lesson"><h3>Your community</h3><p>Your membership includes access to your creator’s external community.</p><a className="button primary" href={selectedContent.communityUrl} target="_blank" rel="noopener noreferrer">Open your community</a></article>}
          {(selectedContent.service ?? isConsulting(selectedContent.format)) && <article className="customer-lesson"><h3>{selectedContent.booking ? 'Your session is confirmed' : 'Book your session'}</h3>{selectedContent.serviceScope && <p>{selectedContent.serviceScope}</p>}{selectedContent.preparation && <div><h4>Before your session</h4><p style={{whiteSpace:'pre-wrap'}}>{selectedContent.preparation}</p></div>}{selectedContent.booking ? <><p>{new Date(selectedContent.booking.starts_at).toLocaleString()} – {new Date(selectedContent.booking.ends_at).toLocaleTimeString()}</p><p>{selectedContent.booking.intake}</p>{selectedContent.meetingUrl && <a className="button primary" href={selectedContent.meetingUrl} target="_blank" rel="noopener noreferrer">Join session</a>}<p>Need a different time? Cancel this booking, then choose another available slot.</p><button className="button secondary" disabled={booking} onClick={() => void cancelBooking()}>{booking ? 'Updating booking…' : 'Cancel booking'}</button></> : selectedContent.slots.length ? <form onSubmit={reserve}><label>Available times (your local timezone)<select required value={slot} onChange={event => setSlot(event.target.value)}><option value="">Select a time</option>{selectedContent.slots.map(item => <option key={item.id} value={item.id}>{new Date(item.starts_at).toLocaleString()} · {Math.round((item.ends_at-item.starts_at)/60000)} min</option>)}</select></label><label>{selectedContent.intakePrompt || 'What would you like help with?'}<textarea required minLength={5} maxLength={5000} value={intake} onChange={event => setIntake(event.target.value)}/></label><button className="button primary" disabled={booking}>{booking ? 'Reserving…' : 'Confirm booking'}</button></form> : <p>Your creator hasn’t added upcoming times yet. Contact them to arrange your session.</p>}</article>}
          {!!selectedContent.sections.length&&<div className="customer-reading" id="customer-reading"><h3>Inside your product</h3><p>Open a section to read or watch.</p>{selectedContent.sections.map((section,index)=><details className="customer-lesson customer-reading-section" key={selectedContent.id+':'+(section.id||index)} open={index===0}><summary><span className="customer-section-number">{String(index+1).padStart(2,'0')}</span><span>{section.category&&<small>{section.category}</small>}<strong>{section.title}</strong></span><span className="customer-section-chevron" aria-hidden="true">⌄</span></summary><div className="customer-section-body">{section.videoId&&<video controls playsInline preload="metadata" src={`/api/commerce/customer/${selectedContent.id}/video/${section.videoId}`}/>}<div style={{whiteSpace:'pre-wrap'}}>{section.body}</div></div></details>)}</div>}
          {!selectedContent.sections.length && !selectedContent.files.length && !selectedContent.downloads?.length && !selectedContent.communityUrl && !(selectedContent.service ?? isConsulting(selectedContent.format)) && <div className="commerce-empty"><h3>Your payment is confirmed</h3><p>This product does not have any resources available yet. Contact the creator for your purchased content.</p></div>}
        </>}
      </section>
    </div>}
  </main>;
}
