'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,LockKeyhole,Smartphone,Sparkles,Zap} from 'lucide-react';
import {Brand} from '../ui-brand';
import type {WalletOffer} from '@/lib/wallet-catalog';
import type {walletPublicConfig} from '@/lib/wallet-stripe';
export function Pricing({config,offers,email}:{config:ReturnType<typeof walletPublicConfig>;offers:WalletOffer[];email?:string}) {
  const [type,setType]=useState<'plans'|'packs'>('plans'),[interval,setInterval]=useState<'month'|'year'>('month');
  useEffect(()=>{if(new URLSearchParams(location.search).get('type')==='packs')setType('packs');},[]);
  const tiers=offers.filter(o=>type==='packs'?!o.interval:o.interval===interval);
  return <main className="paddle-pricing">
    <nav className="paddle-nav" aria-label="Pricing navigation"><a href="/" aria-label="FiveGen home"><Brand/></a><div className="paddle-nav-links">{email&&<a href="/account/billing">Billing & receipts</a>}<a href="/" className="paddle-back"><ArrowLeft size={16}/> Back to studio</a></div></nav>
    <div className="paddle-content">
      <header className="paddle-heading"><span className="paddle-eyebrow"><Sparkles size={16}/> YOUR NEXT IDEA STARTS HERE</span><h1>More ideas.<br className="paddle-mobile-break"/> <span>More possibilities.</span></h1><p>Choose a monthly credit allowance, or top up on your terms.</p>
        <div className="paddle-purchase-tabs" aria-label="Purchase type">{(['plans','packs'] as const).map(t=><button key={t} aria-pressed={type===t} onClick={()=>setType(t)}>{t==='plans'?'Subscriptions':'One-time credit packs'}</button>)}</div>
        {type==='plans'?<div className="paddle-interval" aria-label="Billing period"><button aria-pressed={interval==='month'} onClick={()=>setInterval('month')}>Monthly</button><button aria-pressed={interval==='year'} onClick={()=>setInterval('year')}>Yearly</button><span>Credits refresh monthly on either plan</span></div>:<div className="paddle-purchase-type"><Check size={16}/> One-time purchase · Credits never expire</div>}
      </header>
      {config?.environment==='sandbox'&&<div className="paddle-sandbox"><span>Test mode</span> No real money is charged. Test credits do not spend AI capacity.</div>}
      {!config?.enabled&&<div className="paddle-sandbox" role="status"><span>Wallet payments coming soon</span> Apple Pay and Google Pay are being set up. Free creation remains available.</div>}
      <section className="paddle-grid" aria-label={type==='plans'?'AI subscriptions':'AI credit packs'}>
        {type==='plans'&&<article className="paddle-tier paddle-free"><div className="paddle-tier-top"><Zap size={21}/></div><h2>Free</h2><p className="paddle-description">Find your direction. Make your first creations.</p><div className="paddle-price"><strong>Free</strong><span>No payment required</span></div><a className="paddle-buy" href={email?'/':'/signin-with-chatgpt?return_to=%2F'}>Start creating <ArrowRight size={17}/></a><div className="paddle-tier-divider"/><ul>{['3 complete AI products each month','20 AI planning messages each month','Unlimited manual products & downloads','Top up credits for images and video'].map(f=><li key={f}><Check size={17}/>{f}</li>)}</ul></article>}
        {tiers.map(tier=><article key={tier.id} className={`paddle-tier ${tier.featured?'paddle-tier-featured':''}`}><div className="paddle-tier-top"><span className="paddle-tier-icon"><Sparkles size={21}/></span>{tier.featured&&<span className="paddle-recommendation">RECOMMENDED</span>}</div><h2>{tier.name}</h2><p className="paddle-description">{tier.description}</p><div className="paddle-price"><strong>{tier.price}<small className="wallet-currency"> USD</small></strong><span>{tier.interval?`billed every ${tier.interval==='month'?'month':'year'}`:'one-time payment'}</span></div>{config?.enabled?<a className="paddle-buy" href={`/checkout?offer=${encodeURIComponent(tier.id)}`}>{tier.interval?'Subscribe':'Buy credits'} <ArrowRight size={17}/></a>:<button className="paddle-buy" disabled>Available soon <LockKeyhole size={17}/></button>}<div className="paddle-tier-divider"/><ul>{tier.features.map(f=><li key={f}><Check size={17}/>{f}</li>)}</ul></article>)}
      </section>
      <div className="paddle-assurance"><span><Smartphone size={16}/> Apple Pay & Google Pay</span><span><LockKeyhole size={16}/> Encrypted wallet checkout</span><span><Check size={16}/> {type==='plans'?'Cancel future renewals in your account':'No automatic renewals'}</span></div>
      <p className="paddle-tax-note">Prices are in USD. Review the exact total before authorizing your wallet payment. Wallet availability depends on your browser, device, location and wallet setup.</p>
      <section className="paddle-included"><div><span className="paddle-included-icon"><Sparkles size={23}/></span><div><h2>Know what every credit creates.</h2><p>12 credits per image. 160 credits per 5-second video with audio. Additional product content uses 10–30 credits per step, depending on the active model. Review the cost in your studio before generation.</p></div></div><a href="/">Explore FiveGen <ArrowRight size={17}/></a></section>
      <p className="paddle-tax-note">Subscription credits reset each monthly anniversary and do not roll over. Annual plans are billed for the full year and release credits monthly. Purchased top-up credits never expire. Subscriptions renew automatically until canceled; credit packs do not renew.</p>
      <footer className="paddle-footer"><span>Built for your next chapter.</span><div><a href="/privacy">Privacy Policy</a><a href="/terms">Terms & Conditions</a><a href="/refund">Refund policy</a><a href="mailto:kamzewac@gmail.com">Contact support</a></div></footer>
    </div>
  </main>;
}
