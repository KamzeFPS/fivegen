'use client';

import { useEffect, useRef, useState } from 'react';
import { initializePaddle, type Paddle, type PaddleEventData, type PricePreviewResponse } from '@paddle/paddle-js';
import { ArrowLeft, ArrowRight, Check, CircleAlert, Globe2, Loader2, LockKeyhole, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Brand } from '../ui-brand';
import { tierDefinitions, type PaddlePublicConfig, type Tier } from '@/lib/paddle/catalog';
import { checkoutOptions, checkoutSettings, previewRequest, verifiedPrices, type LocalizedPrice } from '@/lib/paddle/checkout';

type Props = { config?: PaddlePublicConfig; countryCode?: string; email?: string; configurationError?: string };

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), 20000);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

export function Pricing({ config, countryCode, email, configurationError }: Props) {
  const [prices, setPrices] = useState<Record<string, LocalizedPrice>>({});
  const [address, setAddress] = useState<PricePreviewResponse['data']['address']>(null);
  const [loading, setLoading] = useState(Boolean(config));
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);
  const paddleRef = useRef<Paddle | null>(null);
  const openingRef = useRef(false);
  const checkoutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tiers = config?.tiers ?? tierDefinitions;

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    function onEvent(event: PaddleEventData) {
      if (cancelled) return;
      if (['checkout.loaded', 'checkout.closed', 'checkout.error', 'checkout.completed'].includes(event.name ?? '')) {
        clearTimeout(checkoutTimer.current);
        openingRef.current = false;
        setOpening(null);
      }
      if (event.name === 'checkout.error' || event.type === 'error') {
        setError(event.detail === 'transaction_default_checkout_url_not_set'
          ? 'Paddle needs a default payment link. Set it in your Paddle dashboard under Checkout → Checkout settings, then try again.'
          : config!.environment === 'sandbox' && event.detail
          ? `Sandbox checkout: ${event.detail}${event.code ? ` (${event.code})` : ''}`
          : 'Checkout could not open. Please try again. If this continues, contact support.');
      }
      if (event.name === 'checkout.completed') {
        // This flag is presentation only. Never use browser events or storage
        // to credit a wallet or grant an entitlement.
        try { sessionStorage.setItem('fivegen:paddle-checkout', JSON.stringify({ environment: config!.environment, transactionId: event.data?.transaction_id, completedAt: Date.now() })); } catch { /* Storage can be unavailable in private browsing. */ }
        window.location.assign('/welcome');
      }
    }
    async function load() {
      setLoading(true);
      setPrices({});
      setError('');
      try {
        const paddle = await withTimeout(initializePaddle({ environment: config!.environment, token: config!.clientToken, eventCallback: onEvent, checkout: { settings: checkoutSettings(window.location.origin) } }), 'Checkout is taking too long to load. Check your connection and retry.');
        if (cancelled) return;
        if (!paddle) throw new Error('Paddle could not initialize. Please refresh the page.');
        paddle.Update({ eventCallback: onEvent });
        paddleRef.current = paddle;
        const preview = await withTimeout(paddle.PricePreview(previewRequest(config!.tiers, countryCode)), 'Local prices could not be loaded. Check your connection and retry.');
        if (cancelled) return;
        setPrices(verifiedPrices(preview, config!.tiers));
        setAddress(preview.data.address);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Local prices are unavailable. Please retry.');
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; clearTimeout(checkoutTimer.current); };
  }, [config, countryCode, retry]);

  async function buy(tier: Tier) {
    const price = prices[tier.priceId];
    if (!paddleRef.current || !price || loading || openingRef.current) return;
    openingRef.current = true;
    setOpening(tier.name);
    setError('');
    checkoutTimer.current = setTimeout(() => {
      openingRef.current = false;
      setOpening(null);
      setError('Checkout did not respond. Please check your connection and try again.');
    }, 20000);
    try {
      const response = await fetch('/api/paddle/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priceId: tier.priceId }), signal: AbortSignal.timeout(15000) });
      if (response.status === 401 || response.status === 428) { window.location.assign('/welcome?return_to=%2Fpricing'); return; }
      const intent = await response.json() as { email: string; customData: { fivegen_checkout_intent: string }; error?: string };
      if (!response.ok) throw new Error(intent.error || 'Your checkout could not be prepared. Please try again.');
      const options = checkoutOptions(price, window.location.origin, intent.email, address);
      paddleRef.current.Checkout.open({ ...options, customData: intent.customData, settings: { ...options.settings, allowLogout: false } });
    } catch (caught) {
      clearTimeout(checkoutTimer.current);
      openingRef.current = false;
      setOpening(null);
      setError(caught instanceof Error ? caught.message : 'Checkout could not open. Please try again.');
    }
  }

  return <main className="paddle-pricing">
    <nav className="paddle-nav" aria-label="Pricing navigation"><a href="/" aria-label="FiveGen home"><Brand /></a><div className="paddle-nav-links">{email && <a href="/account/billing">Billing & receipts</a>}<a className="paddle-back" href="/"><ArrowLeft size={16} /> Back to studio</a></div></nav>
    <div className="paddle-content">
      <header className="paddle-heading">
        <span className="paddle-eyebrow"><Sparkles size={16} /> YOUR NEXT IDEA STARTS HERE</span>
        <h1>More ideas.<br className="paddle-mobile-break" /> <span>More possibilities.</span></h1>
        <p>Your workspace is free. Add AI credits when you need them.</p>
        <div className="paddle-purchase-type"><Check size={16} /> One-time purchase <span aria-hidden="true">·</span> No subscription</div>
      </header>

      {config?.environment === 'sandbox' && <div className="paddle-sandbox"><span>Sandbox checkout</span> Test payments only. No real money is charged.</div>}
      {(configurationError || error) && <div className="paddle-error" role="alert"><CircleAlert size={20} /><div><strong>{configurationError ? 'Checkout setup is incomplete' : 'We couldn’t load checkout'}</strong><p>{configurationError || error}</p></div>{!configurationError && <Button variant="outline" disabled={loading || Boolean(opening)} onClick={() => { paddleRef.current?.Checkout.close(); setPrices({}); setLoading(true); setRetry(value => value + 1); }}><RefreshCw size={16} /> Retry</Button>}</div>}

      <section className="paddle-grid" aria-label="One-time AI credit packs" aria-busy={loading}>
        {tiers.map(tier => {
          const price = 'priceId' in tier ? prices[tier.priceId] : undefined;
          return <article key={tier.name} className={`paddle-tier ${tier.featured ? 'paddle-tier-featured' : ''}`}>
            <div className="paddle-tier-top"><span className="paddle-tier-icon">{tier.name === 'Starter' ? <Zap size={21} /> : <Sparkles size={21} />}</span>{tier.featured && <span className="paddle-recommendation">RECOMMENDED</span>}</div>
            <h2>{tier.name}</h2><p className="paddle-description">{tier.description}</p>
            <div className="paddle-price" aria-live="polite">{price ? <strong>{price.formattedTotals.total}</strong> : loading ? <span className="paddle-price-skeleton" aria-label="Loading local price" /> : <strong className="paddle-unavailable">Unavailable</strong>}<span>one-time payment</span></div>
            <Button className="paddle-buy" variant={tier.featured ? 'default' : 'outline'} disabled={!price || loading || Boolean(opening)} onClick={() => buy(tier as Tier)} aria-label={`Buy ${tier.name} credits${price ? ` for ${price.formattedTotals.total}` : ''}`}>{opening === tier.name ? <><Loader2 size={18} className="animate-spin" /> Opening checkout…</> : <>Buy credits <ArrowRight size={17} /></>}</Button>
            <div className="paddle-tier-divider" /><ul>{tier.features.map(feature => <li key={feature}><Check size={17} />{feature}</li>)}</ul>
          </article>;
        })}
      </section>

      <div className="paddle-assurance"><span><Globe2 size={16} /> Local prices, calculated by Paddle</span><span><LockKeyhole size={16} /> Secure checkout</span><span><Check size={16} /> No automatic renewals</span></div>
      <p className="paddle-tax-note">The total shown includes Paddle’s estimated tax for your location. Your billing address or tax details may change the final total at checkout.</p>
      <section className="paddle-included"><div><span className="paddle-included-icon"><Sparkles size={23} /></span><div><h2>Your workspace. Already included.</h2><p>3 complete AI products each month, plus unlimited manual products, funnels, courses, and communities. Images, videos, and extra AI creation use credits.</p></div></div><a href="/">Explore FiveGen <ArrowRight size={17} /></a></section>
      <footer className="paddle-footer"><span>Built for your next chapter.</span><div><a href="/terms">Terms & Conditions</a><a href="/refund">Refund policy</a><a href="mailto:kamzewac@gmail.com">Contact support</a></div></footer>
    </div>
  </main>;
}
