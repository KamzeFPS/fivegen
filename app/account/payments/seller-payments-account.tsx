'use client';

import {useCallback,useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,CheckCircle2,ChevronRight,ExternalLink,Loader2,RefreshCw,ShieldCheck,Wallet} from 'lucide-react';
import {Brand} from '@/app/ui-brand';
import {CreatorSaleFees} from '@/app/creator-sale-fees';
import type {CreatorPlanState} from '@/lib/creator-plans';

export interface SellerPaymentStatus {
  configured:boolean;
  enabled:boolean;
  mode:'live'|'test'|null;
  connected:boolean;
  ready:boolean;
  accountId:string|null;
  creatorPlan?:CreatorPlanState;
}

// Choosing a legal country is a deliberate seller action. This ISO list does
// not imply Stripe supports every country; Stripe validates availability.
const countryCodes='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const countryNames=new Intl.DisplayNames(['en'],{type:'region'});
const countries=countryCodes.map(code=>({code,name:countryNames.of(code)||code})).sort((a,b)=>a.name.localeCompare(b.name,'en'));

export function sellerPaymentReturnPath(value:string|null):string|null{
  if(!value||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return null;
  try{
    const url=new URL(value,'https://fivegen.local'),uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    if(url.origin!=='https://fivegen.local')return null;
    if(new RegExp(`^/build/${uuid}$`,'i').test(url.pathname))return url.pathname+url.search+url.hash;
    if(url.pathname==='/'&&new RegExp(`^${uuid}$`,'i').test(url.searchParams.get('project')||'')&&url.searchParams.get('area')==='commerce')return '/?project='+url.searchParams.get('project')+'&area=commerce';
  }catch{}
  return null;
}

export function SellerPaymentsAccount({email,initialAccount}:{email:string;initialAccount:SellerPaymentStatus}){
  const [account,setAccount]=useState(initialAccount),[country,setCountry]=useState(''),[busy,setBusy]=useState<'refresh'|'connect'|''>('refresh'),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [returnTo,setReturnTo]=useState<string|null>(null);
  const available=account.configured&&account.enabled,ready=available&&account.ready;

  const refresh=useCallback(async(initial=false,returned?:string|null)=>{
    setBusy('refresh');setError('');
    if(!initial)setNotice('');
    try{
      const response=await fetch('/api/commerce/connect',{cache:'no-store',signal:AbortSignal.timeout(60000)});
      const data=await response.json() as SellerPaymentStatus&{error?:string};
      if(!response.ok||typeof data.connected!=='boolean')throw new Error(data.error||'Your payment connection could not be checked. Please try again.');
      setAccount(data);
      if(data.ready&&data.enabled)setNotice('Your payment account is ready for every product in this profile.');
      else if(!initial)setNotice(data.connected?'Stripe still needs information before you can accept payments. Continue setup to review it.':'Your profile has no connected payment account yet.');
      else setNotice(returned==='refresh'?'Your Stripe setup link expired. Continue setup below to get a fresh link.':'');
    }catch(failure){setError(failure instanceof Error?failure.message:'Your payment connection could not be checked. Please try again.');setNotice('');}
    finally{setBusy('');}
  },[]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search),returned=params.get('connect'),requestedReturn=sellerPaymentReturnPath(params.get('return_to'));
    if(requestedReturn){setReturnTo(requestedReturn);try{sessionStorage.setItem('fivegen-seller-payment-return',requestedReturn);}catch{}}
    else if(returned==='returned'||returned==='refresh'){try{setReturnTo(sellerPaymentReturnPath(sessionStorage.getItem('fivegen-seller-payment-return')));}catch{}}
    if(returned==='returned')setNotice('Welcome back. Checking your Stripe connection…');
    if(returned==='refresh')setNotice('Your Stripe setup link expired. Continue setup below to get a fresh link.');
    void refresh(true,returned);
  },[refresh]);

  async function connect(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||!available)return;
    if(!account.connected&&!country){setError('Select the country where your business is legally based.');return;}
    setBusy('connect');setError('');setNotice('');
    try{
      const response=await fetch('/api/commerce/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(account.connected?{}:{country}),signal:AbortSignal.timeout(60000)});
      const data=await response.json() as {url?:string;error?:string};
      if(!response.ok||!data.url)throw new Error(data.error||'Stripe setup could not be opened. Please try again.');
      const destination=new URL(data.url);
      if(destination.protocol!=='https:'||!(destination.hostname==='stripe.com'||destination.hostname.endsWith('.stripe.com')))throw new Error('Stripe returned an unexpected setup link. Please contact FiveGen support.');
      window.location.assign(destination.href);
    }catch(failure){setError(failure instanceof Error?failure.message:'Stripe setup could not be opened. Please try again.');setBusy('');}
  }

  return <main className="paddle-pricing seller-payments-page">
    <nav className="paddle-nav"><a href="/" aria-label="FiveGen home"><Brand/></a><a href={returnTo||'/?view=library'} className="paddle-back"><ArrowLeft size={16}/>{returnTo?'Back to my product':'Back to my products'}</a></nav>
    <div className="paddle-content seller-payments-content">
      <header className="seller-payments-heading"><span className="paddle-eyebrow">YOUR PROFILE · SELLER PAYMENTS</span><h1>One connection.<br/><span>Every product.</span></h1><p>Connect your Stripe account once. All products in your FiveGen profile use the same payment connection.</p><span className="seller-payments-email">{email}</span></header>
      {error&&<div className="paddle-error seller-payment-error" role="alert"><div><strong>We couldn’t complete that step.</strong><p>{error}</p><p>Your products and published pages are unchanged.</p></div></div>}
      {notice&&<p className="seller-payment-notice" role="status">{notice}</p>}
      <div className="seller-payments-layout">
        <section className="paddle-account-card seller-payment-card" aria-labelledby="seller-connection-title">
          <div className="seller-payment-card-top"><span className="seller-payment-icon"><Wallet size={24}/></span><span className={`seller-payment-badge ${ready?'is-ready':''}`}><span/>{busy==='refresh'?'Checking connection':ready?'Ready to accept payments':!available?'Platform setup needed':account.connected?'Setup incomplete':'Not connected'}{account.mode&&<small>{account.mode==='live'?'Live':'Test'}</small>}</span></div>
          <h2 id="seller-connection-title">{ready?'Your Stripe account is connected.':account.connected?'Finish your Stripe setup.':'Connect payments to your profile.'}</h2>
          <p>{ready?'Your connection is available across all of your products. You never need to connect Stripe again for each new product.':account.connected?'Your existing account is saved. Continue with Stripe to review any missing business details, verification or payout information.':'Stripe securely collects your business details and payout information. You’ll return here when setup is complete.'}</p>
          {!available&&<div className="seller-payment-platform"><ShieldCheck size={19}/><p>FiveGen’s platform payment setup needs attention. You can keep building and publishing while the administrator resolves it. Refresh the connection to check again.</p></div>}
          {ready?<div className="seller-payment-ready"><CheckCircle2 size={19}/><div><strong>Connected for all products</strong><p>Publish complete content, then turn on sales in each product when you’re ready to launch.</p></div></div>:available&&<form onSubmit={event=>void connect(event)}>
            {!account.connected&&<label className="seller-payment-country" htmlFor="seller-business-country"><span>Legal business country</span><select id="seller-business-country" name="country" required value={country} disabled={!!busy} onChange={event=>setCountry(event.target.value)}><option value="" disabled>Select your business country</option>{countries.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select><small>Choose where your business is legally based. Stripe confirms country and account availability during setup.</small></label>}
            <button type="submit" className="seller-payment-primary" disabled={!!busy||(!account.connected&&!country)}>{busy==='connect'?<><Loader2 size={17} className="animate-spin"/>Opening Stripe…</>:<>{account.connected?'Continue Stripe setup':'Connect Stripe'}<ExternalLink size={16}/></>}</button>
          </form>}
          <div className="seller-payment-actions">{ready&&<a href={returnTo||'/?view=library'} className="seller-payment-products">{returnTo?'Return to my product':'My products'}<ArrowRight size={16}/></a>}<button type="button" className="seller-payment-refresh" onClick={()=>void refresh()} disabled={!!busy}>{busy==='refresh'?<Loader2 size={15} className="animate-spin"/>:<RefreshCw size={15}/>}Refresh connection</button></div>
          <small className="seller-payment-secure"><ShieldCheck size={14}/>Business and bank details are handled securely by Stripe.</small>
        </section>
        <aside className="seller-payments-aside"><section aria-labelledby="seller-how-it-works"><span className="paddle-eyebrow">HOW IT WORKS</span><h2 id="seller-how-it-works">Set up once.<br/>Launch on your terms.</h2><ol><li><span>01</span><div><strong>Connect your profile</strong><p>Complete your business and payout details on Stripe.</p></div></li><li><span>02</span><div><strong>Publish any product</strong><p>Your page can be published before payment setup is complete.</p></div></li><li><span>03</span><div><strong>Start selling when ready</strong><p>Turn on sales for a finished product. It uses this shared connection.</p></div></li></ol><div className="seller-payments-fees"><CreatorSaleFees compact plan={account.creatorPlan}/></div></section><a href="/account/billing" className="seller-billing-link"><span><strong>FiveGen plans & credits</strong><small>Manage your own purchases and receipts.</small></span><ChevronRight size={17}/></a></aside>
      </div>
      <footer className="seller-payment-footer"><Check size={14}/>Payment setup is optional until you want to accept orders. <a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>
    </div>
  </main>;
}
