// Creates permanent wallet infrastructure; never deletes billing entities.
// Run with the target environment file. Explicit mode and HTTPS origin required.
import Stripe from 'stripe';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
const mode=process.env.STRIPE_MODE,key=process.env.STRIPE_SECRET_KEY;
if(!['test','live'].includes(mode)||!key?.startsWith(`sk_${mode}_`))throw Error('Set matching STRIPE_MODE and STRIPE_SECRET_KEY explicitly.');
const origin=new URL(process.env.APP_ORIGIN||'');
if(origin.protocol!=='https:')throw Error('Wallets require an HTTPS origin, including for sandbox browser tests.');
const output=mode==='live'?'.env.stripe-wallets-live.local':'.env.stripe-wallets.local';
const existing=existsSync(output)?parseEnv(readFileSync(output,'utf8')):{};
const stripe=new Stripe(key,{maxNetworkRetries:2});
const domains=await stripe.paymentMethodDomains.list({domain_name:origin.hostname,limit:100});
const domain=domains.data.find(d=>d.enabled)||await stripe.paymentMethodDomains.create({domain_name:origin.hostname},{idempotencyKey:`fivegen-wallet-domain:${origin.hostname}`});
const destination=origin.origin+'/api/webhooks/wallet';
const events=['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','invoice.paid','charge.refunded','charge.dispute.created','charge.dispute.closed','charge.dispute.updated'];
let endpoint;
for await(const row of stripe.webhookEndpoints.list({limit:100}))if(row.url===destination&&row.status==='enabled')endpoint=row;
let signingSecret=existing.STRIPE_WALLET_WEBHOOK_SECRET;
if(endpoint){
  endpoint=await stripe.webhookEndpoints.update(endpoint.id,{enabled_events:events});
  if(!signingSecret)throw Error('Existing wallet destination retained. Save its signing secret in '+output+' and rerun; no duplicate will be created.');
}else{
  endpoint=await stripe.webhookEndpoints.create({url:destination,enabled_events:events,description:'FiveGen Apple Pay and Google Pay fulfillment',metadata:{purpose:'fivegen_wallet'}},{idempotencyKey:`fivegen-wallet-webhook:${origin.hostname}`});
  signingSecret=endpoint.secret;
  // Persist immediately: Stripe returns the signing secret only on creation.
  writeFileSync(output,Object.entries({...existing,STRIPE_WALLET_WEBHOOK_SECRET:signingSecret}).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
}
let portal;
for await(const row of stripe.billingPortal.configurations.list({limit:100}))if(row.metadata?.purpose==='fivegen_wallet')portal=row;
const portalSettings={business_profile:{headline:'FiveGen billing',privacy_policy_url:origin.origin+'/privacy',terms_of_service_url:origin.origin+'/terms'},features:{invoice_history:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'},subscription_update:{enabled:false},payment_method_update:{enabled:false},customer_update:{enabled:false}},metadata:{purpose:'fivegen_wallet'}};
portal=portal?await stripe.billingPortal.configurations.update(portal.id,portalSettings):await stripe.billingPortal.configurations.create(portalSettings,{idempotencyKey:`fivegen-wallet-portal:${origin.hostname}`});
const values={...existing,STRIPE_MODE:mode,STRIPE_SECRET_KEY:key,STRIPE_PUBLISHABLE_KEY:process.env.STRIPE_PUBLISHABLE_KEY||existing.STRIPE_PUBLISHABLE_KEY||'',STRIPE_WALLET_WEBHOOK_SECRET:signingSecret,STRIPE_WALLET_PORTAL_CONFIGURATION:portal.id,STRIPE_WALLET_CHECKOUT_ENABLED:'false'};
writeFileSync(output,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
const account=await stripe.accounts.retrieve(null);
console.log(JSON.stringify({mode,domain:{id:domain.id,name:domain.domain_name,applePay:domain.apple_pay.status,googlePay:domain.google_pay.status},webhook:{id:endpoint.id,url:destination},portal:portal.id,chargesEnabled:account.charges_enabled,configurationSaved:output,checkoutEnabled:false},null,2));
