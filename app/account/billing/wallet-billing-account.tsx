'use client';
import {useState} from 'react';
import {ArrowLeft,ArrowUpRight,Loader2,ReceiptText,Smartphone} from 'lucide-react';
import {Brand} from '@/app/ui-brand';
import {Button} from '@/components/ui/button';
import type {walletAccount} from '@/lib/wallet-billing';
import type {paddleAccount} from '@/lib/paddle/account';
type Account=Awaited<ReturnType<typeof walletAccount>>;
type Previous=Awaited<ReturnType<typeof paddleAccount>>;
export function WalletBillingAccount({email,account,previous}:{email:string;account:Account|null;previous:Previous|null}) {
  const [busy,setBusy]=useState(''),[error,setError]=useState('');
  async function portal(provider:'wallet'|'paddle'){
    setBusy(provider);setError('');
    try{const response=await fetch(`/api/${provider}/portal`,{method:'POST'});const data=await response.json() as {url?:string;error?:string};if(!response.ok||!data.url)throw new Error(data.error||'The billing portal is unavailable.');location.assign(data.url);}
    catch(e){setError(e instanceof Error?e.message:'The billing portal is unavailable.');setBusy('');}
  }
  const hasPrevious=Boolean(previous?.customers.length);
  return <main className="paddle-pricing"><nav className="paddle-nav"><a href="/" aria-label="FiveGen home"><Brand/></a><a href="/pricing" className="paddle-back"><ArrowLeft size={16}/> Plans & credits</a></nav><div className="paddle-content paddle-account">
    <header><span className="paddle-eyebrow">YOUR ACCOUNT</span><h1>Billing & receipts</h1><p>{email}</p></header>
    {account?.environment==='sandbox'&&<div className="paddle-sandbox"><span>Test billing</span> Separate from your production AI balance.</div>}
    {error&&<p className="paddle-error" role="alert">{error}</p>}
    <section className="paddle-account-card"><Smartphone size={24}/><h2>Your purchases, in one place.</h2><p>View receipts and manage renewals for purchases made with Apple Pay or Google Pay.</p><Button disabled={!!busy||!account?.hasCustomer} onClick={()=>portal('wallet')}>{busy==='wallet'?<Loader2 size={17} className="animate-spin"/>:<ArrowUpRight size={17}/>}Manage billing</Button>{!account?.hasCustomer&&<small>Your billing profile appears after your first purchase.</small>}</section>
    {account?.environment==='sandbox'&&<section className="paddle-account-card"><span className="paddle-eyebrow">VERIFIED TEST BALANCE</span><h2>{account.testCredits?.toLocaleString()} test credits</h2><p>Test purchases confirm fulfillment without spending production AI capacity.</p></section>}
    <section className="paddle-account-card"><h2>Subscriptions</h2><p>{account?.subscriptionCredits.toLocaleString()??'0'} subscription credits available{account?.creditsResetAt?` · next reset ${new Date(account.creditsResetAt).toLocaleDateString()}`:''}. Top-up credits never expire.</p>{!account?.subscriptions.length?<p>No wallet subscription yet. <a href="/pricing">Explore plans</a> or choose a one-time pack.</p>:account.subscriptions.map(sub=><div className="paddle-account-row" key={sub.subscription_id}><div><strong>{['active','trialing'].includes(sub.status)?'Subscription active':'Subscription inactive'}</strong><p>{sub.cancel_at?`Renewal canceled · access until ${new Date(sub.cancel_at).toLocaleDateString()}`:sub.period_end?`Current period ends ${new Date(sub.period_end).toLocaleDateString()}`:sub.status}</p></div><span className="paddle-account-status">{sub.status}</span></div>)}</section>
    <section className="paddle-account-card"><h2><ReceiptText size={21}/> Recent wallet purchases</h2>{!account?.payments.length?<p>No verified wallet purchases yet.</p>:account.payments.map(p=><div className="paddle-account-row" key={p.id}><div><strong>{p.credits.toLocaleString()} credits{p.subscription_id?' / month':''}</strong><p>{new Date(p.created_at).toLocaleDateString()}{p.reversed?` · ${p.reversed} credits reversed`:''}</p></div><span className="paddle-account-status">{p.credited?'Verified':'Processing'}</span></div>)}<small>Amounts and downloadable invoices are available in your secure billing portal.</small></section>
    {hasPrevious&&<section className="paddle-account-card"><h2>Earlier purchases</h2><p>Your previous purchases and subscriptions remain available. Use their original billing portal for receipts and cancellation.</p><Button disabled={!!busy} onClick={()=>portal('paddle')}>{busy==='paddle'?<Loader2 size={17} className="animate-spin"/>:<ArrowUpRight size={17}/>}Manage earlier billing</Button>{previous!.subscriptions.map(s=><div className="paddle-account-row" key={s.subscription_id}><span>Earlier subscription{s.scheduled_change_action?` · ${s.scheduled_change_action} scheduled`:''}</span><span className="paddle-account-status">{s.status}</span></div>)}</section>}
  </div></main>;
}
