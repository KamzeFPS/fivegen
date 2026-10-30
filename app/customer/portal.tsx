'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {Brand} from '@/app/ui-brand';
import {AppearanceControl} from '@/app/appearance';
import { commerceMoney, commerceResponse } from '@/lib/commerce-v2';
import type { ProductContent } from '@/lib/product';
import type {PublicProductPage} from '@/lib/product-page';
import {ArrowDownToLine,ArrowRight,BookOpen,CalendarDays,CheckCircle2,ChevronDown,Clock3,GraduationCap,Layers,LockKeyhole,Play,Users} from 'lucide-react';
import {buyerPresentation,buyerFileType} from './presentation';
import {CustomerLearning} from './learning-content';
import {CustomerCommunity} from './community-content';
import {CustomerService} from './service-content';
import {PurchasedProductResources} from './product-resources';
import {ProductDownloadList} from './product-download-list';
import {ProductPushReminders} from './product-push';
import {ProductReminders,ProductFulfillment,ProductUpdateNotice} from './delivery-controls';
import {TeamContent} from './team-content';
import {BuyerSubscription} from './delivery-controls';
import {PurchaseHelp,PurchaseRecovery} from './purchase-help';
import {WrittenContent} from './written-content';
import {WorkspaceExample} from '../workspace-example';
import type {ProductStudioConfig} from '@/lib/product-studio-contract';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import './customer-experience.css';

type Purchase = { id:string; title:string; status:string; amount:number; currency:string; mode:string;subscription?:boolean };
type Content = { id:string; slug?:string; page?:PublicProductPage|null; title:string; format:string; builderType?:string;deliveryFamily?:string;description?:string;coverUrl?:string|null;welcome?:string;rules?:string;usageInstructions?:string;compatibleTools?:string;dailyTime?:string;completionCriteria?:string;deliveryEmail?:{state:string}|null;studio?:ProductStudioConfig;accessRole?:'purchaser'|'team'; sections:ProductContent['sections']; files:{name:string; description:string}[]; downloads?:{id:string; name:string; mime:string; size:number}[]; service?:boolean; serviceScope?:string; preparation?:string; communityUrl?:string; intakePrompt:string; meetingUrl:string; booking:null|{starts_at:number; ends_at:number; intake:string}; slots:{id:string; starts_at:number; ends_at:number}[] };

function ProductCover({content}:{content:Content}){
 const [failed,setFailed]=useState(false),presentation=buyerPresentation(content),Icon=presentation.family==='course'?GraduationCap:presentation.family==='templates'?Layers:presentation.family==='service'?CalendarDays:presentation.family==='community'?Users:presentation.family==='challenge'?CheckCircle2:BookOpen;
 return <div className={`buyer-cover ${!content.coverUrl||failed?'without-cover':''}`}>{content.coverUrl&&!failed?<img src={content.coverUrl} alt={`Cover of ${content.title}`} width={320} height={400} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<><Icon size={42} strokeWidth={1.25} aria-hidden="true"/><span>{presentation.label}</span></>}</div>;
}

