import {binding} from './server';
import {commerceStripe} from './commerce-v2-server';
import type {BillingCheck} from './wallet-readiness';

export type CommerceReadiness={mode:'live'|'test'|null;enabled:boolean;readyToEnable:boolean;checkedAt:number;checks:BillingCheck[]};
const commerceEvents=['checkout.session.completed','checkout.session.async_payment_succeeded','charge.refunded','charge.dispute.created','charge.dispute.closed','account.updated'];

// These admin-only checks never create a connected account or change Stripe
// configuration. A Connect webhook is associated with a Connect application;
// Stripe's endpoint objects do not include the creation parameter `connect`.
export async function commerceReadiness(origin:string):Promise<CommerceReadiness>{
  const configuredMode=binding('STRIPE_MODE'),mode=configuredMode==='live'||configuredMode==='test'?configuredMode:null;
  const keyMatches=Boolean(mode&&new RegExp(`^(sk|rk)_${mode}_`).test(binding('STRIPE_SECRET_KEY')));
  const secretPresent=binding('STRIPE_CONNECT_WEBHOOK_SECRET').startsWith('whsec_'),releaseEnabled=binding('STRIPE_COMMERCE_ENABLED')==='true';
  const checks:BillingCheck[]=[
    {id:'environment',label:'Seller payment environment',status:mode?'ready':'blocked',detail:mode?`${mode==='live'?'Live':'Test'} mode is explicitly selected.`:'STRIPE_MODE must be explicitly set to live or test.',action:mode?undefined:'Set STRIPE_MODE and use a matching server key.'},
    {id:'keys',label:'Seller Stripe server key',status:keyMatches?'ready':'blocked',detail:keyMatches?'The server key format matches the selected mode. Connect API access is checked separately.':'The server key is missing or does not match the selected mode.',action:keyMatches?undefined:'Check STRIPE_SECRET_KEY in the service environment. A publishable key cannot create connected accounts.'},
    {id:'signing-secret',label:'Seller webhook signing secret',status:secretPresent?'ready':'blocked',detail:secretPresent?'A seller signing secret is configured; its value is never shown here.':'STRIPE_CONNECT_WEBHOOK_SECRET is missing.',action:secretPresent?'Verify that this secret belongs to the existing Connected accounts destination below. It is separate from the platform subscription webhook secret.':'Save the Connected accounts destination signing secret as STRIPE_CONNECT_WEBHOOK_SECRET. Keep the existing destination.'},
    {id:'switch',label:'Seller connection release switch',status:releaseEnabled?'ready':'blocked',detail:releaseEnabled?'Seller connections are enabled in the service environment.':'Seller connections are disabled by STRIPE_COMMERCE_ENABLED.',action:releaseEnabled?undefined:'Complete the Connect and webhook checks, then set STRIPE_COMMERCE_ENABLED=true and deploy the service.'},
  ];
  if(keyMatches){
    const stripe=commerceStripe(),destination=new URL('/api/commerce/webhook',origin).href;
    const [eligibility,webhooks]=await Promise.allSettled([
      stripe.v2.core.accounts.list({limit:1}),
      stripe.webhookEndpoints.list({limit:100}),
    ]);
    if(eligibility.status==='fulfilled')checks.push({id:'connect-access',label:'Stripe Connect account access',status:'ready',detail:'Stripe accepted a read-only Accounts v2 request. Individual sellers must still complete their own onboarding.'});
    else{
      const error=eligibility.reason&&typeof eligibility.reason==='object'?eligibility.reason as {code?:string;raw?:{code?:string}}:{};
      const registrationRequired=['platform_registration_required','non_connect_platform_accounts_v2_access_blocked'].includes(error.code||error.raw?.code||'');
      checks.push({id:'connect-access',label:'Stripe Connect account access',status:'blocked',detail:registrationRequired?'Stripe requires this platform to enable Connect before sellers can connect.':'Stripe Connect Accounts v2 access could not be verified.',action:registrationRequired?'Open Stripe Connect and complete the platform setup. Account activation for FiveGen subscriptions does not enable seller Connect automatically.':'Check the server key’s Connect permissions and Accounts v2 availability, then run these checks again.',href:'https://dashboard.stripe.com/connect/overview'});
    }
    if(webhooks.status==='fulfilled'){
      const endpoints=webhooks.value.data.filter(row=>row.url===destination&&row.status==='enabled');
      const endpoint=endpoints.find(row=>row.application&&commerceEvents.every(event=>new Set<string>(row.enabled_events).has('*')||new Set<string>(row.enabled_events).has(event)))||endpoints.find(row=>row.application)||endpoints[0];
      const received=new Set<string>(endpoint?.enabled_events??[]),missing=commerceEvents.filter(event=>endpoint&&!received.has('*')&&!received.has(event));
      checks.push({id:'webhook',label:'Seller delivery webhook events',status:endpoint&&!missing.length?'ready':'blocked',detail:endpoint?missing.length?`The enabled seller destination is missing ${missing.length} required event types.`:'An enabled destination matches this site and includes the required sale, refund, dispute and account events.':'No enabled seller webhook destination matches this site.',action:endpoint&&!missing.length?undefined:`Configure ${destination} for: ${commerceEvents.join(', ')}. Preserve existing destinations and their signing secrets.`,href:'https://dashboard.stripe.com/webhooks'});
      checks.push({id:'webhook-scope',label:'Connected accounts event scope',status:endpoint?.application?'ready':'blocked',detail:endpoint?.application?'The seller destination is associated with a Stripe Connect application and receives connected-account events.':'A Connected accounts destination could not be verified for this site.',action:endpoint?.application?'Verify a signed delivery before enabling sales.':`Open ${destination} in Stripe and select events from Connected accounts, not only Your account. Preserve the existing destination and use its matching signing secret.`,href:'https://dashboard.stripe.com/webhooks'});
      if(webhooks.value.has_more&&!endpoint)checks.push({id:'webhook-pagination',label:'Additional seller webhook destinations',status:'warning',detail:'Stripe has more than 100 destinations. Verify the matching destination in the dashboard.'});
    }else checks.push({id:'webhook',label:'Seller delivery webhook events',status:'blocked',detail:'Seller webhook configuration could not be read.',action:'Grant webhook endpoint read access, then verify the existing seller destination in Stripe.',href:'https://dashboard.stripe.com/webhooks'});
  }
  return {mode,enabled:keyMatches&&secretPresent&&releaseEnabled,readyToEnable:checks.every(check=>check.id==='switch'||check.status!=='blocked'),checkedAt:Date.now(),checks};
}
