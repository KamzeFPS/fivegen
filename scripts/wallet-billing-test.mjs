import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import Stripe from 'stripe';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {createStorage} from '../runtime/render/storage.mjs';
import {monthlyWindow,creditPacks} from '../lib/credit-policy.ts';
import {subscriptionPlans} from '../lib/subscriptions.ts';

const root=resolve('outputs/wallet-billing-qa',randomUUID()),storage=createStorage(root),db=storage.DB,sql=storage.sqlite;
let environment='production',enabled=true;
const sessions=new Map(),invoices=new Map(),subscriptions=new Map(),intents=new Map(),charges=new Map(),lineItems=new Map(),invoiceLines=new Map();
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const sdk={
  accounts:{retrieve:async()=>({charges_enabled:true})},
  customers:{create:async({email})=>({id:'cus_'+email.split('@')[0]})},
  checkout:{sessions:{retrieve:async id=>structuredClone(sessions.get(id)),listLineItems:async id=>({data:lineItems.get(id),has_more:false}),expire:async id=>{sessions.get(id).status='expired';},create:async(params,options)=>{
    const id='cs_live_'+options.idempotencyKey.split(':')[1].replaceAll('-','');
    if(!sessions.has(id))sessions.set(id,{id,client_secret:'secret_fixture',metadata:params.metadata,status:'open',client_reference_id:params.client_reference_id});return sessions.get(id);
  }}},
  subscriptions:{retrieve:async id=>structuredClone(subscriptions.get(id))},
  invoices:{retrieve:async id=>structuredClone(invoices.get(id)),listLineItems:async id=>({data:invoiceLines.get(id),has_more:false})},
  paymentIntents:{retrieve:async id=>{const pi=structuredClone(intents.get(id));pi.latest_charge=structuredClone(charges.get(pi.charge));return pi;}},
  charges:{retrieve:async id=>structuredClone(charges.get(id))},
  disputes:{list:async({charge})=>({data:charges.get(charge).disputed?[{status:charges.get(charge).disputeStatus||'lost'}]:[]})},
  billingPortal:{sessions:{create:async options=>({url:'https://billing.stripe.com/test',...options})}},
};
const deps={ApiError,database:()=>db,binding:k=>k==='STRIPE_WALLET_PORTAL_CONFIGURATION'?'bpc_fixture':'',monthlyWindow,creditPacks,subscriptionPlans,walletEnvironment:()=>environment,walletStripe:()=>sdk,walletObjectId:o=>typeof o==='string'?o:o?.id??null,assertWalletCheckout:()=>{if(!enabled)throw new ApiError('disabled',503);return {environment,enabled:true};}};
async function load(path){const key='qa'+randomUUID().replaceAll('-','');globalThis[key]={...deps};const source=fs.readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;const result=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete globalThis[key];return result;}
Object.assign(deps,await load('lib/wallet-catalog.ts'),await load('lib/subscription-credits.ts'));
const billing=await load('lib/wallet-billing.ts');
const now=Date.now(),owner='wallet-fixture';
function fixture(id,{mode=environment,interval=null,credits=1000,amount=1500,wallet='apple_pay',status='active'}={}){
  const customer='cus_'+id,session='cs_'+(mode==='production'?'live':'test')+'_'+id,pi='pi_'+id,charge='ch_'+id,sub=interval?'sub_'+id:null,invoice=interval?'in_'+id:null;
  const start=now-10000,endDate=new Date(start);endDate.setUTCMonth(endDate.getUTCMonth()+(interval==='year'?12:1));const end=endDate.getTime();
  sql.prepare('INSERT INTO wallet_customers VALUES (?,?,?,?)').run(mode+':'+id,owner,mode,customer);
  sql.prepare('INSERT INTO wallet_checkout_intents (id,owner,environment,offer_id,email,amount,credits,billing_interval,session_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,owner,mode,interval?'subscription:pro:'+interval:'pack:starter','qa@example.test',amount,credits,interval,session,'fixture',now);
  const metadata={purpose:'fivegen_wallet',fivegen_intent:id};
  sessions.set(session,{id:session,metadata,client_reference_id:id,customer,mode:interval?'subscription':'payment',status:'complete',payment_status:'paid',currency:'usd',amount_subtotal:amount,amount_total:amount,total_details:{amount_discount:0},payment_intent:pi,subscription:sub,invoice,livemode:mode==='production'});
  lineItems.set(session,[{quantity:1,price:{unit_amount:amount,currency:'usd',recurring:interval?{interval}:null}}]);
  charges.set(charge,{id:charge,livemode:mode==='production',payment_intent:pi,amount,amount_refunded:0,status:'succeeded',disputed:false,payment_method_details:{card:{wallet:{type:wallet}}}});
  intents.set(pi,{id:pi,livemode:mode==='production',status:'succeeded',currency:'usd',amount_received:amount,charge});
  if(interval){
    subscriptions.set(sub,{id:sub,metadata,livemode:mode==='production',customer,status,cancel_at:null,cancel_at_period_end:false,items:{data:[{quantity:1,price:{unit_amount:amount,currency:'usd',recurring:{interval}},current_period_end:end/1000}]}});
    invoices.set(invoice,{id:invoice,livemode:mode==='production',parent:{subscription_details:{subscription:sub}},status:'paid',currency:'usd',amount_paid:amount,amount_remaining:0,payments:{data:[{status:'paid',payment:{payment_intent:pi}}]}});
    invoiceLines.set(invoice,[{quantity:1,amount,period:{start:start/1000,end:end/1000}}]);
  }
  return {id,customer,session,pi,charge,sub,invoice,start,end};
}
// Give each fixture an owner so server-side customer resolution is unambiguous.
function selectOwner(f){sql.prepare('UPDATE wallet_checkout_intents SET owner=? WHERE id=?').run(f.id,f.id);sql.prepare('UPDATE wallet_customers SET owner=? WHERE customer_id=?').run(f.id,f.customer);}
const balance=id=>sql.prepare('SELECT purchased FROM wallets WHERE owner=?').get(id)?.purchased??0;
try {
  const pack=fixture('pack');selectOwner(pack);
  await Promise.all(Array.from({length:8},()=>billing.fulfillWalletSession(pack.session)));
  assert.equal(balance(pack.id),1000,'Concurrent webhook and welcome callbacks grant exactly once');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_payments WHERE intent_id=?').get(pack.id).n,1);
  charges.get(pack.charge).amount_refunded=750;
  await Promise.all([billing.recordWalletCharge(pack.charge),billing.recordWalletCharge(pack.charge)]);
  assert.equal(balance(pack.id),500,'Partial refund reverses proportional credits once');
  sql.prepare('UPDATE wallets SET purchased=100 WHERE owner=?').run(pack.id);
  charges.get(pack.charge).disputed=true;
  await billing.recordWalletCharge(pack.charge);
  assert.equal(balance(pack.id),-400,'Spent refunded credits remain debt');
  charges.get(pack.charge).disputeStatus='won';
  await billing.recordWalletCharge(pack.charge);assert.equal(balance(pack.id),100,'Won dispute restores only the disputed amount, retaining the refund');

  const early=fixture('early');selectOwner(early);charges.get(early.charge).amount_refunded=1500;
  await billing.recordWalletCharge(early.charge);await billing.fulfillWalletSession(early.session);
  assert.equal(balance(early.id),0,'Refund delivered before completion cannot grant spendable credits');

  const unpaid=fixture('unpaid');selectOwner(unpaid);sessions.get(unpaid.session).payment_status='unpaid';
  await billing.fulfillWalletSession(unpaid.session);assert.equal(balance(unpaid.id),0);
  const bad=fixture('bad');selectOwner(bad);sessions.get(bad.session).customer='cus_attacker';
  await assert.rejects(()=>billing.fulfillWalletSession(bad.session),/identity/);sessions.get(bad.session).customer=bad.customer;
  lineItems.get(bad.session)[0].quantity=2;await assert.rejects(()=>billing.fulfillWalletSession(bad.session),/offer/);lineItems.get(bad.session)[0].quantity=1;
  sessions.get(bad.session).amount_subtotal=1;await assert.rejects(()=>billing.fulfillWalletSession(bad.session),/offer/);sessions.get(bad.session).amount_subtotal=1500;
  intents.get(bad.pi).amount_received=1;await assert.rejects(()=>billing.fulfillWalletSession(bad.session),/settled/);assert.equal(balance(bad.id),0);

  const annual=fixture('annual',{interval:'year',credits:2500,amount:29000,wallet:'google_pay'});selectOwner(annual);
  delete charges.get(annual.charge).payment_method_details.card.wallet;
  await billing.fulfillWalletInvoice(annual.invoice);await billing.fulfillWalletSession(annual.session);
  assert.equal((await deps.subscriptionCreditBalance(annual.id)).included,2500,'Annual billing grants one monthly allowance');
  assert.equal(balance(annual.id),0,'Subscription credits never duplicate into purchased balance');
  const second=monthlyWindow(annual.start,annual.end,new Date(new Date(now).setUTCMonth(new Date(now).getUTCMonth()+1)).getTime());
  assert.equal((await deps.subscriptionCreditBalance(annual.id,'production',second.start+1)).included,2500);
  assert.equal((await deps.subscriptionCreditBalance(annual.id,'production',annual.end+1)).included,0);
  subscriptions.get(annual.sub).cancel_at_period_end=true;await billing.syncWalletSubscription(annual.sub);
  assert.equal((await deps.subscriptionCreditBalance(annual.id)).included,2500,'Scheduled cancellation does not revoke paid access');
  for(const status of ['past_due','paused','canceled']){subscriptions.get(annual.sub).status=status;await billing.syncWalletSubscription(annual.sub);assert.equal((await deps.subscriptionCreditBalance(annual.id)).included,0,status);}
  subscriptions.get(annual.sub).status='active';await billing.syncWalletSubscription(annual.sub);
  sql.prepare('UPDATE subscription_credit_grants SET remaining=remaining-2000 WHERE owner=? AND starts_at<=? AND expires_at>?').run(annual.id,now,now);
  charges.get(annual.charge).amount_refunded=29000;await billing.recordWalletCharge(annual.charge);
  assert.equal((await deps.subscriptionCreditBalance(annual.id)).included,-2000,'Subscription refund preserves spent-credit debt');

  environment='sandbox';const test=fixture('sandbox');selectOwner(test);await billing.fulfillWalletSession(test.session);
  assert.equal(balance(test.id),0);assert.equal(sql.prepare('SELECT credits FROM wallet_test_balances WHERE owner=?').get(test.id).credits,1000,'Test payment isolated from production wallet');
  environment='production';await assert.rejects(()=>billing.fulfillWalletSession(test.session));
  enabled=false;await assert.rejects(()=>billing.createWalletCheckout('new','new@example.test','pack:starter','https://example.test'),e=>e.status===503);enabled=true;
  await assert.rejects(()=>billing.createWalletCheckout('new','new@example.test','pack:free-forged','https://example.test'),e=>e.status===400);
  const concurrent=await Promise.all(Array.from({length:6},()=>billing.createWalletCheckout('new','new@example.test','pack:starter','https://example.test')));
  assert.equal(new Set(concurrent.map(s=>s.sessionId)).size,1,'Concurrent tabs reuse one pending checkout');
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM wallet_checkout_intents WHERE owner='new' AND status='open'").get().n,1);
  await billing.closeWalletCheckout('new',concurrent[0].sessionId);
  const changed=await billing.createWalletCheckout('new','new@example.test','pack:studio','https://example.test');
  assert.notEqual(changed.sessionId,concurrent[0].sessionId,'Changing the selection expires the old session and starts a new intent');
  await assert.rejects(()=>billing.createWalletCheckout(annual.id,'qa@example.test','subscription:pro:month','https://example.test'),e=>e.status===409);
  await assert.rejects(()=>billing.closeWalletCheckout('attacker',pack.session),e=>e.status===404);
  await assert.rejects(()=>billing.walletPortal('attacker','https://example.test'),e=>e.status===404);
  assert.equal((await billing.walletPortal(pack.id,'https://example.test')).url,'https://billing.stripe.com/test');

  const sdkReal=new Stripe('sk_test_fixture'),secret='whsec_fixture',payload=JSON.stringify({id:'evt_fixture',object:'event',type:'unused.test',livemode:false,data:{object:{}}});
  const signature=sdkReal.webhooks.generateTestHeaderString({payload,secret});
  assert.equal((await sdkReal.webhooks.constructEventAsync(payload,signature,secret)).id,'evt_fixture');
  await assert.rejects(()=>sdkReal.webhooks.constructEventAsync(payload+' ',signature,secret));
  const route=fs.readFileSync('app/api/webhooks/wallet/route.ts','utf8');assert.match(route,/await req.text\(\)/);assert.match(route,/constructEventAsync/);assert.doesNotMatch(route,/JSON\.parse/);
  const ui=fs.readFileSync('app/checkout/wallet-checkout.tsx','utf8');assert.match(ui,/ExpressCheckoutElement/);assert.doesNotMatch(ui,/<PaymentElement|initializePaddle/);for(const name of ['link','amazonPay','paypal','klarna'])assert.match(ui,new RegExp(name+":'never'"));
  assert.match(fs.readFileSync('app/api/paddle/checkout/route.ts','utf8'),/status:410/);
  console.log('Passed: wallet-only checkout, owner/amount/quantity validation, paid-state checks, exact-once credit delivery, refund ordering, disputes/debt, monthly annual grants, cancellation/status, test isolation, portal ownership, actual SDK signature verification and Paddle retirement.');
  console.log('Permanent QA records retained: '+root);
}finally{storage.close();}