function ProductHero({content,order}:{content:Content;order?:Purchase}){
 const info=buyerPresentation(content),download=content.downloads?.[0],files=content.files.length+(content.downloads?.length||0),isService=info.family==='service',hasReading=content.sections.length>0;
 const primary=info.family==='community'&&content.studio?.community?.enabled?{href:'#customer-community',label:'Open your community'}:info.family==='community'&&content.communityUrl?{href:content.communityUrl,label:'Join your community',external:true}:isService?{href:'#customer-session',label:content.booking?'View your session':'Choose a time'}:info.family==='templates'&&files?{href:'#customer-downloads',label:'Get your templates'}:info.family==='course'&&hasReading?{href:'#customer-reading',label:'Start learning'}:info.family==='challenge'&&hasReading?{href:'#customer-reading',label:'Start the challenge'}:download?{href:`/api/commerce/customer/${content.id}/uploads/${download.id}`,label:buyerFileType(download.name)==='PDF'?'Download original PDF':'Download your file'}:hasReading?{href:'#customer-reading',label:info.reading}:files?{href:'#customer-downloads',label:'Get your files'}:null;
 const profile=content.page,config=profile?.config,canReview=!!profile&&config?.showReviews&&order?.mode==='live'&&order.status==='paid'&&order.amount>0&&content.accessRole!=='team';
 return <>{config?.bannerUploadId&&profile&&<div className="product-page-banner has-image" style={{borderRadius:'16px',overflow:'hidden'}}><img src={`/api/product-pages/${encodeURIComponent(profile.product.slug)}/image/banner`} alt=""/></div>}<section className={`buyer-product-hero family-${info.family}`} aria-label="Your purchased product"><ProductCover key={content.id+content.coverUrl} content={content}/><div className="buyer-hero-copy"><div className="buyer-product-kicker"><span>{info.label}</span><span><CheckCircle2 size={14}/> Purchased{order?.mode==='test'?' · Test':''}</span></div>{config?.iconUploadId&&profile&&<img src={`/api/product-pages/${encodeURIComponent(profile.product.slug)}/image/icon`} alt="" width={56} height={56} style={{borderRadius:'14px',objectFit:'cover'}}/>}<h2>{content.title}</h2>{config?.welcomeMessage&&<p className="buyer-preserve-lines">{config.welcomeMessage}</p>}<p className="buyer-hero-intro">{info.intro}</p>{content.description&&<p className="buyer-product-description">{content.description.length>240?content.description.slice(0,237)+'…':content.description}</p>}<div className="buyer-product-meta">{hasReading&&<span><BookOpen size={14}/>{content.sections.length} {content.sections.length===1?info.unit.toLowerCase():info.plural}</span>}{files>0&&<span><ArrowDownToLine size={14}/>{files} {files===1?'file':'files'}</span>}{content.dailyTime&&<span><Clock3 size={14}/>{content.dailyTime}</span>}{order&&<span>{commerceMoney(order.amount,order.currency)} paid</span>}</div>{config&&<div className="buyer-product-meta">{config.showCreator&&config.creatorName&&<span>Created by {config.creatorName}</span>}{config.showLocation&&config.location&&<span>{config.location}</span>}{config.links.map((link,index)=><a key={index} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} <ArrowRight size={13}/></a>)}{config.showReviews&&profile&&<a href={`${profile.publicPath}${canReview?'?order='+encodeURIComponent(content.id):''}`}>{profile.reviewSummary.count>0?`${profile.reviewSummary.average?.toFixed(1)} · ${profile.reviewSummary.count} customer reviews`:canReview?'Review your purchase':'View product page'} <ArrowRight size={13}/></a>}</div>}{config?.about&&<details className="buyer-about"><summary>About this product <ChevronDown size={15}/></summary><p className="buyer-preserve-lines">{config.about}</p></details>}<div className="buyer-hero-actions">{primary&&<a className="buyer-button primary" href={primary.href} {...('external' in primary&&primary.external?{target:'_blank',rel:'noopener noreferrer'}:{})}>{info.family==='course'?<Play size={16}/>:isService?<CalendarDays size={16}/>:info.family==='community'?<Users size={16}/>:primary.href==='#customer-reading'?<BookOpen size={16}/>:<ArrowDownToLine size={16}/>} {primary.label}<ArrowRight size={16}/></a>}{hasReading&&download&&info.family==='document'&&<a className="buyer-button secondary" href="#customer-reading"><BookOpen size={16}/>Read online</a>}{files>1&&primary?.href!=='#customer-downloads'&&<a className="buyer-button secondary" href="#customer-downloads"><ArrowDownToLine size={16}/>View all {files} files</a>}</div><p className="buyer-access-note"><LockKeyhole size={13}/>{primary?'Your confirmed purchase is available here. Keep this page to return anytime.':'Payment is confirmed. Your creator still needs to add the purchased resources. Use purchase help below.'}</p>{content.deliveryEmail?.state==='sent'&&<p className="buyer-email-status"><CheckCircle2 size={14}/> An access link was sent to your checkout email.</p>}{content.deliveryEmail?.state==='failed'&&<p className="buyer-email-status">The access email could not be confirmed. Your purchase remains available here. <a href="#purchase-help">Get purchase help</a>.</p>}{content.deliveryEmail?.state==='queued'&&<p className="buyer-email-status">Your access email is being prepared. Your product is ready here.</p>}</div></section></>;
}

