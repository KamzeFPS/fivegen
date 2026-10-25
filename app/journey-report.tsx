'use client';
// Workspace query destinations restore server context on document navigation.
import {useEffect,useState} from 'react';
import {WorkspaceExample} from './workspace-example';
import type {journeyResults} from '@/lib/journey-results-server';
type Data=Awaited<ReturnType<typeof journeyResults>>;
type Props={productId:string;campaignId?:string;destinationPageId?:string};
export function JourneyReport(props:Props){return <ScopedJourneyReport key={`${props.productId}:${props.campaignId||''}:${props.destinationPageId||''}`} {...props}/>;}
function ScopedJourneyReport({productId,campaignId,destinationPageId}:Props){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[days,setDays]=useState('30'),[page,setPage]=useState(destinationPageId||''),[campaign,setCampaign]=useState(campaignId||''),[channel,setChannel]=useState(''),[mode,setMode]=useState('live'),[currency,setCurrency]=useState('');
 const query=new URLSearchParams({days,mode,...(page?{destinationPageId:page}:{}),...(campaign?{campaignId:campaign}:{}),...(channel?{channel}:{}),...(currency?{currency}:{})}).toString(),key=productId+'?'+query;
 const [loadedKey,setLoadedKey]=useState('');
 useEffect(()=>{const controller=new AbortController();void fetch(`/api/products/${productId}/journey?${query}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const value=await response.json() as Data&{error?:string};if(!response.ok)throw new Error(value.error||'Results could not load.');if(!controller.signal.aborted){setData(value);setLoadedKey(key);setError('');}}).catch(cause=>{if(!controller.signal.aborted){setError(cause.message);setLoadedKey(key);setData(null);}});return()=>controller.abort();},[productId,query,key,revision]);
 const current=loadedKey===key?data:null,count=(event:string)=>Number(current?.events.find(x=>x.event===event)?.sessions||0),submissions=current?.formReceipts.reduce((n,row)=>n+Number(row.submissions),0)||0,applications=current?.applications.reduce((n,row)=>n+Number(row.applications),0)||0;
 const paidOrders=(paymentMode:string)=>current?.paidOrders.filter(row=>String(row.mode)===paymentMode).reduce((total,row)=>total+Number(row.paid_orders),0)||0;
 const paidLabel=mode==='all'?`${paidOrders('live')} live · ${paidOrders('test')} test`:String(paidOrders(mode));
 const selectedFilters=[page?current?.pages.find(item=>item.id===page)?.name||'Selected page':'All pages',campaign?current?.campaigns.find(item=>item.id===campaign)?.title||'Selected campaign':'All campaigns',channel||'All channels',currency?currency.toUpperCase():'Currencies kept separate'];
 return <section className="ops-card journey-results">
  <header><span className="growth-eyebrow">RESULTS</span><h2>What happened, and what to do next</h2><p>See visits, requests and paid orders in one place. Each is a separate count, not a conversion funnel.</p></header>
  <div className="journey-quick-scope"><label>Date range<select value={days} onChange={e=>setDays(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="0">All time</option></select></label><span>{mode==='live'?'Live payments only':mode==='test'?'Test payments only':'Live and test payments shown separately'} · UTC</span></div>
  <details className="journey-filter-details"><summary>Page, campaign & payment filters</summary><p className="product-scope-note">{selectedFilters.join(' · ')}</p><div className="journey-scope">
   <label>Page<select value={page} onChange={e=>setPage(e.target.value)}><option value="">All pages / main sales-page visits</option>{data?.pages.map(p=><option key={p.id} value={p.id}>{p.name} · {p.purpose}</option>)}</select></label>
   <label>Campaign<select value={campaign} onChange={e=>setCampaign(e.target.value)}><option value="">All campaigns and direct</option>{data?.campaigns.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
   <label>Share-link channel<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="">All / direct</option>{data?.channels.map(c=><option key={c}>{c}</option>)}</select></label>
   <label>Payments<select value={mode} onChange={e=>setMode(e.target.value)}><option value="live">Live only</option><option value="test">Test only</option><option value="all">Live + test (separate)</option></select></label>
   <label>Payment currency<select value={currency} onChange={e=>setCurrency(e.target.value)}><option value="">All currencies (separate)</option>{data?.currencies.map(c=><option key={c} value={c}>{c.toUpperCase()}</option>)}</select></label>
  </div></details>
  {loadedKey!==key?<p role="status">Loading this scope…</p>:error?<p role="alert">{error} <button className="button secondary" onClick={()=>setRevision(x=>x+1)}>Retry</button></p>:current&&<>
   <p className="product-scope-note">This product · {days==='0'?'All recorded time':`Rolling last ${days} days`} · {selectedFilters.join(' · ')}</p>
   <dl className="journey-summary">
    <div><dt>Page visits</dt><dd>{current.measurement.visits==='not-measured'?'Not measured':count('visit')}</dd><small>{current.measurement.visits==='not-measured'?'Visits are not tracked on this page.':'Browser sessions on the main sales page; not unique people.'}</small></div>
    <div><dt>Form submissions</dt><dd>{submissions}</dd><small>Submitted forms in this scope; not unique people.</small></div>
    <div><dt>Applications</dt><dd>{applications}</dd><small>Application records, counted separately from signups.</small></div>
    <div><dt>Paid orders</dt><dd>{paidLabel}</dd><small>Verified {mode==='all'?'live and test':mode} orders. Revenue and currencies are detailed below.</small></div>
   </dl>
   <section className="growth-plan-next"><span className="growth-eyebrow">YOUR NEXT ACTION</span>
    {!current.pages.some(candidate=>(!page||candidate.id===page)&&candidate.publishedVersion)?<><h3>Publish a page when you’re ready</h3><p>There is no published page in this scope yet. Review your draft first; checkout and delivery have their own launch checks.</p><a className="button secondary" href={`/build/${productId}?area=page${page&&page!==productId?'&page='+page:''}`}>Review page draft</a></>:current.measurement.visits==='not-measured'?<><h3>Review the requests you received</h3><p>This page has {submissions} form submissions and {applications} applications. Visits are not measured here, so review the requests before changing your message.</p><a className="button secondary" href={`/?view=crm&customerProduct=${productId}`}>Open this product’s Customers</a></>:count('visit')===0?<><h3>Share a reviewed link</h3><p>No page sessions were recorded in this scope. Review your campaign link and return after real activity. Missing tracking can also explain zero.</p><a className="button secondary" href={`/?project=${productId}&area=campaigns`}>Review campaign and share links</a></>:<><h3>Review your message and next step</h3><p>{count('visit')} page sessions and {count('cta')} sessions with a button click were observed. Review the page and destination before changing your offer; these counts do not establish a conversion rate.</p><a className="button secondary" href={`/build/${productId}?area=page`}>Review Sales page</a></>}
    {count('visit')===0&&!submissions&&!applications&&!current.paidOrders.length&&<WorkspaceExample kind="results"/>}
   </section>
   <details className="journey-filter-details"><summary>Activity details & order coverage</summary>
    <dl className="ops-facts"><div><dt>Sessions with a page button click</dt><dd>{current.measurement.visits==='not-measured'?'Not measured':count('cta')}</dd></div><div><dt>Observed checkout starts</dt><dd>{current.measurement.visits==='not-measured'?'Not measured':count('checkout-start')}</dd></div><div><dt>Order attribution</dt><dd>{current.coverage.linked} linked · {current.coverage.unattributed} unattributed</dd></div></dl>
    <h3>Verified paid orders by currency</h3>{current.paidOrders.length?current.paidOrders.map(row=><p key={String(row.mode)+row.currency}>{String(row.paid_orders)} paid orders · {String(row.buyer_sessions)} linked browser sessions · {String(row.mode)} · {String(row.currency).toUpperCase()}</p>):<p>No verified paid orders in this payment scope.</p>}
    <a className="button secondary" href={`/build/${productId}?area=page&advanced=experiment`}>Advanced page optimization</a>
   </details>
   <details className="journey-filter-details"><summary>How these numbers are measured</summary><p>{current.model}</p><p>{current.limits}</p><p>{current.measurement.receiptAttribution}</p><p>{current.measurement.eventMode}</p><p>{current.measurement.financial}</p><p>Email provider acceptance is different from inbox delivery, reading or a sale. Review sequence activity in <a href={`/?project=${productId}&area=automations`}>Emails</a>.</p></details>
  </>}
 </section>;
}
