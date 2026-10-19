import {ChevronDown,Loader2,RefreshCw} from 'lucide-react';
import type {CommerceEarningsReport} from '@/lib/commerce-earnings';
import './creator-earnings.css';

// Stripe balance transactions use the currency's minor units. ISK retains
// two-decimal API amounts even though its displayed currency has no decimals.
export function earningsMoney(amount:number,currency:string){
  const formatter=new Intl.NumberFormat('en-US',{style:'currency',currency:currency.toUpperCase(),currencyDisplay:'code'});
  const decimals=currency.toLowerCase()==='isk'?2:(formatter.resolvedOptions().maximumFractionDigits??2);
  return formatter.format(amount/(10**decimals));
}
const when=(value:number|null)=>value?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value)):'Awaiting payment';
type Sale=CommerceEarningsReport['orders'][number];
const excluded=(sale:Sale)=>sale.status==='refunded'||sale.status==='revoked';
const hasSettlement=(sale:Sale)=>!!sale.settlementCurrency&&sale.settlementAmount!==null&&sale.stripeFeeAmount!==null&&sale.platformFeeAmount!==null&&sale.creatorNetAmount!==null;
function saleStatus(sale:Sale){
  if(sale.status==='refunded')return 'Refunded · excluded';
  if(sale.status==='revoked')return 'Revoked / disputed · excluded';
  if(sale.status!=='paid')return 'Awaiting payment';
  if(sale.feeStatus==='legacy')return hasSettlement(sale)?'Earlier sale · no FiveGen fee':'Earlier sale · Stripe fees pending';
  return hasSettlement(sale)?'Confirmed':'Stripe fees pending';
}
function saleFee(sale:Sale,kind:'stripe'|'platform'|'net'){
  if(excluded(sale)||sale.status!=='paid')return <span className="earnings-unavailable">—</span>;
  const value=kind==='stripe'?sale.stripeFeeAmount:kind==='platform'?sale.platformFeeAmount:sale.creatorNetAmount;
  if(value!==null&&sale.settlementCurrency)return earningsMoney(value,sale.settlementCurrency);
  if(kind==='platform'&&sale.actualChargePlatformFeeAmount!==null)return <>{earningsMoney(sale.actualChargePlatformFeeAmount,sale.currency)}<small>Sale currency</small></>;
  return <span className="earnings-pending">Pending</span>;
}

