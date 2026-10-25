'use client';

// Workspace query destinations are read on mount and need a document navigation.
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, CircleCheck, Loader2, RefreshCw } from 'lucide-react';
import type { GrowthDashboardData } from '@/lib/growth-analytics';
import type {CommerceEarningsRefresh} from '@/lib/commerce-earnings';
import {CreatorEarnings, earningsMoney} from './creator-earnings';
import {ProductLaunchResume} from './product-launch-resume';

const number = (value: number) => value.toLocaleString('en-US');
const count = (value: number, singular: string, plural = `${singular}s`) => `${number(value)} ${value === 1 ? singular : plural}`;
const money = earningsMoney;
const date = (day: string, includeYear = false, monthly = false) => new Intl.DateTimeFormat('en-US', {
  month: 'short', ...(!monthly ? {day: 'numeric' as const} : {}), ...(includeYear || monthly ? { year: 'numeric' as const } : {}), timeZone: 'UTC',
}).format(new Date(`${day}T00:00:00Z`));

const chartColors = {sales:'var(--fg-chart-sales,#ff995b)',net:'var(--fg-chart-net,#9bd0b2)',orders:'var(--fg-chart-orders,#b7a5f5)',visits:'var(--fg-chart-visits,#8cbbf5)',contacts:'var(--fg-chart-contacts,#ffbb73)',plays:'var(--fg-chart-plays,#8cbbf5)',clicks:'var(--fg-chart-clicks,#b7a5f5)',bookings:'var(--fg-chart-bookings,#9bd0b2)'};
type ChartSeries = {label:string;color:string;values:(number|null)[];format?:(value:number)=>string};

