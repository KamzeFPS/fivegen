'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Brand } from '../ui-brand';

export function CheckoutWelcome({ signedIn, continueTo }: { signedIn: boolean; continueTo: string }) {
  const [completion, setCompletion] = useState<'sandbox' | 'production' | null>(null);
  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem('fivegen:paddle-checkout') || 'null');
      if (stored && ['sandbox', 'production'].includes(stored.environment) && Date.now() - stored.completedAt < 30 * 60 * 1000 && stored.completedAt <= Date.now()) setCompletion(stored.environment);
    } catch { /* The page also works without session storage. */ }
  }, []);
  return <main className="paddle-pricing"><nav className="paddle-nav"><a href="/" aria-label="FiveGen home"><Brand /></a><a className="paddle-back" href="/pricing">AI credits</a></nav><section className="paddle-receipt">
    {completion ? <CheckCircle2 size={45} /> : <Sparkles size={45} />}
    <h1>{completion ? 'You’re all set.' : 'Welcome to FiveGen.'}</h1>
    <p>{completion === 'sandbox' ? 'Your sandbox checkout is complete. No real money was charged. This test purchase does not add production AI credits.' : completion ? 'Your checkout is complete. Paddle will email your payment receipt.' : 'Bring your next idea to life. Your workspace is ready when you are.'}</p>
    <div className="paddle-receipt-actions"><Button asChild size="lg"><a href={continueTo}>{signedIn ? 'Open my workspace' : 'Sign in to FiveGen'}<ArrowRight size={17} /></a></Button><a href="/pricing">Back to AI credits</a>{completion && <small>Questions about your purchase? <a href="mailto:kamzewac@gmail.com">Contact support</a>.</small>}</div>
  </section></main>;
}
