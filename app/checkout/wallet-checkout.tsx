'use client';
import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {loadStripe} from '@stripe/stripe-js/pure';
import {CheckoutElementsProvider,CurrencySelectorElement,ExpressCheckoutElement,PaymentElement,useCheckoutElements} from '@stripe/react-stripe-js/checkout';
import type {StripeExpressCheckoutElementConfirmEvent} from '@stripe/stripe-js';
import {ArrowLeft,Check,CreditCard,Loader2,LockKeyhole} from 'lucide-react';
import {Brand} from '../ui-brand';
import type {WalletOffer} from '@/lib/wallet-catalog';
import type {walletPublicConfig} from '@/lib/wallet-stripe';
import {cardCheckoutOptions,expressCheckoutOptions} from '@/lib/wallet-checkout-options';

type CheckoutPrice={offerId:string;amount:string;currency:string};

function CardPaymentForm({setConfirming,subscription,onPriceChange,offerId}:{setConfirming:(busy:boolean)=>void;subscription:boolean;onPriceChange:(price:CheckoutPrice)=>void;offerId:string}) {
  const state=useCheckoutElements(),[ready,setReady]=useState(false),[error,setError]=useState(''),[expressError,setExpressError]=useState(''),[expressAvailable,setExpressAvailable]=useState(false),[currencyError,setCurrencyError]=useState(''),[busy,setBusy]=useState(false),confirmingRef=useRef(false);
  const amount=state.type==='success'?state.checkout.total.total.amount:null,currency=state.type==='success'?state.checkout.currency:null;
  useEffect(()=>{if(amount&&currency)onPriceChange({offerId,amount,currency});},[offerId,amount,currency,onPriceChange]);
  async function confirmPayment(expressEvent?:StripeExpressCheckoutElementConfirmEvent) {
    if(state.type!=='success'||confirmingRef.current)return;
    if(!expressEvent&&(!state.checkout.canConfirm||!ready))return;
    confirmingRef.current=true;setBusy(true);setConfirming(true);
    const reportError=expressEvent?setExpressError:setError;
    reportError('');
    try {
      const result=await state.checkout.confirm(expressEvent?{expressCheckoutConfirmEvent:expressEvent}:undefined);
      if(result.type==='error')reportError(result.error.message);
    }catch {reportError('Your payment could not complete. Check Billing & receipts before trying again.');}
    finally{confirmingRef.current=false;setBusy(false);setConfirming(false);}
  }
  async function confirm(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await confirmPayment();
  }
  async function confirmExpress(event:StripeExpressCheckoutElementConfirmEvent) {
    await confirmPayment(event);
  }
  if(state.type==='loading')return <p className="wallet-loading" role="status"><Loader2 className="animate-spin" size={19}/> Loading secure payment form…</p>;
  if(state.type==='error')return <div className="wallet-error" role="alert">Checkout could not load: {state.error.message}<button onClick={()=>location.reload()}>Reload checkout</button></div>;
  return <>
    <div className="wallet-total" aria-live="polite"><span>Total due today · {state.checkout.currency.toUpperCase()}</span><strong>{state.checkout.total.total.amount}</strong></div>
    {Boolean(state.checkout.currencyOptions?.length)&&<div className="stripe-currency-selector" inert={busy}><p>Payment currency</p><CurrencySelectorElement onReady={()=>setCurrencyError('')} onLoadError={()=>setCurrencyError('Currency choices could not load. Reload checkout before paying to choose your currency.')}/></div>}
    {currencyError&&<p className="wallet-error" role="alert">{currencyError}</p>}
    <div className="stripe-express-area" data-visible={expressAvailable} aria-hidden={!expressAvailable} aria-busy={busy}>
      <p className="stripe-express-label">Express checkout</p>
      <div className="stripe-express-buttons"><ExpressCheckoutElement options={expressCheckoutOptions} onConfirm={confirmExpress} onReady={event=>setExpressAvailable(Boolean(event.availablePaymentMethods?.link||event.availablePaymentMethods?.applePay||event.availablePaymentMethods?.googlePay))} onAvailablePaymentMethodsChange={event=>setExpressAvailable(Boolean(event.paymentMethods?.link?.available||event.paymentMethods?.applePay?.available||event.paymentMethods?.googlePay?.available))} onLoadError={()=>{setExpressAvailable(false);setExpressError('Express checkout could not load. You can still pay by card below.');}}/></div>
      <div className="stripe-payment-divider"><span>or pay with card</span></div>
    </div>
    {expressError&&<p className="wallet-error stripe-express-error" role="alert">{expressError}</p>}
    <form className="stripe-card-form" onSubmit={confirm} aria-busy={busy} aria-describedby={error?'card-payment-error':undefined}>
      <p className="stripe-card-label"><CreditCard size={17}/> Credit or debit card</p>
      <div className="stripe-card-element"><PaymentElement options={cardCheckoutOptions} onReady={()=>{setReady(true);setError('');}} onLoadError={event=>{setReady(false);setError(event.error.message||'The payment form could not load. Reload checkout and try again.');}}/></div>
      {!ready&&!error&&<p className="wallet-loading" role="status"><Loader2 className="animate-spin" size={18}/> Loading card details…</p>}
      {error&&<div id="card-payment-error" className="wallet-error" role="alert">{error}{!ready&&<button type="button" onClick={()=>location.reload()}>Reload payment form</button>}</div>}
      <button className="stripe-card-submit" type="submit" disabled={!ready||!state.checkout.canConfirm||busy}>{busy?<><Loader2 className="animate-spin" size={18}/> Processing payment…</>:<><LockKeyhole size={17}/>{subscription?'Subscribe':'Pay'} with credit or debit card</>}</button>
      {busy&&<p className="stripe-card-status" role="status">Follow any verification instructions from your bank.</p>}
    </form>
  </>;
}