export function CreatorEarnings({report,refreshing=false,onRefresh,error='',notice=''}:{report:CommerceEarningsReport;refreshing?:boolean;onRefresh:()=>void;error?:string;notice?:string}){
  const {coverage}=report;
  return <section className="creator-earnings" aria-labelledby="creator-earnings-heading">
    <header className="earnings-heading"><div><span className="overview-kicker">YOUR SALES, CLEARLY</span><h2 id="creator-earnings-heading">Know what you actually earn.</h2><p>Your {report.creatorPlan.name} plan has a {report.creatorPlan.commissionPercent}% FiveGen fee on new sales. Stripe processing fees are separate and vary. Each order keeps the rate recorded when checkout began.</p><a className="earnings-plan-link" href="/account/billing">Manage my plan</a></div><button type="button" className="earnings-refresh" onClick={onRefresh} disabled={refreshing} aria-label="Check actual Stripe fees">{refreshing?<Loader2 size={15} className="spin"/>:<RefreshCw size={15}/>}<span>{refreshing?'Checking Stripe…':'Check Stripe fees'}</span></button></header>
    {error&&<p className="earnings-notice is-error" role="alert">{error}</p>}{notice&&<p className="earnings-notice" role="status">{notice}</p>}
    {report.totals.length?<div className="earnings-currency-list">{report.totals.map(total=><article className="earnings-currency" key={total.currency}>
      <header><h3>{total.currency.toUpperCase()} settlement breakdown</h3><span>{total.confirmedOrders.toLocaleString('en-US')} confirmed {total.confirmedOrders===1?'sale':'sales'}</span></header>
      <dl className="earnings-equation"><div><dt>Sales before fees</dt><dd>{earningsMoney(total.grossAmount,total.currency)}</dd></div><div><dt>Stripe fees</dt><dd>− {earningsMoney(total.stripeFeeAmount,total.currency)}</dd></div><div><dt>FiveGen fees</dt><dd>− {earningsMoney(total.platformFeeAmount,total.currency)}</dd></div><div className="earnings-net"><dt>Your earnings</dt><dd>{earningsMoney(total.creatorNetAmount,total.currency)}</dd></div></dl>
    </article>)}</div>:<div className="earnings-empty"><strong>{coverage.pendingOrders?'Your payment is recorded. The final fee breakdown is on its way.':'Your first sale starts the story.'}</strong><p>{coverage.pendingOrders?'We’ll show your actual earnings once Stripe provides its balance transaction. Pending fees are never shown as zero.':'Once a customer pays, you’ll see the sale, Stripe’s fee, FiveGen’s fee and your earnings here.'}</p></div>}
    <div className="earnings-context"><p>These are confirmed Stripe settlement amounts, grouped by settlement currency. Currency conversion can make them differ from the price the customer paid. This is earnings after fees, not your available bank payout balance.</p>{coverage.pendingOrders>0&&<p className="earnings-pending-note"><span/>{coverage.pendingOrders.toLocaleString('en-US')} paid {coverage.pendingOrders===1?'sale is':'sales are'} awaiting Stripe fee confirmation and excluded from the confirmed breakdown above.</p>}{coverage.legacyOrders>0&&<p>Earlier sales keep their original fees. No FiveGen commission is added retroactively.</p>}{coverage.excludedOrders>0&&<p>Refunded and revoked orders are excluded from earnings. Check Stripe for refund or dispute costs and your current balance.</p>}</div>
    {report.orders.length>0&&<details className="earnings-sales" open><summary><span>Every sale, explained <small>Recent orders in the selected period</small></span><ChevronDown size={17}/></summary><div className="earnings-sale-list">{report.orders.map(sale=><article className={`earnings-sale ${excluded(sale)?'is-excluded':''}`} key={sale.id}>
      <header><div><h3>{sale.title}</h3><span>{when(sale.paidAt||sale.createdAt)} · <span className="earnings-order-id">{sale.id.slice(0,8)}</span></span></div><span className={`earnings-sale-status ${hasSettlement(sale)&&!excluded(sale)&&sale.status==='paid'?'is-confirmed':''}`}>{saleStatus(sale)}</span></header>
      <dl className="earnings-sale-values"><div><dt>Customer paid</dt><dd>{earningsMoney(sale.amount,sale.currency)}</dd></div><div><dt>Stripe fees</dt><dd>{saleFee(sale,'stripe')}</dd></div><div><dt>FiveGen fee{sale.feePlanId!=='historical'||sale.expectedFeeBps>0?` · ${sale.expectedFeeBps/100}%`:''}</dt><dd>{saleFee(sale,'platform')}</dd></div><div className="earnings-sale-net"><dt>Your earnings</dt><dd>{saleFee(sale,'net')}</dd></div></dl>
      {sale.settlementCurrency&&sale.settlementCurrency.toLowerCase()!==sale.currency.toLowerCase()&&sale.settlementAmount!==null&&!excluded(sale)&&<p className="earnings-settlement-note">Stripe converted this payment to {earningsMoney(sale.settlementAmount,sale.settlementCurrency)} before the fees shown above.</p>}
      {sale.feeStatus==='legacy'&&<p className="earnings-settlement-note">Purchased before FiveGen’s selling commission started. FiveGen’s fee for this sale is zero.</p>}
      {sale.feePlanId==='scale'&&<p className="earnings-settlement-note">Scale was active when checkout began. The 0% FiveGen fee is recorded for this order; Stripe processing still applies.</p>}
      {hasSettlement(sale)&&!excluded(sale)&&sale.availability==='pending'&&<p className="earnings-settlement-note">Stripe settlement pending{sale.availableAt?` · expected availability ${when(sale.availableAt)}`:''}. This is not yet an available bank payout.</p>}
      {excluded(sale)&&<p className="earnings-settlement-note">Original purchase amount shown for reference. Excluded from current earnings; Stripe has the refund or dispute balance details.</p>}
    </article>)}</div></details>}
  </section>;
}
