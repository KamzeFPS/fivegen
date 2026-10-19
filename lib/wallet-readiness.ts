import {binding} from './server';
import {walletEnvironment,walletPublicConfig,walletStripe} from './wallet-stripe';

export type BillingCheck={id:string;label:string;status:'ready'|'blocked'|'warning';detail:string;action?:string;href?:string};
export type WalletReadiness={environment:'production'|'sandbox'|null;enabled:boolean;readyToEnable:boolean;checkedAt:number;checks:BillingCheck[];account?:{id:string;name:string;chargesEnabled:boolean;payoutsEnabled:boolean}};
const walletEvents=['checkout.session.completed','checkout.session.async_payment_succeeded','invoice.paid','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','charge.refunded','charge.dispute.created','charge.dispute.updated','charge.dispute.closed'];

// Admin-only callers receive actionable state, never credential values or raw
// Stripe errors. These are read-only checks: they do not activate payments.
export async function walletReadiness(origin:string):Promise<WalletReadiness> {
  const checks:BillingCheck[]=[];let providerAccount:WalletReadiness['account'];
  let environment:WalletReadiness['environment']=null;
  try{environment=walletEnvironment();}catch{/* Report the explicit mode below. */}
  const config=walletPublicConfig(),enabled=binding('STRIPE_WALLET_CHECKOUT_ENABLED')==='true';
  checks.push({id:'environment',label:'Payment environment',status:environment?'ready':'blocked',detail:environment?`${environment==='production'?'Live':'Test'} mode is explicitly selected.`:'STRIPE_MODE must be explicitly set to live or test.',action:environment?undefined:'Set STRIPE_MODE in the service environment; use matching keys.'});
  checks.push({id:'keys',label:'Stripe key environment',status:config?'ready':'blocked',detail:config?'Server and client key formats match the selected environment.':'Stripe server and publishable keys are missing or do not match the selected environment.',action:config?undefined:'Check STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in the service environment.'});
  const secretPresent=binding('STRIPE_WALLET_WEBHOOK_SECRET').startsWith('whsec_');
  checks.push({id:'signing-secret',label:'Webhook signing secret',status:secretPresent?'ready':'blocked',detail:secretPresent?'A notification signing secret is configured. Its value is never shown here.':'The wallet webhook signing secret is missing.',action:secretPresent?undefined:'Save the existing wallet notification signing secret as STRIPE_WALLET_WEBHOOK_SECRET. Do not use the API key.'});
  checks.push({id:'switch',label:'Checkout release switch',status:enabled?'ready':'blocked',detail:enabled?'Checkout is enabled in the service environment.':'Checkout is intentionally disabled by STRIPE_WALLET_CHECKOUT_ENABLED.',action:enabled?undefined:'Complete account activation and sandbox verification, then set STRIPE_WALLET_CHECKOUT_ENABLED=true.'});
  if(config){
    const stripe=walletStripe(),host=new URL(origin).hostname,destination=new URL('/api/webhooks/wallet',origin).href,portal=binding('STRIPE_WALLET_PORTAL_CONFIGURATION');
    const results=await Promise.allSettled([
      stripe.accounts.retrieve(null),stripe.webhookEndpoints.list({limit:100}),
      portal?stripe.billingPortal.configurations.retrieve(portal):Promise.resolve(null),
      stripe.paymentMethodDomains.list({domain_name:host,limit:100}),
    ]);
    const [account,webhooks,configuration,domains]=results;
    if(account.status==='fulfilled'){
      providerAccount={id:account.value.id,name:account.value.business_profile?.name||account.value.settings?.dashboard?.display_name||'Stripe account',chargesEnabled:account.value.charges_enabled,payoutsEnabled:account.value.payouts_enabled};
      checks.push({id:'activation',label:'Stripe account activation',status:environment==='sandbox'||account.value.charges_enabled?'ready':'blocked',detail:environment==='sandbox'?'Test mode is available without taking real payments.':account.value.charges_enabled?'Stripe reports that this account can accept live charges.':'Stripe reports charges_enabled=false. Live payments cannot complete.',action:environment==='production'&&!account.value.charges_enabled?'Open Stripe and complete account activation and any requested verification.':undefined,href:'https://dashboard.stripe.com/account/status'});
    }
    else checks.push({id:'activation',label:'Stripe account activation',status:'blocked',detail:'Stripe account readiness could not be verified.',action:'Check server API key permissions and Stripe connectivity; then run this check again.'});
    if(webhooks.status==='fulfilled'){
      const endpoint=webhooks.value.data.find(row=>row.url===destination&&row.status==='enabled');
      const received=new Set<string>(endpoint?.enabled_events??[]),missing=walletEvents.filter(event=>endpoint&&!received.has('*')&&!received.has(event));
      checks.push({id:'webhook',label:'Credit delivery webhook',status:endpoint&&!missing.length?'ready':'blocked',detail:endpoint?missing.length?`The existing destination is missing ${missing.length} required event types.`:'An enabled destination receives purchase, renewal, cancellation, refund and dispute events.':'No enabled wallet notification destination matches this site.',action:endpoint&&!missing.length?undefined:`Keep the existing destination and configure ${destination} for: ${walletEvents.join(', ')}.`,href:'https://dashboard.stripe.com/webhooks'});
      if(webhooks.value.has_more&&!endpoint)checks.push({id:'webhook-pagination',label:'Additional notification destinations',status:'warning',detail:'Stripe has more than 100 destinations. Verify the matching destination in the dashboard.'});
    }else checks.push({id:'webhook',label:'Credit delivery webhook',status:'blocked',detail:'Notification configuration could not be read.',action:'Grant read access to webhook endpoints and check the existing destination in Stripe.'});
    if(configuration.status==='fulfilled'&&configuration.value){
      const value=configuration.value,ready=value.active&&value.features.invoice_history.enabled&&value.features.subscription_cancel.enabled;
      checks.push({id:'portal',label:'Receipts and cancellation',status:ready?'ready':'blocked',detail:ready?'The customer portal is active with invoice history and subscription cancellation.':'The configured customer portal is inactive or lacks invoice history or cancellation.',action:ready?undefined:'Enable invoice history and end-of-period cancellation in the existing portal configuration.',href:'https://dashboard.stripe.com/settings/billing/portal'});
      checks.push({id:'payment-method-update',label:'Customer payment method updates',status:value.features.payment_method_update.enabled?'ready':'warning',detail:value.features.payment_method_update.enabled?'Customers can update their payment method in the portal.':'Payment method updates are disabled in the customer portal.',action:value.features.payment_method_update.enabled?undefined:'Enable payment method updates in the existing Stripe customer portal configuration.',href:'https://dashboard.stripe.com/settings/billing/portal'});
    }else checks.push({id:'portal',label:'Receipts and cancellation',status:'blocked',detail:'The configured customer portal could not be verified.',action:'Set STRIPE_WALLET_PORTAL_CONFIGURATION to the existing portal configuration with invoice history and cancellation.'});
    if(domains.status==='fulfilled'){
      const domain=domains.value.data.find(row=>row.enabled&&row.domain_name===host),ready=domain?.apple_pay.status==='active'&&domain.google_pay.status==='active';
      checks.push({id:'wallet-domain',label:'Apple Pay and Google Pay domain',status:ready?'ready':'warning',detail:ready?`${host} is registered with both wallets active.`:`Wallet registration is incomplete for ${host}. Card checkout may still be available.`,action:ready?undefined:'Register this HTTPS domain under Stripe payment method domains and verify wallet status.',href:'https://dashboard.stripe.com/settings/payment_method_domains'});
    }else checks.push({id:'wallet-domain',label:'Apple Pay and Google Pay domain',status:'warning',detail:'Wallet domain status could not be read. Check payment method domains in Stripe.'});
  }
  return {environment,enabled:Boolean(config?.enabled),readyToEnable:checks.every(check=>check.id==='switch'||check.status!=='blocked'),checkedAt:Date.now(),checks,...(providerAccount?{account:providerAccount}:{})};
}
