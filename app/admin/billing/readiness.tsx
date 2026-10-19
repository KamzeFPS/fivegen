'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowUpRight,CheckCircle2,Loader2,RefreshCw,ShieldCheck,TriangleAlert} from 'lucide-react';
import {Brand} from '@/app/ui-brand';
import type {WalletReadiness} from '@/lib/wallet-readiness';

export function BillingReadiness(){
  const [data,setData]=useState<WalletReadiness|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function check(){
    setBusy(true);setError('');
    try{const response=await fetch('/api/admin/billing/readiness',{cache:'no-store',signal:AbortSignal.timeout(45000)}),body=await response.json() as WalletReadiness&{error?:string};if(!response.ok)throw new Error(body.error||'Payment readiness could not be checked.');setData(body);}
    catch(error){setError(error instanceof Error?error.message:'Payment readiness could not be checked.');}
    finally{setBusy(false);}
  }
  useEffect(()=>{void check();},[]);
  return <main className="paddle-pricing"><nav className="paddle-nav"><a href="/" aria-label="FiveGen home"><Brand/></a><a className="paddle-back" href="/?view=admin"><ArrowLeft size={16}/> Platform settings</a></nav><div className="paddle-content paddle-account">
    <header><span className="paddle-eyebrow"><ShieldCheck size={16}/> ADMINISTRATION</span><h1>Payment readiness</h1><p>Check the complete path from checkout to credits, receipts, and cancellation.</p></header>
    <section className="paddle-account-card wallet-readiness-summary"><div><h2>{data?data.enabled?'Checkout is enabled':data.readyToEnable?'Configuration is ready for release':'Payments need attention':'Checking payment configuration…'}</h2><p>{data?`${data.environment==='production'?'Live':data.environment==='sandbox'?'Test':'Unconfigured'} environment · Checked ${new Date(data.checkedAt).toLocaleTimeString()}`:'Only the platform administrator can see these checks.'}</p>{data?.account&&<p>{data.account.name} · {data.account.id}</p>}<p>These checks never take a payment or change your Stripe account. Complete sandbox checkout, webhook delivery, refunds, and cancellation verification before enabling live checkout.</p></div><button className="wallet-secondary-button" disabled={busy} onClick={()=>void check()}>{busy?<Loader2 className="animate-spin" size={16}/>:<RefreshCw size={16}/>}Run checks</button></section>
    {error&&<p className="wallet-error" role="alert">{error}</p>}
    <div className="wallet-readiness-list">{data?.checks.map(check=><section key={check.id} className="paddle-account-card wallet-readiness-check" data-status={check.status}>{check.status==='ready'?<CheckCircle2 size={21}/>:<TriangleAlert size={21}/>}<div><h2>{check.label}<span>{check.status==='ready'?'Ready':check.status==='blocked'?'Action needed':'Review'}</span></h2><p>{check.detail}</p>{check.action&&<p className="wallet-readiness-action">{check.action}</p>}{check.href&&<a href={check.href} target="_blank" rel="noreferrer">Open Stripe <ArrowUpRight size={14}/></a>}</div></section>)}</div>
    <p className="paddle-tax-note">Credentials and signing secrets stay server-side. Existing payment records, customers, subscriptions, and webhook destinations are preserved.</p>
  </div></main>;
}