function ActivityChart({id,days,series,monthly=false,compact=false,emptyText='No activity recorded in this period.'}:{id:string;days:string[];series:ChartSeries[];monthly?:boolean;compact?:boolean;emptyText?:string}){
  const [active,setActive]=useState<number|null>(null);
  const width=compact?600:900,height=compact?174:246,left=compact?14:48,right=14,top=18,bottom=compact?30:38;
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const values=series.flatMap(item=>item.values.filter((value):value is number=>value!==null&&Number.isFinite(value)));
  const minimum=Math.min(0,...values),maximum=Math.max(1,...values),span=maximum-minimum;
  const x=(index:number)=>left+(days.length>1?index/(days.length-1):.5)*plotWidth;
  const y=(value:number)=>top+(maximum-value)/span*plotHeight;
  const selected=days.length?Math.min(active??days.length-1,days.length-1):null;
  const showDetails=active!==null&&selected!==null;
  const label=(value:number)=>new Intl.NumberFormat('en-US',{notation:Math.abs(value)>=10000?'compact':'standard',maximumFractionDigits:1}).format(value);
  function inspect(key:string){
    if(!days.length)return;
    if(key==='ArrowLeft')setActive(index=>Math.max(0,(index??days.length-1)-1));
    if(key==='ArrowRight')setActive(index=>Math.min(days.length-1,(index??-1)+1));
    if(key==='Home')setActive(0);
    if(key==='End')setActive(days.length-1);
    if(key==='Escape')setActive(null);
  }
  return <div className={`overview-chart ${compact?'is-compact':''}`}>
    {values.length&&days.length?<>
      <svg className="overview-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`} tabIndex={0}
        onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key)){event.preventDefault();inspect(event.key);}}}
        onFocus={()=>setActive(days.length-1)} onBlur={()=>setActive(null)}
        onPointerMove={event=>{const bounds=event.currentTarget.getBoundingClientRect(),position=(event.clientX-bounds.left)/bounds.width*width;setActive(Math.max(0,Math.min(days.length-1,Math.round((position-left)/plotWidth*(days.length-1)))));}}
        onPointerLeave={()=>setActive(null)}>
        <title id={`${id}-title`}>{`${series.map(item=>item.label).join(', ')} over time`}</title>
        <desc id={`${id}-description`}>{days.length} {monthly?'monthly':'daily'} observations, {date(days[0],true,monthly)} to {date(days.at(-1)!,true,monthly)}. Use the left and right arrow keys to inspect exact values.</desc>
        {[0,.5,1].map(step=><g key={step}><line x1={left} x2={width-right} y1={top+step*plotHeight} y2={top+step*plotHeight} className="overview-chart-grid"/>{!compact&&<text x={left-10} y={top+step*plotHeight+4} textAnchor="end" className="overview-chart-axis">{label(maximum-step*span)}</text>}</g>)}
        {minimum<0&&<line x1={left} x2={width-right} y1={y(0)} y2={y(0)} className="overview-chart-zero"/>}
        {series.map(item=>{
          const segments:{index:number;value:number}[][]=[];
          item.values.forEach((value,index)=>{if(value===null||!Number.isFinite(value))return;if(index===0||item.values[index-1]===null)segments.push([]);if(!segments.length)segments.push([]);segments.at(-1)!.push({index,value});});
          return <g key={item.label} style={{color:item.color}}>{segments.map((segment,index)=><g key={index}>{compact&&segment.length>1&&<path d={`M ${x(segment[0].index)} ${y(0)} ${segment.map(point=>`L ${x(point.index)} ${y(point.value)}`).join(' ')} L ${x(segment.at(-1)!.index)} ${y(0)} Z`} fill="currentColor" opacity=".08"/>}<polyline points={segment.map(point=>`${x(point.index)},${y(point.value)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={compact?2.5:2.3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>{segment.length===1&&<circle cx={x(segment[0].index)} cy={y(segment[0].value)} r={3} fill="currentColor"/>}</g>)}</g>;
        })}
        {showDetails&&<><line x1={x(selected)} x2={x(selected)} y1={top} y2={height-bottom} className="overview-chart-cursor"/>{series.map(item=>item.values[selected]!==null&&item.values[selected]!==undefined?<circle key={item.label} cx={x(selected)} cy={y(item.values[selected]!)} r={4} fill={item.color} stroke="var(--fg-panel,#19191c)" strokeWidth={2}/>:null)}</>}
        <text x={left} y={height-7} className="overview-chart-axis overview-chart-date">{date(days[0],false,monthly)}</text>
        {days.length>1&&<text x={width-right} y={height-7} textAnchor="end" className="overview-chart-axis overview-chart-date">{date(days.at(-1)!,false,monthly)}</text>}
      </svg>
      <div className={`overview-chart-reading ${showDetails?'is-active':''}`} aria-live="polite" aria-atomic="true">
        {showDetails?<><span>{date(days[selected],true,monthly)}</span>{series.map(item=><span key={item.label}><i style={{background:item.color}}/>{item.label} <strong>{item.values[selected]===null||item.values[selected]===undefined?'Unavailable':(item.format||number)(item.values[selected]!)}</strong></span>)}</>:<span>{compact?'Hover or focus the graph to see values.':'Hover over the graph or use the arrow keys to explore.'}</span>}
      </div>
    </>:<div className="overview-chart-empty"><span>{emptyText}</span></div>}
  </div>;
}

export function GrowthDashboard({productId}:{productId?:string}={}) {
  const [days, setDays] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<GrowthDashboardData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshingFees,setRefreshingFees]=useState(false);
  const [feeError,setFeeError]=useState(''),[feeNotice,setFeeNotice]=useState('');
  const [currency,setCurrency]=useState('');
  const feeScope=useRef(`${days}:${productId||''}`);

  useEffect(()=>{feeScope.current=`${days}:${productId||''}`;},[days,productId]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const query=new URLSearchParams({days:String(days)});if(productId)query.set('productId',productId);
        const response = await fetch(`/api/growth/dashboard?${query}`, { signal: controller.signal });
        const result = await response.json() as GrowthDashboardData & { error?: string };
        if (!response.ok) throw new Error(result.error || 'Could not load your activity.');
        if (result.days !== days||result.productId!==(productId||null)) throw new Error('The reporting period or product did not match. Please try again.');
        if (active) setData(result);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your activity.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [days, refresh, productId]);

  function reload() {
    setLoading(true);
    setError('');
    setRefresh(value => value + 1);
  }

  async function refreshFees(){
    if(refreshingFees)return;
    const requestedScope=feeScope.current;
    setRefreshingFees(true);setFeeError('');setFeeNotice('');
    try{
      const response=await fetch('/api/commerce/earnings/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days,...(productId?{productId}:{})}),signal:AbortSignal.timeout(60000)});
      const result=await response.json() as CommerceEarningsRefresh&{error?:string};
      if(feeScope.current!==requestedScope)return;
      if(!response.ok)throw new Error(result.error||'Stripe fees could not be checked. Your sales are unchanged.');
      setFeeNotice(`${result.refreshed.toLocaleString('en-US')} ${result.refreshed===1?'sale checked':'sales checked'} with Stripe.${result.pending?' Some payments are still awaiting fee confirmation.':''}${result.failed?' Some records could not be refreshed. Please try again.':''}`);
      reload();
    }catch(cause){if(feeScope.current===requestedScope)setFeeError(cause instanceof Error?cause.message:'Stripe fees could not be checked. Please try again.');}
    finally{setRefreshingFees(false);}
  }

  // Hide the old figures as soon as the period changes, before the next request starts.
  const report = !loading && !error && data?.days === days&&data.productId===(productId||null) ? data : null;
  const publishedProducts=report?.products.filter(product=>product.published)||[];
  const monthly=report?.trendInterval==='month';
  const firstDay = report?.trend[0]?.day;
  const lastDay = report?.trend.at(-1)?.day;
  const dateRange = firstDay && lastDay ? `${date(firstDay,false,monthly)} – ${date(lastDay,true,monthly)}` : '';
  const period=days===0?'All time':`Last ${days} days`;
  const chartDays=report?.trend.map(item=>item.day)||[];
  const currencies=[...new Set([...(report?.revenue.map(item=>item.currency)||[]),...(report?.earnings.totals.map(item=>item.currency)||[])])];
  const chartCurrency=currencies.includes(currency)?currency:currencies[0];
  const hasGrossCurrency=report?.revenue.some(item=>item.currency===chartCurrency);
  const hasNetCurrency=report?.earnings.totals.some(item=>item.currency===chartCurrency);
  const grossValues=report?.trend.map(item=>item.revenue?(hasGrossCurrency?(item.revenue.find(total=>total.currency===chartCurrency)?.amount??0):report.revenue.length?null:0):null)||[];
  const netValues=report?.trend.map(item=>item.netEarnings?(hasNetCurrency?(item.netEarnings.find(total=>total.currency===chartCurrency)?.amount??0):report.earnings.totals.length||report.earnings.coverage.pendingOrders?null:0):null)||[];
  const activitySeries:ChartSeries[]=report?[
    {label:'Visits',color:chartColors.visits,values:report.trend.map(item=>item.visits)},
    {label:'Contacts',color:chartColors.contacts,values:report.trend.map(item=>item.leads)},
    {label:'Orders',color:chartColors.orders,values:report.trend.map(item=>item.purchases)},
  ]:[];
  const marketingSeries:ChartSeries[]=report?[
    {label:'Video plays',color:chartColors.plays,values:report.trend.map(item=>item.plays??null)},
    {label:'Button clicks',color:chartColors.clicks,values:report.trend.map(item=>item.clicks??null)},
    {label:'Bookings',color:chartColors.bookings,values:report.trend.map(item=>item.bookings??null)},
  ]:[];

  return <section className={`overview-dashboard ${productId?'overview-product-dashboard':''}`} aria-busy={loading}>
    <header className="overview-heading">
      {productId?<div className="overview-product-report-context"><h2 className="overview-sr-only">Sales & activity</h2>{report?.mode==='test'?<p className="overview-test-notice"><strong>Test payments are on.</strong> Results below use test records.</p>:<p className="overview-product-report-period">Product performance · {period}{dateRange?` · ${dateRange}`:''} · UTC</p>}</div>:<div><h1>Dashboard</h1><p>Business performance across all your products. Product and campaign journeys have their own Results view.</p></div>}
      <div className="overview-period-tools">
        <label htmlFor="dashboard-period"><span>Reporting period</span><select id="dashboard-period" value={days} onChange={event => {
          setLoading(true);
          setError('');
          setFeeError('');setFeeNotice('');
          setDays(Number(event.target.value));
        }}><option value={0}>All time</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
        {currencies.length>1&&<label htmlFor="dashboard-currency"><span>Currency for sales and earnings graphs</span><select id="dashboard-currency" className="overview-currency-select" value={chartCurrency} onChange={event=>setCurrency(event.target.value)}>{currencies.map(item=><option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label>}
        <button type="button" className="overview-refresh" disabled={loading} onClick={reload} aria-label="Refresh dashboard" title="Refresh dashboard"><RefreshCw size={17} /></button>
      </div>
    </header>

    {error ? <div className="overview-load-state overview-load-error" role="alert"><h2>Your dashboard couldn’t load</h2><p>{error}</p><button type="button" className="button secondary" onClick={reload}>Try again <RefreshCw size={15} /></button></div>
      : loading ? <div className="overview-load-state" role="status"><Loader2 className="spin" size={22} /><p>{days===0?'Loading all your activity…':`Loading your last ${days} days…`}</p></div> : null}

    {report && <>
      <ProductLaunchResume key={productId||'workspace'} productId={productId}/>
      {!productId&&report.mode === 'test' && <p className="overview-test-notice"><strong>Test payments are on.</strong> Sales, revenue, and bookings below use test records.</p>}
      {report.salesCoverage.legacyOrdersExcluded>0&&<p className="overview-test-notice" role="note"><strong>Earlier checkout history is separate.</strong> {number(report.salesCoverage.legacyOrdersExcluded)} legacy {report.salesCoverage.legacyOrdersExcluded===1?'order record lacks':'order records lack'} reliable payment-environment and refund status. Current checkout sales and revenue below exclude those records.</p>}

      <section className="overview-results" aria-labelledby="overview-results-heading">
        {productId?<h2 id="overview-results-heading" className="overview-sr-only">Product performance</h2>:<div className="overview-section-heading overview-results-heading"><h2 id="overview-results-heading">Business performance</h2><p>{period}{dateRange?` · ${dateRange}`:''} · UTC · currencies kept separate</p></div>}
        <div className="overview-metrics">
          <article className="overview-metric overview-revenue"><h3>Gross sales</h3>{report.revenue.length?<div className="overview-revenue-values">{report.revenue.map(item=><strong key={item.currency}>{money(item.amount,item.currency)}</strong>)}</div>:<strong className="overview-no-sales">No sales yet</strong>}<p>Paid orders, before fees{chartCurrency?` · ${chartCurrency.toUpperCase()} graph`:''}</p><ActivityChart id="gross-sales-chart" days={chartDays} monthly={monthly} compact series={[{label:'Gross sales',color:chartColors.sales,values:grossValues,format:value=>chartCurrency?money(value,chartCurrency):number(value)}]} emptyText={report.revenue.length?(hasGrossCurrency?'Sales breakdown is unavailable.':`No gross sales in ${chartCurrency?.toUpperCase()}.`):'Sales will appear here after a customer pays.'}/></article>
          <article className="overview-metric overview-net"><h3>Net earnings</h3>{report.earnings.totals.length?<div className="overview-revenue-values">{report.earnings.totals.map(item=><strong key={item.currency}>{money(item.creatorNetAmount,item.currency)}</strong>)}</div>:<strong className="overview-no-sales">{report.earnings.coverage.pendingOrders?'Awaiting fees':'No earnings yet'}</strong>}<p>{report.earnings.coverage.pendingOrders?`${count(report.earnings.coverage.pendingOrders,'sale')} awaiting fees`:'After confirmed Stripe & FiveGen fees'}{chartCurrency?` · ${chartCurrency.toUpperCase()} graph`:''}</p><ActivityChart id="net-earnings-chart" days={chartDays} monthly={monthly} compact series={[{label:'Confirmed net',color:chartColors.net,values:netValues,format:value=>chartCurrency?money(value,chartCurrency):number(value)}]} emptyText={report.earnings.coverage.pendingOrders&&!hasNetCurrency?'Net earnings appear after fee confirmation.':report.earnings.totals.length?(hasNetCurrency?'Earnings breakdown is unavailable.':`No confirmed net earnings in ${chartCurrency?.toUpperCase()}.`):'Confirmed earnings will appear here.'}/></article>
          <article className="overview-metric"><h3>Orders</h3><strong>{number(report.purchases)}</strong><p>Confirmed purchases</p><ActivityChart id="orders-chart" days={chartDays} monthly={monthly} compact series={[{label:'Orders',color:chartColors.orders,values:report.trend.map(item=>item.purchases)}]}/></article>
        </div>
      </section>

      <section className="overview-activity-panel" aria-labelledby="overview-activity-heading">
        <div className="overview-section-heading"><div><h2 id="overview-activity-heading">{monthly?'Monthly activity':'Daily activity'}</h2><p>{monthly?'Activity by month':'Activity by day'} · UTC · visits cover the earlier marketing page only, not all sales-page views</p></div><span className="overview-period-label">{period}</span></div>
        <dl className="overview-audience"><div><dt><i style={{background:chartColors.visits}}/>Earlier marketing-page sessions</dt><dd>{number(report.visits)}</dd></div><div><dt><i style={{background:chartColors.contacts}}/>New contacts</dt><dd>{number(report.leads)}</dd></div><div><dt><i style={{background:chartColors.orders}}/>Orders</dt><dd>{number(report.purchases)}</dd></div></dl>
        <ActivityChart id="daily-activity-chart" days={chartDays} series={activitySeries} monthly={monthly}/>
      </section>

      <section className="overview-activity-panel" aria-labelledby="overview-marketing-activity-heading">
        <div className="overview-section-heading"><div><h2 id="overview-marketing-activity-heading">Marketing & bookings</h2><p>Recorded video plays, calls to action, and session bookings</p></div></div>
        <dl className="overview-audience"><div><dt><i style={{background:chartColors.plays}}/>Video plays</dt><dd>{number(report.plays)}</dd></div><div><dt><i style={{background:chartColors.clicks}}/>Button clicks</dt><dd>{number(report.clicks)}</dd></div><div><dt><i style={{background:chartColors.bookings}}/>Bookings</dt><dd>{number(report.bookings)}</dd></div></dl>
        <ActivityChart id="marketing-activity-chart" days={chartDays} series={marketingSeries} monthly={monthly} emptyText="No marketing activity breakdown is available for this period."/>
      </section>

      {!productId&&<section className="overview-products" aria-labelledby="overview-products-heading">
        <div className="overview-section-heading"><h2 id="overview-products-heading">Published products</h2><a className="overview-text-link" href="/?view=library">All products <ArrowRight size={15} /></a></div>
        {publishedProducts.length ? <div className="overview-product-list">{publishedProducts.slice(0,4).map(product => <article className="overview-product" key={product.id}>
          <div className="overview-product-info"><h3><a href={`/?project=${product.id}&area=content`}>{product.title}</a></h3><span className="overview-product-status published"><CircleCheck size={14}/>Delivery published</span></div>
          <p className="overview-product-activity" aria-label={`${period}: ${count(product.visits, 'visit')}, ${count(product.leads, 'contact')}, ${count(product.purchases, 'sale')}`}><span>{count(product.visits, 'visit')}</span><span>{count(product.leads, 'contact')}</span><span>{count(product.purchases, 'sale')}</span></p>
          <a className="overview-product-open" href={`/?project=${product.id}&area=content`}>Open<ArrowRight size={16} /></a>
        </article>)}</div> : <div className="overview-products-empty"><p>No published content yet. Your public sales page and checkout have their own launch status.</p><a className="overview-text-link" href="/?view=library">Go to Products <ArrowRight size={16} /></a></div>}
      </section>}

      {productId&&report.actions.length>0&&<section className="overview-other-actions"><h3>Next steps <span>· this product</span></h3><div>{report.actions.map(action=><article key={action.title}><h4>{action.title}</h4><p>{action.reason}</p><a className="overview-text-link" href={action.href}>{action.label}<ArrowRight size={15}/></a></article>)}</div></section>}

      <CreatorEarnings report={report.earnings} refreshing={refreshingFees} onRefresh={()=>void refreshFees()} error={feeError} notice={feeNotice}/>

      <details className="overview-details">
        <summary><span><strong>More details</strong><span>Campaign traffic and how your results are counted</span></span><ChevronDown size={19} /></summary>
        <div className="overview-details-content">

          <section><h3>Campaign traffic</h3><p className="overview-detail-intro">Share a campaign’s tracked link to see which messages bring visitors.</p>{report.sources.length?<div className="overview-table-wrap"><table><caption>{period}</caption><thead><tr><th scope="col">Campaign</th><th scope="col">Visits</th><th scope="col">Clicks</th></tr></thead><tbody>{report.sources.map(source=><tr key={source.campaign}><th scope="row">{source.campaign==='direct'?'Direct / no campaign tag':source.campaign}</th><td>{number(source.visits)}</td><td>{number(source.clicks)}</td></tr>)}</tbody></table></div>:<p className="overview-detail-empty">No recorded campaign visits in this period.</p>}</section>
          <section className="overview-counting-notes"><h3>How these numbers work</h3><ul><li>All results use the selected period, including today, with dates counted in UTC.{productId?' This report includes only this product.':''} All time includes the full recorded history. Histories longer than one year are grouped by month.</li><li>Visits count recorded optional marketing-page sessions, not all views of your product page. They are anonymous daily sessions, so they are not a count of individual people. Browsers with Do Not Track enabled are not recorded.</li><li>A contact is counted once per email address for each product. Contacts and sales are counted separately from visits; they do not form a conversion rate.</li><li>Product sales include orders that are currently paid. Refunded or revoked orders and purchases of FiveGen credits are excluded.</li><li>Gross sales use the payment currency. Confirmed net earnings use the Stripe settlement currency, after actual Stripe and FiveGen fees. Different currencies are kept separate; the currency selector changes the financial graphs. Pending fees never count as confirmed net earnings.</li><li>Bookings are counted by when they were created, rather than the appointment date.</li></ul></section>
        </div>
      </details>
    </>}
  </section>;
}