export function WalletCheckout({config,offer,email}:{config:ReturnType<typeof walletPublicConfig>;offer:WalletOffer;email:string}) {
  const [session,setSession]=useState<{clientSecret:string;sessionId:string;offerId:string}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[closing,setClosing]=useState(false),[confirming,setConfirming]=useState(false),[price,setPrice]=useState<CheckoutPrice|null>(null);
  const activeSession=session?.offerId===offer.id?session:null,currentPrice=price?.offerId===offer.id?price:null;
  const stripe=useMemo(()=>config?.enabled?loadStripe(config.publishableKey):null,[config?.publishableKey,config?.enabled]);
  useEffect(()=>{
    if(!config?.enabled)return;
    let canceled=false;
    async function create(){
      try {
        const response=await fetch('/api/wallet/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({offerId:offer.id}),signal:AbortSignal.timeout(60000)});
        if(response.status===401||response.status===428){location.assign(`/welcome?return_to=${encodeURIComponent(location.pathname+location.search)}`);return;}
        const data=await response.json() as {clientSecret:string;sessionId:string;error?:string};if(!response.ok)throw new Error(data.error||'Checkout is unavailable.');
        if(!canceled)setSession({...data,offerId:offer.id});
      }catch(e){if(!canceled)setError(e instanceof Error?e.message:'Checkout could not load.');}
    }
    void create();return()=>{canceled=true;};
  },[config?.enabled,offer.id,retry]);
  async function back(){
    if(confirming||closing)return;setClosing(true);setError('');
    try {
      if(session){const r=await fetch('/api/wallet/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'close',sessionId:session.sessionId})});const d=await r.json() as {error?:string;completed?:boolean};if(!r.ok)throw new Error(d.error);if(d.completed){location.assign(`/welcome?session_id=${encodeURIComponent(session.sessionId)}`);return;}}
      location.assign(`/pricing${offer.interval?'':'?type=packs'}`);
    }catch(e){setError(e instanceof Error?e.message:'Could not close checkout.');setClosing(false);}
  }
  return <main className="paddle-pricing"><nav className="paddle-nav"><a href="/" aria-label="FiveGen home"><Brand/></a><button className="paddle-back" disabled={closing||confirming} onClick={back}><ArrowLeft size={16}/> {closing?'Closing checkout…':'Back to plans & credits'}</button></nav>
    <div className="wallet-checkout-layout"><section className="wallet-order"><span className="paddle-eyebrow">YOUR NEXT CREATION</span><h1>{offer.name}{offer.interval?' plan':''}</h1><p>{offer.description}</p><div className="wallet-order-price" aria-live="polite">{currentPrice?<>{currentPrice.amount}<span> {currentPrice.currency.toUpperCase()}{offer.interval?` / ${offer.interval}`:' · one time'}</span></>:<span>Your total will appear when checkout is ready.</span>}</div><ul>{offer.features.map(f=><li key={f}><Check size={17}/>{f}</li>)}</ul><p className="wallet-fine-print">{offer.interval?`Billed ${offer.interval==='year'?'annually':'monthly'}, with ${offer.credits.toLocaleString()} credits released each month. Automatically renews until canceled. Manage renewal in Billing & receipts. Unused monthly credits do not roll over.`:'One payment. No subscription. Your top-up credits never expire and never change your creator plan or selling fee.'}</p></section>
      <section className="wallet-payment-panel"><span className="wallet-secure"><LockKeyhole size={16}/> SECURE STRIPE CHECKOUT</span><h2>Your next idea starts here.</h2><p className="wallet-account-email">Credits will be added to <strong>{email}</strong></p>
        {config?.environment==='sandbox'&&<p className="wallet-test-note">Test mode · No real charge or production credits</p>}
        {!config?.enabled?<div className="wallet-unavailable"><CreditCard size={28}/><h3>Payments are temporarily unavailable.</h3><p>Please try again later. You can keep creating with your free allowance.</p><a href="/">Return to your studio</a></div>:activeSession?<CheckoutElementsProvider key={activeSession.sessionId} stripe={stripe} options={{clientSecret:activeSession.clientSecret,adaptivePricing:{allowed:true},elementsOptions:{appearance:{theme:'night',variables:{colorPrimary:'#ff8b42',borderRadius:'12px',fontFamily:'Inter, system-ui, sans-serif'}}}}}><CardPaymentForm setConfirming={setConfirming} subscription={Boolean(offer.interval)} onPriceChange={setPrice} offerId={offer.id}/></CheckoutElementsProvider>:!error&&<p className="wallet-loading" role="status"><Loader2 className="animate-spin" size={18}/> Preparing your secure checkout…</p>}
        {error&&<div className="wallet-error" role="alert"><p>{error}</p>{!activeSession&&<button onClick={()=>{setError('');setRetry(v=>v+1);}}>Try again</button>}<a href="/account/billing">View Billing & receipts</a></div>}
        <p className="wallet-fine-print">By authorizing payment, you agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/refund" target="_blank" rel="noreferrer">Refund Policy</a>. Payment is securely processed by Stripe. FiveGen never receives your full card details.</p>
      </section>
    </div>
  </main>;
}
