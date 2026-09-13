'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, CreditCard, Loader2, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Brand } from '@/app/ui-brand';
import type { paddleAccount } from '@/lib/paddle/account';
import { subscriptionGrantsAccess } from '@/lib/paddle/access';

export function BillingAccount({ email, account }: { email: string; account: Awaited<ReturnType<typeof paddleAccount>> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function openPortal() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/paddle/portal', { method: 'POST' });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'Your billing portal is unavailable. Please try again.');
      if (!data.url) throw new Error('Your billing portal did not return a link. Please try again.');
      location.assign(data.url);
    } catch (error) { setError((error as Error).message); setBusy(false); }
  }
  return <main className="paddle-pricing"><nav className="paddle-nav"><a href="/" aria-label="FiveGen home"><Brand /></a><a href="/pricing" className="paddle-back"><ArrowLeft size={16} /> AI credits</a></nav><div className="paddle-content paddle-account">
    <header><span className="paddle-eyebrow">YOUR ACCOUNT</span><h1>Billing & receipts</h1><p>{email}</p></header>
    {account.environment === 'sandbox' && <div className="paddle-sandbox"><span>Sandbox</span> Test billing is separate from your production credit balance.</div>}
    <section className="paddle-account-card"><div><CreditCard size={23} /><h2>Your billing, in one place.</h2><p>View invoices, update payment details, and manage any subscriptions in your secure Paddle portal.</p></div><Button onClick={openPortal} disabled={busy || !account.customers.length}>{busy ? <Loader2 className="animate-spin" size={16} /> : <ArrowUpRight size={16} />}{busy ? 'Opening portal…' : 'Manage billing'}</Button>{!account.customers.length && <small>Your billing profile appears after your first verified purchase.</small>}{error && <p className="paddle-error" role="alert">{error}</p>}</section>
    {account.environment === 'sandbox' && <section className="paddle-account-card"><span className="paddle-eyebrow">VERIFIED TEST BALANCE</span><h2>{account.sandboxCredits} sandbox credits</h2><p>These credits confirm fulfillment works. They do not spend real AI capacity.</p></section>}
    <section className="paddle-account-card"><h2>Subscriptions</h2><p>{account.subscriptionCredits.toLocaleString()} subscription credits available{account.creditsResetAt?` · next reset ${new Date(account.creditsResetAt).toLocaleDateString()}`:""}. Purchased credits never expire.</p>{!account.subscriptions.length ? <p>No recurring subscription. Explore plans or keep creating with one-time packs.</p> : account.subscriptions.map(subscription => <div className="paddle-account-row" key={subscription.subscription_id}><div><strong>{subscriptionGrantsAccess(subscription) ? 'Paid access available' : 'Paid access inactive'}</strong><p>{subscription.status}{subscription.scheduled_change_action ? ` · ${subscription.scheduled_change_action} scheduled for ${new Date(subscription.scheduled_change_at!).toLocaleDateString()}` : ''}</p></div><span className="paddle-account-status">{subscription.status}</span></div>)}</section>
    <section className="paddle-account-card"><h2><ReceiptText size={21} /> Recent purchases</h2>{!account.payments.length ? <p>No verified Paddle purchases yet. <a href="/pricing">Choose a credit pack</a>.</p> : account.payments.map(payment => <div className="paddle-account-row" key={payment.transaction_id}><div><strong>{payment.monthly_credits?`${payment.monthly_credits.toLocaleString()} credits / month`: `${payment.credits.toLocaleString()} AI credits`}</strong><p>{new Date(payment.created_at).toLocaleDateString()}{payment.reversed ? ` · ${payment.reversed} credits reversed` : ''}</p></div><span className="paddle-account-status">{payment.credited ? payment.monthly_credits?'Subscription funded':'Added' : 'Processing'}</span></div>)}<small>Payment amounts and downloadable invoices are available in your Paddle portal.</small></section>
  </div></main>;
}
