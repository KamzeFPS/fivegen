'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Brand } from '../ui-brand';

export function CheckoutWelcome({ signedIn, continueTo }: { signedIn: boolean; continueTo: string }) {
  const [completion, setCompletion] = useState<'sandbox' | 'production' | null>(null);
  const [fulfillment, setFulfillment] = useState<'waiting' | 'verified' | 'delayed' | null>(null);
  const [credits, setCredits] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    try {
      const stored = JSON.parse(sessionStorage.getItem('fivegen:paddle-checkout') || 'null');
      if (stored && ['sandbox', 'production'].includes(stored.environment) && Date.now() - stored.completedAt < 30 * 60 * 1000 && stored.completedAt <= Date.now()) {
        setCompletion(stored.environment);
        if (signedIn && stored.transactionId) {
          setFulfillment('waiting');
          let attempts = 0;
          async function verify() {
            if (cancelled) return;
            try {
              const response = await fetch('/api/paddle/account', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
              if (response.ok) {
                const data = await response.json() as { environment: string; payments: { transaction_id: string; credited: number; credits: number; reversed: number }[] };
                const payment = data.environment === stored.environment && data.payments.find(payment => payment.transaction_id === stored.transactionId && payment.credited);
                if (!cancelled && payment) { setCredits(payment.credits - payment.reversed); setFulfillment('verified'); return; }
              }
            } catch { /* A delayed webhook can safely be checked again from Billing. */ }
            if (cancelled) return;
            if (++attempts < 15) timer = setTimeout(verify, 2500);
            else setFulfillment('delayed');
          }
          void verify();
        }
      }
    } catch { /* The page also works without session storage. */ }
    return () => { cancelled = true; clearTimeout(timer); };
  }, [signedIn]);
  return <main className="paddle-pricing"><nav className="paddle-nav"><a href="/" aria-label="FiveGen home"><Brand /></a><a className="paddle-back" href="/pricing">AI credits</a></nav><section className="paddle-receipt">
    {completion ? <CheckCircle2 size={45} /> : <Sparkles size={45} />}
    <h1>{fulfillment === 'verified' ? 'Your credits are ready.' : completion ? 'Thank you for your purchase.' : 'Welcome to FiveGen.'}</h1>
    <p>{completion === 'sandbox' ? 'Your sandbox checkout is complete. No real money was charged. This test purchase does not add production AI credits.' : completion ? 'Your checkout is complete. Paddle will email your payment receipt.' : 'Bring your next idea to life. Your workspace is ready when you are.'}</p>
    {fulfillment && <p role="status">{fulfillment === 'verified' ? `${credits} ${completion === 'sandbox' ? 'sandbox ' : ''}credits added to your account.` : fulfillment === 'waiting' ? 'Confirming your payment and adding your credits…' : 'Your payment confirmation is taking a little longer. Check Billing & receipts for its status. Please don’t purchase again.'}</p>}
    <div className="paddle-receipt-actions"><Button asChild size="lg"><a href={continueTo}>{signedIn ? 'Open my workspace' : 'Sign in to FiveGen'}<ArrowRight size={17} /></a></Button>{signedIn && <a href="/account/billing">Billing & receipts</a>}<a href="/pricing">Back to AI credits</a>{completion && <small>Questions about your purchase? <a href="mailto:kamzewac@gmail.com">Contact support</a>.</small>}</div>
  </section></main>;
}