function paidSelection(orders:Purchase[], preferred:string|null, current:string) {
  const paid = orders.filter(order => order.status === 'paid');
  return paid.find(order => order.id === current)?.id || paid.find(order => order.id === preferred)?.id || paid[0]?.id || '';
}


function renderResources(content:Content,presentation:ReturnType<typeof buyerPresentation>){return <ProductDownloadList content={content} family={presentation.family}/>;}

export function CustomerPortal() {
  const [orders, setOrders] = useState<Purchase[]>([]), [content, setContent] = useState<Content|null>(null), [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [orderError, setOrderError] = useState('');
  const [contentLoading, setContentLoading] = useState(false), [contentError, setContentError] = useState(''), [contentRetry, setContentRetry] = useState(0);
  const [intake, setIntake] = useState(''), [slot, setSlot] = useState(''), [booking, setBooking] = useState(false), [bookingError, setBookingError] = useState(''), [confirmCancel,setConfirmCancel]=useState(false),[requestedOrder,setRequestedOrder]=useState('');
  const mounted = useRef(false), orderRequest = useRef(0), selectedRef = useRef(selected), paymentCheckRef=useRef('');
  useEffect(()=>{selectedRef.current=selected;},[selected]);

  const load = useCallback(async (initial = false, explicitOrder?:string) => {
    const request = ++orderRequest.current;
    if (!initial) setRefreshing(true);
    setOrderError('');
    try {
      const order = explicitOrder || new URLSearchParams(location.search).get('order');paymentCheckRef.current=order||'';if(initial)setRequestedOrder(order||'');
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
    void Promise.resolve().then(()=>{if(mounted.current)void load(true);});
    return () => { mounted.current = false; orderRequest.current++; };
  }, [load]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(()=>{
    if(!active)return;
    if (!selected) { setContent(null); setContentLoading(false); setContentError(''); return; }
    setContent(null); setContentLoading(true); setContentError(''); setBookingError('');
    return fetch(`/api/commerce/customer/${encodeURIComponent(selected)}`, { cache:'no-store' }).then(async response => {
      const data = await commerceResponse<Content>(response);
      if (active && mounted.current) { setContent(current=>({...data,page:current?.id===data.id?current.page:data.page})); setSlot(''); setIntake(''); }
    }).catch(error => {
      if (active && mounted.current) setContentError(error instanceof Error ? error.message : 'Unable to open this product.');
    }).finally(() => { if (active && mounted.current) setContentLoading(false); });
    });
    return () => { active = false; };
  }, [selected, contentRetry]);

  async function reserve(event:React.FormEvent) {
    event.preventDefault();
    const purchase = selected;
    setBooking(true); setBookingError('');
    try {
      const response = await fetch(`/api/commerce/customer/${encodeURIComponent(purchase)}/booking`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({slotId:slot, intake}) });
      const data = await commerceResponse<Content>(response);
      if (mounted.current && selectedRef.current === purchase) setContent(current=>({...data,page:current?.id===data.id?current.page:data.page}));
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
      if (mounted.current && selectedRef.current === purchase) { setContent(current=>({...data,page:current?.id===data.id?current.page:data.page})); setSlot(''); }return true;
    } catch (error) {
      if (mounted.current && selectedRef.current === purchase) setBookingError(error instanceof Error ? error.message : 'Unable to cancel.');return false;
    } finally { if (mounted.current) setBooking(false); }
  }

  const selectedContent = content?.id === selected ? content : null;
  const paidOrders = orders.filter(order=>order.status==='paid'), otherOrders = orders.filter(order=>order.status!=='paid');
  const presentation=selectedContent?buyerPresentation(selectedContent):null;
  const returnTo='/customer'+(selected||requestedOrder?'?order='+encodeURIComponent(selected||requestedOrder):''),signInHref='/signin-with-chatgpt?return_to='+encodeURIComponent(returnTo);
  function choosePurchase(id:string){if(id!==selected)setSelected(id);else if(contentError)setContentRetry(value=>value+1);if(typeof window!=='undefined'){const url=new URL(window.location.href);url.searchParams.set('order',id);window.history.replaceState(null,'',url);}}
  return <main className="customer-portal buyer-library">
    <header><Link href="/" aria-label="FiveGen home"><Brand/></Link><Link className="buyer-library-home" href="/customer"><BookOpen size={15}/> Your library</Link><AppearanceControl className="appearance-route-control"/><Link href={signInHref}>Sign in with purchase email <ArrowRight size={14}/></Link></header>
    <section className="customer-heading buyer-page-heading"><div><h1>Your purchases</h1><p>Read, learn and access everything you’ve purchased.</p></div><span className="buyer-private-label"><LockKeyhole size={14}/> Private customer library</span></section>
    {orderError && <div className="buyer-notice" role="alert"><p>{orderError}</p><button className="buyer-button secondary" disabled={refreshing} onClick={() => void load(false,paymentCheckRef.current||undefined)}>{refreshing ? 'Checking…' : 'Retry payment status'}</button></div>}
    {loading ? <div className="buyer-loading" role="status"><span className="buyer-loading-cover"/><div><h2>Getting your library ready…</h2><p>Checking your purchases securely.</p></div></div> : !orders.length ? !orderError && <div className="buyer-empty"><BookOpen size={32}/><h2>Your library is waiting</h2><p>Open the checkout return link in the browser where you purchased, or sign in with your purchase email.</p><Link className="buyer-button primary" href={signInHref}>Find my purchases <ArrowRight size={16}/></Link><WorkspaceExample kind="library"/></div> : <div className="customer-layout buyer-layout">
      <aside className="buyer-library-rail" aria-label="Your purchases">
        <h2 className="customer-library-label">Available products <span>{paidOrders.length}</span></h2>
        {!!paidOrders.length&&<label className="customer-product-select" htmlFor="customer-product-select">Your product<select id="customer-product-select" value={selected} disabled={booking} onChange={event=>choosePurchase(event.target.value)}>{paidOrders.map(order=><option key={order.id} value={order.id}>{order.title} · {commerceMoney(order.amount,order.currency)}</option>)}</select></label>}
        <div className="customer-available-products">{paidOrders.map(order => <button className={`customer-purchase ${selected === order.id ? 'active' : ''}`} key={order.id} disabled={booking} aria-pressed={selected === order.id} onClick={()=>choosePurchase(order.id)}><strong>{order.title}</strong><span>{commerceMoney(order.amount, order.currency)} · paid{order.mode === 'test' ? ' · Test' : ''}</span><span className="customer-open-product">{selected === order.id ? 'Viewing product' : 'Open product'} <ArrowRight size={13}/></span></button>)}</div>
        {!!otherOrders.length&&<details className="customer-other-orders" open={!paidOrders.length}><summary>Other orders <span>{otherOrders.length}</span><ChevronDown size={14}/></summary>{otherOrders.map(order=><div className="customer-purchase customer-purchase-pending" key={order.id}><strong>{order.title}</strong><span>{commerceMoney(order.amount,order.currency)} · {order.status}{order.mode==='test'?' · Test':''}</span>{order.status==='pending'&&<div className="customer-payment-refresh"><small>Waiting for payment confirmation.</small><button className="buyer-button secondary" disabled={refreshing} onClick={()=>void load(false,order.id)}>{refreshing?'Checking payment…':'Check payment status'}</button></div>}<PurchaseRecovery orderId={order.id} paidAmount={order.amount} subscription={order.subscription}/></div>)}{otherOrders.some(order=>order.status==='pending')&&<p className="buyer-small-copy">Your paid products stay available while we check.</p>}</details>}
      </aside>
      <section className="customer-content buyer-product" aria-label="Purchased product" aria-busy={contentLoading || !!selected && !selectedContent && !contentError}>
        {orders.find(order=>order.id===selected)?.subscription&&<BuyerSubscription key={selected+'-subscription'} orderId={selected}/>}
        {!selected ? <div className="buyer-empty"><Clock3 size={30}/><h2>Your product is waiting for confirmation</h2><p>Check payment status to open it once your payment is confirmed.</p></div> : contentError ? <div className="buyer-notice" role="alert"><h2>We couldn’t open your product</h2><p>{contentError}</p><button className="buyer-button secondary" onClick={() => setContentRetry(value => value + 1)}>Try opening again</button></div> : !selectedContent||!presentation ? <div className="buyer-loading" role="status"><span className="buyer-loading-cover"/><div><h2>Opening your product…</h2><p>Preparing your purchased content.</p></div></div> : <>
          <ProductHero content={selectedContent} order={paidOrders.find(order=>order.id===selected)}/>
          {selectedContent.studio?.playbook?.teamLicense==='team'&&<TeamContent key={selectedContent.id+'-team'} orderId={selectedContent.id} canManage={selectedContent.accessRole!=='team'}/>}
          {presentation.family==='document'&&selectedContent.sections.length>0&&<WrittenContent content={selectedContent}/>}
          {selectedContent.accessRole!=='team'&&(['course','challenge','service'].includes(presentation.family)||selectedContent.service)&&<><ProductReminders key={selectedContent.id+'-reminders'} orderId={selectedContent.id}/><ProductPushReminders key={selectedContent.id+'-push'} orderId={selectedContent.id}/></>}
          {presentation.family==='templates'&&<ProductUpdateNotice key={selectedContent.id+'-updates'} orderId={selectedContent.id} onAdopt={()=>setContentRetry(value=>value+1)}/>}
          {(['templates','custom'].includes(presentation.family)||selectedContent.builderType==='custom')&&<PurchasedProductResources content={selectedContent}/>}
          {selectedContent.builderType==='custom'&&((Array.isArray(selectedContent.studio?.custom?.deliveryKinds)&&selectedContent.studio.custom.deliveryKinds.includes('physical'))||(Array.isArray(selectedContent.studio?.custom?.blocks)&&selectedContent.studio.custom.blocks.some((block:{kind?:string})=>block.kind==='physical')))&&<ProductFulfillment key={selectedContent.id+'-physical'} orderId={selectedContent.id}/>}
          {selectedContent.description&&selectedContent.description.length>240&&<details className="buyer-about"><summary>About this product <ChevronDown size={15}/></summary><p>{selectedContent.description}</p></details>}
          {bookingError && <div className="buyer-notice" role="alert">{bookingError}</div>}
          {presentation.family==='templates'&&(selectedContent.usageInstructions||selectedContent.compatibleTools)&&<section className="buyer-instructions"><div className="buyer-section-heading"><div><h3>Make it your own</h3><p>Download your files, then follow the creator’s instructions.</p></div><Layers size={22}/></div>{selectedContent.compatibleTools&&<p className="buyer-tools"><strong>Works with</strong>{selectedContent.compatibleTools}</p>}{selectedContent.usageInstructions&&<p className="buyer-preserve-lines">{selectedContent.usageInstructions}</p>}</section>}
          {presentation.family==='challenge'&&(selectedContent.dailyTime||selectedContent.completionCriteria)&&<div className="buyer-challenge-note"><CheckCircle2 size={20}/><div><strong>{selectedContent.dailyTime?`${selectedContent.dailyTime} · at your own pace`:'A challenge at your own pace'}</strong>{selectedContent.completionCriteria&&<p>{selectedContent.completionCriteria}</p>}</div></div>}
          {!!selectedContent.sections.length&&(presentation.family==='course'||presentation.family==='challenge')&&<CustomerLearning key={selectedContent.id} orderId={selectedContent.id} sections={selectedContent.sections} challenge={presentation.family==='challenge'}/>}
          {(selectedContent.studio?.community?.enabled||selectedContent.studio?.challenge?.groupFeed===true)&&<CustomerCommunity key={selectedContent.id+'-community'} orderId={selectedContent.id}/>}
          {selectedContent.accessRole!=='team'&&selectedContent.service&&selectedContent.studio&&<CustomerService key={selectedContent.id+'-service'} orderId={selectedContent.id} scope={selectedContent.serviceScope} preparation={selectedContent.preparation}/>}
          {['document','templates','custom'].includes(presentation.family)&&renderResources(selectedContent,presentation)}
          {(presentation.family==='community'||(Array.isArray(selectedContent.studio?.custom?.deliveryKinds)&&selectedContent.studio.custom.deliveryKinds.includes('community')))&&!selectedContent.studio?.community?.enabled&&<section className="buyer-community"><div className="buyer-section-heading"><div><h3>Welcome to your community</h3><p>A place to connect, share and keep moving forward.</p></div><Users size={24}/></div>{selectedContent.welcome&&<p className="buyer-preserve-lines">{selectedContent.welcome}</p>}{selectedContent.communityUrl?<a className="buyer-button primary" href={selectedContent.communityUrl} target="_blank" rel="noopener noreferrer">Open your community <ArrowRight size={16}/></a>:<p>Your creator hasn’t provided the invitation link yet. Your purchased resources remain available below.</p>}{selectedContent.rules&&<details className="buyer-community-rules"><summary>Community guidelines <ChevronDown size={15}/></summary><p className="buyer-preserve-lines">{selectedContent.rules}</p></details>}</section>}
          {presentation.family==='service'&&!selectedContent.studio && <section className="buyer-session" id="customer-session"><div className="buyer-section-heading"><div><h3>{selectedContent.booking ? 'Your session is confirmed' : 'Book your session'}</h3><p>{selectedContent.booking?'Your time is reserved. Here’s everything you need.':'Choose a time that works for you.'}</p></div><CalendarDays size={25}/></div>{selectedContent.serviceScope&&<p className="buyer-preserve-lines">{selectedContent.serviceScope}</p>}{selectedContent.booking ? <><div className="buyer-booking-confirmed"><CheckCircle2 size={23}/><div><strong>{new Date(selectedContent.booking.starts_at).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</strong><span>{new Date(selectedContent.booking.starts_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})} – {new Date(selectedContent.booking.ends_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit',timeZoneName:'short'})}</span></div></div>{selectedContent.booking.intake&&<details className="buyer-about"><summary>Your preparation notes <ChevronDown size={15}/></summary><p>{selectedContent.booking.intake}</p></details>}{selectedContent.meetingUrl&&<a className="buyer-button primary" href={selectedContent.meetingUrl} target="_blank" rel="noopener noreferrer">Join session <ArrowRight size={16}/></a>}<p className="buyer-small-copy">Need a different time? Cancel this booking, then choose another available slot.</p><button className="buyer-button secondary" disabled={booking} onClick={()=>setConfirmCancel(true)}>{booking ? 'Updating booking…' : 'Cancel booking'}</button></> : selectedContent.slots.length ? <form className="buyer-booking-form" onSubmit={reserve}><label>Available times ({Intl.DateTimeFormat().resolvedOptions().timeZone})<select required value={slot} onChange={event => setSlot(event.target.value)}><option value="">Select a time</option>{selectedContent.slots.map(item => <option key={item.id} value={item.id}>{new Date(item.starts_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})} · {Math.round((item.ends_at-item.starts_at)/60000)} min</option>)}</select></label><label>{selectedContent.intakePrompt || 'What would you like help with?'}<textarea required minLength={5} maxLength={5000} rows={4} value={intake} placeholder="Share a little context so your creator can prepare." onChange={event => setIntake(event.target.value)}/></label><button className="buyer-button primary" disabled={booking||!slot||intake.trim().length<5}>{booking ? 'Reserving…' : 'Confirm booking'}<ArrowRight size={16}/></button></form> : <div className="buyer-inline-note"><Clock3 size={20}/><p>Your creator hasn’t added upcoming times yet. <a href="#purchase-help">Ask them to arrange your session.</a></p></div>}{selectedContent.preparation&&<details className="buyer-preparation" open><summary>Before your session <ChevronDown size={15}/></summary><p className="buyer-preserve-lines">{selectedContent.preparation}</p></details>}</section>}
          {!!selectedContent.sections.length&&presentation.family!=='document'&&presentation.family!=='course'&&presentation.family!=='challenge'&&<section className="customer-reading buyer-reading" id="customer-reading"><div className="buyer-section-heading"><div><h3>Your resources</h3><p>The knowledge and preparation included with your purchase.</p></div><BookOpen size={22}/></div>{selectedContent.sections.map((section,index)=><details className="customer-reading-section buyer-reading-section" key={selectedContent.id+':'+(section.id||index)} open={index===0}><summary><span className="buyer-reading-number">{String(index+1).padStart(2,'0')}</span><span>{section.category&&<small>{section.category}</small>}<strong>{section.title}</strong></span><ChevronDown size={17}/></summary><div className="buyer-reader-paper">{section.videoId&&<video controls playsInline preload="metadata" src={`/api/commerce/customer/${selectedContent.id}/video/${section.videoId}`}/>}<div className="buyer-preserve-lines">{section.body}</div></div></details>)}</section>}
          {!selectedContent.sections.length&&!selectedContent.files.length&&!selectedContent.downloads?.length&&!selectedContent.communityUrl&&!selectedContent.service&&!selectedContent.studio?.community?.enabled&&!selectedContent.studio?.challenge?.groupFeed&&!(Array.isArray(selectedContent.studio?.custom?.blocks)&&selectedContent.studio.custom.blocks.length)&&!selectedContent.studio?.custom?.fulfillment&&presentation.family!=='service'&&<div className="buyer-empty"><CheckCircle2 size={28}/><h3>Your payment is confirmed</h3><p>This product does not have any resources available yet. Contact the creator for your purchased content.</p></div>}
          {!['document','templates','custom'].includes(presentation.family)&&renderResources(selectedContent,presentation)}
          <footer className="buyer-product-footer"><LockKeyhole size={14}/><span>Your content stays private. Return using this browser or sign in with your purchase email.</span></footer>
        </>}
        {selected&&selectedContent?.accessRole!=='team'&&<PurchaseHelp key={selected+'-help'} orderId={selected} paidAmount={paidOrders.find(order=>order.id===selected)?.amount||0}/>}
      </section>
    </div>}
    <Dialog open={confirmCancel} onOpenChange={open=>{if(!booking)setConfirmCancel(open);}}><DialogContent><DialogHeader><DialogTitle>Cancel this session?</DialogTitle><DialogDescription>This releases your reserved time. Your product stays in your library, and you can choose another available time.</DialogDescription></DialogHeader>{bookingError&&<p className="buyer-notice" role="alert">{bookingError}</p>}<DialogFooter><button type="button" className="buyer-button secondary" disabled={booking} onClick={()=>setConfirmCancel(false)}>Keep my session</button><button type="button" className="buyer-button primary" disabled={booking} onClick={async()=>{if(await cancelBooking())setConfirmCancel(false);}}>{booking?'Canceling…':'Confirm cancellation'}</button></DialogFooter></DialogContent></Dialog>
  </main>;
}
