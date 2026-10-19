import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import Stripe from 'stripe';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {createStorage} from '../runtime/render/storage.mjs';
import {monthlyWindow,creditPacks} from '../lib/credit-policy.ts';
import {creatorSubscriptionPlans,subscriptionPlans} from '../lib/subscriptions.ts';
import {creatorPlans,freeCreatorPlan} from '../lib/creator-plans.ts';

const root=resolve('outputs/wallet-billing-qa',randomUUID()),storage=createStorage(root),db=storage.DB,sql=storage.sqlite;
let environment='production',enabled=true,chargesEnabled=true;
const sessions=new Map(),invoices=new Map(),subscriptions=new Map(),intents=new Map(),charges=new Map(),lineItems=new Map(),invoiceLines=new Map();let lastCheckoutParams=null,lastCheckoutOptions=null,expireCalls=[];const expireCompletes=new Set();
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const sdk={
  accounts:{retrieve:async()=>({charges_enabled:chargesEnabled})},
  customers:{create:async({email})=>({id:'cus_'+email.split('@')[0]})},
  checkout:{sessions:{retrieve:async id=>structuredClone(sessions.get(id)),listLineItems:async id=>({data:lineItems.get(id),has_more:false}),expire:async id=>{expireCalls.push(id);if(expireCompletes.has(id)){sessions.get(id).status='complete';throw new Error('Checkout completed before expiry');}sessions.get(id).status='expired';return structuredClone(sessions.get(id));},create:async(params,options)=>{
    // Match Stripe accounts where Managed Payments is enabled by default.
    if((params.managed_payments?.enabled??true)&&(params.payment_method_types||params.adaptive_pricing?.enabled===false||params.invoice_creation))throw new Error('Unsupported Checkout settings when Managed Payments is enabled');
    const id='cs_live_'+options.idempotencyKey.split(':').at(-1).replaceAll('-','');
    lastCheckoutParams=structuredClone(params);lastCheckoutOptions=structuredClone(options);if(!sessions.has(id))sessions.set(id,{id,client_secret:'secret_fixture',metadata:params.metadata,status:'open',client_reference_id:params.client_reference_id,ui_mode:params.ui_mode,managed_payments:params.managed_payments,adaptive_pricing:params.adaptive_pricing,payment_method_types:params.payment_method_types});return sessions.get(id);
  }}},
  subscriptions:{retrieve:async id=>structuredClone(subscriptions.get(id))},
  invoices:{retrieve:async id=>structuredClone(invoices.get(id)),listLineItems:async id=>({data:invoiceLines.get(id),has_more:false})},
  paymentIntents:{retrieve:async id=>{const pi=structuredClone(intents.get(id));pi.latest_charge=structuredClone(charges.get(pi.charge));return pi;}},
  charges:{retrieve:async id=>structuredClone(charges.get(id))},
  disputes:{list:async({charge})=>({data:charges.get(charge).disputed?[{status:charges.get(charge).disputeStatus||'lost'}]:[]})},
  billingPortal:{sessions:{create:async options=>({url:'https://billing.stripe.com/test',...options})}},
};
const deps={ApiError,database:()=>db,binding:k=>k==='STRIPE_WALLET_PORTAL_CONFIGURATION'?'bpc_fixture':'',monthlyWindow,creditPacks,creatorSubscriptionPlans,subscriptionPlans,creatorPlans,freeCreatorPlan,walletEnvironment:()=>environment,walletStripe:()=>sdk,walletObjectId:o=>typeof o==='string'?o:o?.id??null,assertWalletCheckout:()=>{if(!enabled)throw new ApiError('disabled',503);return {environment,enabled:true};}};
async function load(path){const key='qa'+randomUUID().replaceAll('-','');globalThis[key]={...deps};const source=fs.readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;const result=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete globalThis[key];return result;}
Object.assign(deps,await load('lib/wallet-catalog.ts'),await load('lib/subscription-credits.ts'));
Object.assign(deps,await load('lib/creator-plan-server.ts'));
const billing=await load('lib/wallet-billing.ts');
const now=Date.now(),owner='wallet-fixture';
function fixture(id,{mode=environment,interval=null,credits=1000,amount=1500,wallet=null,status='active',link=null,presentment=null,offerId=null}={}){
  const customer='cus_'+id,session='cs_'+(mode==='production'?'live':'test')+'_'+id,pi='pi_'+id,charge='ch_'+id,sub=interval?'sub_'+id:null,invoice=interval?'in_'+id:null;
  const start=now-10000,endDate=new Date(start);endDate.setUTCMonth(endDate.getUTCMonth()+(interval==='year'?12:1));const end=endDate.getTime();
  sql.prepare('INSERT INTO wallet_customers VALUES (?,?,?,?)').run(mode+':'+id,owner,mode,customer);
  sql.prepare('INSERT INTO wallet_checkout_intents (id,owner,environment,offer_id,email,amount,credits,billing_interval,session_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,owner,mode,offerId??(interval?'subscription:pro:'+interval:'pack:starter'),'qa@example.test',amount,credits,interval,session,'fixture',now);
  const metadata={purpose:'fivegen_wallet',fivegen_intent:id};
  sessions.set(session,{id:session,metadata,client_reference_id:id,customer,mode:interval?'subscription':'payment',status:'complete',payment_status:'paid',currency:'usd',amount_subtotal:amount,amount_total:amount,...(presentment?{presentment_details:presentment}:{}),total_details:{amount_discount:0},payment_intent:pi,subscription:sub,invoice,livemode:mode==='production'});
  lineItems.set(session,[{quantity:1,price:{unit_amount:amount,currency:'usd',recurring:interval?{interval}:null}}]);
  charges.set(charge,{id:charge,livemode:mode==='production',payment_intent:pi,customer,receipt_url:'https://pay.stripe.com/receipts/payment/'+id,currency:'usd',amount,amount_captured:amount,amount_refunded:0,status:'succeeded',paid:true,captured:true,disputed:false,...(presentment?{presentment_details:presentment}:{}),payment_method_details:link?{type:'link',link:{country:'MN',funding_source_group:link}}:{type:'card',card:{...(wallet?{wallet:{type:wallet}}:{})}}});
  intents.set(pi,{id:pi,livemode:mode==='production',status:'succeeded',customer,currency:'usd',amount,amount_received:amount,charge,...(presentment?{presentment_details:presentment}:{})});
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
  assert.equal(balance(pack.id),1000,'A standard card purchase grants credits exactly once across concurrent webhook and welcome callbacks');
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

  for(const wallet of ['apple_pay','google_pay']){
    const token=fixture(wallet,{wallet});selectOwner(token);
    await Promise.all([billing.fulfillWalletSession(token.session),billing.fulfillWalletSession(token.session)]);
    assert.equal(balance(token.id),1000,`${wallet} uses the same exact-once card fulfillment`);
  }
  for(const group of ['lfsg_000','lfsg_001','lfsg_002','lfsg_003']){
    const link=fixture('link-'+group,{link:group});selectOwner(link);
    await Promise.all([billing.fulfillWalletSession(link.session),billing.fulfillWalletSession(link.session)]);
    assert.equal(balance(link.id),1000,'Fully settled Link funds credits once, regardless of its Stripe-supported funding group');
  }
  const mnt={presentment_currency:'mnt',presentment_amount:5600000};
  const local=fixture('mnt-pack',{presentment:mnt,link:'lfsg_000'});selectOwner(local);
  await Promise.all(Array.from({length:4},()=>billing.fulfillWalletSession(local.session)));
  assert.equal(balance(local.id),1000,'MNT presentment preserves the verified USD integration amount and delivers once');
  assert.equal(sql.prepare('SELECT amount FROM wallet_payments WHERE intent_id=?').get(local.id).amount,1500,'Persist USD integration units, never the localized total');
  charges.get(local.charge).amount_refunded=750;await billing.recordWalletCharge(local.charge);
  assert.equal(balance(local.id),500,'An MNT-presented refund reverses credits using the USD charge ratio');
  charges.get(local.charge).amount_refunded=1500;await billing.recordWalletCharge(local.charge);await billing.fulfillWalletSession(local.session);
  assert.equal(balance(local.id),0,'A refunded local-currency payment cannot grant credits on replay');

  const tampered=fixture('mnt-tampered',{presentment:mnt,link:'lfsg_000'});selectOwner(tampered);
  for(const [map,key,field,value,pattern] of [
    [sessions,tampered.session,'currency','mnt',/offer/],
    [intents,tampered.pi,'currency','mnt',/settled/],
    [intents,tampered.pi,'amount_received',mnt.presentment_amount,/settled/],
    [intents,tampered.pi,'amount',1,/settled/],
    [charges,tampered.charge,'currency','mnt',/settled/],
    [charges,tampered.charge,'amount',1,/settled/],
    [charges,tampered.charge,'amount_captured',1,/settled/],
    [charges,tampered.charge,'paid',false,/settled/],
    [charges,tampered.charge,'captured',false,/settled/],
    [charges,tampered.charge,'status','pending',/settled/],
    [charges,tampered.charge,'payment_intent','pi_other',/identity/],
    [charges,tampered.charge,'customer','cus_other',/identity/],
    [intents,tampered.pi,'customer','cus_other',/identity/],
    [charges,tampered.charge,'payment_method_details',{type:'us_bank_account',us_bank_account:{}},/payment method/],
  ]){
    const object=map.get(key),original=object[field];object[field]=value;
    await assert.rejects(()=>billing.fulfillWalletSession(tampered.session),pattern,`${field} cannot bypass verified settlement through MNT presentment or Link`);
    object[field]=original;assert.equal(balance(tampered.id),0);
  }
  const localSub=fixture('mnt-monthly',{interval:'month',credits:2500,amount:2900,presentment:{...mnt,presentment_amount:10800000},link:'lfsg_000'});selectOwner(localSub);
  subscriptions.get(localSub.sub).presentment_details={presentment_currency:'mnt'};
  await Promise.all([billing.fulfillWalletInvoice(localSub.invoice),billing.fulfillWalletSession(localSub.session)]);
  assert.equal((await deps.subscriptionCreditBalance(localSub.id)).included,2500,'A localized monthly subscription still verifies the exact USD invoice and allowance');
  assert.equal((await billing.walletAccount(localSub.id)).creatorPlan.commissionPercent,3,'Only the verified paid Pro period grants the 3% selling rate');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_payments WHERE intent_id=?').get(localSub.id).n,1,'Invoice and checkout events cannot duplicate a localized subscription grant');
  invoices.get(localSub.invoice).currency='mnt';
  await assert.rejects(()=>billing.fulfillWalletInvoice(localSub.invoice),/allowance/,'Local presentment does not authorize an unverified MNT invoice');
  invoices.get(localSub.invoice).currency='usd';

  const scale=fixture('scale-monthly',{interval:'month',credits:6000,amount:9900,offerId:'subscription:scale:month'});selectOwner(scale);
  await Promise.all([billing.fulfillWalletInvoice(scale.invoice),billing.fulfillWalletSession(scale.session)]);
  assert.equal((await deps.subscriptionCreditBalance(scale.id)).included,6000,'Scale grants its verified 6,000-credit monthly allowance exactly once');
  assert.equal((await billing.walletAccount(scale.id)).payments[0].name,'Scale');
  assert.equal((await billing.walletAccount(scale.id)).creatorPlan.commissionPercent,0,'A paid Scale invoice activates the 0% selling rate');
  charges.get(scale.charge).amount_refunded=9900;await billing.recordWalletCharge(scale.charge);
  assert.equal((await deps.subscriptionCreditBalance(scale.id)).included,0,'A full Scale refund reverses its full included allowance');
  assert.equal((await billing.walletAccount(scale.id)).creatorPlan.id,'free','Reversing the full subscription payment revokes its paid commission benefit');

  const legacyStudio=fixture('legacy-studio-year',{interval:'year',credits:6000,amount:69000,offerId:'subscription:studio:year'});selectOwner(legacyStudio);
  await billing.fulfillWalletSession(legacyStudio.session);
  assert.equal((await deps.subscriptionCreditBalance(legacyStudio.id)).included,6000,'An existing Studio annual invoice keeps its frozen allowance and price');
  assert.equal((await billing.walletAccount(legacyStudio.id)).payments[0].name,'Studio','Legacy billing history remains recognizable');
  assert.equal((await billing.walletAccount(legacyStudio.id)).creatorPlan.id,'legacy-studio','Existing paid Studio invoices retain their known legacy tier');

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
  for(const retired of ['subscription:pro:year','subscription:studio:month','subscription:studio:year','subscription:scale:year']){
    await assert.rejects(()=>billing.createWalletCheckout('retired-new-'+retired,'qa@example.test',retired,'https://example.test'),e=>e.status===400,'Retired and unapproved annual offers cannot start a new purchase');
  }
  const concurrent=await Promise.all(Array.from({length:6},()=>billing.createWalletCheckout('new','new@example.test','pack:starter','https://example.test')));
  assert.equal(new Set(concurrent.map(s=>s.sessionId)).size,1,'Concurrent tabs reuse one pending checkout');
  assert.deepEqual(lastCheckoutParams.managed_payments,{enabled:false},'Direct wallet checkout overrides the account Managed Payments default');
  assert.deepEqual(lastCheckoutParams.payment_method_types,['card','link']);
  assert.deepEqual(lastCheckoutParams.adaptive_pricing,{enabled:true},'Stripe can present a local currency while the integration price stays USD');
  assert.match(lastCheckoutOptions.idempotencyKey,/^fivegen-wallet-checkout:v4-adaptive:/,'A fresh key version bypasses cached Stripe errors from the old payload');
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM wallet_checkout_intents WHERE owner='new' AND status='open'").get().n,1);
  await billing.closeWalletCheckout('new',concurrent[0].sessionId);
  const changed=await billing.createWalletCheckout('new','new@example.test','pack:studio','https://example.test');
  assert.notEqual(changed.sessionId,concurrent[0].sessionId,'Changing the selection expires the old session and starts a new intent');
  for(const [variant,oldConfig] of [
    ['card-only',{payment_method_types:['card'],adaptive_pricing:{enabled:false}}],
    ['managed',{managed_payments:{enabled:true}}],
    ['hosted',{ui_mode:'hosted_page'}],
  ]){
    const upgradeOwner='upgrade-'+variant,email=upgradeOwner+'@example.test';
    const old=await billing.createWalletCheckout(upgradeOwner,email,'pack:starter','https://example.test');
    Object.assign(sessions.get(old.sessionId),oldConfig);
    const upgraded=await Promise.all(Array.from({length:4},()=>billing.createWalletCheckout(upgradeOwner,email,'pack:starter','https://example.test')));
    assert.equal(new Set(upgraded.map(s=>s.sessionId)).size,1,'Concurrent reloads upgrade to the same new session');
    assert.notEqual(upgraded[0].sessionId,old.sessionId,'An incompatible open session is replaced to enable express and currency selection');
    assert.equal(sessions.get(old.sessionId).status,'expired');
    assert.equal(sql.prepare('SELECT status FROM wallet_checkout_intents WHERE session_id=?').get(old.sessionId).status,'expired');
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM wallet_checkout_intents WHERE owner=? AND status='open'").get(upgradeOwner).n,1);
  }
  for(const duringExpiry of [false,true]){
    const completed=fixture('complete-upgrade-'+duringExpiry);selectOwner(completed);
    sql.prepare("UPDATE wallet_checkout_intents SET status='open' WHERE id=?").run(completed.id);
    if(duringExpiry){sessions.get(completed.session).status='open';expireCompletes.add(completed.session);}
    const expirations=expireCalls.length;
    await assert.rejects(()=>billing.createWalletCheckout(completed.id,'qa@example.test','pack:starter','https://example.test'),e=>e.status===409);
    assert.equal(balance(completed.id),1000,'A completed purchase is delivered instead of being replaced');
    assert.equal(sql.prepare('SELECT status FROM wallet_checkout_intents WHERE id=?').get(completed.id).status,'complete');
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_checkout_intents WHERE owner=?').get(completed.id).n,1,'A completion race cannot start a duplicate purchase');
    assert.equal(expireCalls.length,expirations+(duringExpiry?1:0),'Never try to expire a session already known to be complete');
  }
  for(const interval of ['month','year']){
    const retryOwner='failed-subscription-'+interval,email=retryOwner+'@example.test',intentId=randomUUID(),offerId='subscription:pro:'+interval,amount=interval==='month'?2900:29000;
    sql.prepare('INSERT INTO wallet_checkout_intents (id,owner,environment,offer_id,email,amount,credits,billing_interval,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(intentId,retryOwner,'production',offerId,email,amount,2500,interval,now);
    const recovered=await billing.createWalletCheckout(retryOwner,email,offerId,'https://example.test');
    assert.equal(lastCheckoutOptions.idempotencyKey,'fivegen-wallet-checkout:v4-adaptive:'+intentId,'Recover a session-less failed checkout with a fresh, deterministic Stripe key');
    assert.equal(lastCheckoutParams.client_reference_id,intentId);
    assert.deepEqual(lastCheckoutParams.managed_payments,{enabled:false});
    assert.deepEqual(lastCheckoutParams.adaptive_pricing,{enabled:true});
    assert.deepEqual(lastCheckoutParams.payment_method_types,['card','link']);
    assert.equal(lastCheckoutParams.ui_mode,'elements');assert.equal(lastCheckoutParams.mode,'subscription');
    assert.equal(lastCheckoutParams.line_items[0].price_data.currency,'usd');assert.equal(lastCheckoutParams.line_items[0].price_data.unit_amount,amount);
    assert.deepEqual(lastCheckoutParams.line_items[0].price_data.recurring,{interval});
    assert.ok(lastCheckoutParams.subscription_data);assert.equal(lastCheckoutParams.payment_intent_data,undefined);assert.equal(lastCheckoutParams.invoice_creation,undefined);
    assert.equal((await billing.createWalletCheckout(retryOwner,email,offerId,'https://example.test')).sessionId,recovered.sessionId,'Reloading recovers the same session');
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_checkout_intents WHERE owner=?').get(retryOwner).n,1,'Recovery keeps the original purchase intent');
  }
  await assert.rejects(()=>billing.createWalletCheckout(annual.id,'qa@example.test','subscription:pro:month','https://example.test'),e=>e.status===409);
  await assert.rejects(()=>billing.closeWalletCheckout('attacker',pack.session),e=>e.status===404);
  await assert.rejects(()=>billing.walletPortal('attacker','https://example.test'),e=>e.status===404);
  assert.equal((await billing.walletPortal(pack.id,'https://example.test')).url,'https://billing.stripe.com/test');

  // The release flag cannot bypass account activation or permit an orphan charge.
  chargesEnabled=false;
  await assert.rejects(()=>billing.createWalletCheckout('inactive-account','new@example.test','pack:starter','https://example.test'),e=>e.status===503);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_checkout_intents WHERE owner=?').get('inactive-account').n,0);
  chargesEnabled=true;
  for(const offer of deps.walletCatalog()){
    const catalogOwner='catalog-'+offer.id,email=catalogOwner+'@example.test';
    await billing.createWalletCheckout(catalogOwner,email,offer.id,'https://example.test');
    assert.equal(lastCheckoutParams.line_items[0].price_data.unit_amount,offer.cents,'Every offer checkout uses the server catalog amount');
    assert.equal(lastCheckoutParams.line_items[0].price_data.recurring?.interval??null,offer.interval??null);
    assert.equal(sql.prepare('SELECT credits FROM wallet_checkout_intents WHERE owner=?').get(catalogOwner).credits,offer.credits);
    assert.equal(sql.prepare('SELECT checkout_name FROM wallet_checkout_intents WHERE owner=?').get(catalogOwner).checkout_name,`FiveGen ${offer.name}`,'New purchase records freeze their exact provider description');
    assert.equal(lastCheckoutParams.line_items[0].price_data.product_data.name,`FiveGen ${offer.name}`,'Pack names are not duplicated as credits credits');
  }

  // Use Stripe's actual request serializer and a local idempotency endpoint:
  // emulate the provider accepting a request before our session_id DB write.
  // Its retry must be byte-for-byte identical, including historical labels.
  const providerRequests=new Map(),providerCalls=new Map();
  const provider=createServer(async(request,response)=>{
    const parts=[];for await(const part of request)parts.push(part);
    const body=Buffer.concat(parts).toString(),key=String(request.headers['idempotency-key']),saved=providerRequests.get(key);
    providerCalls.set(key,(providerCalls.get(key)??0)+1);
    response.setHeader('Content-Type','application/json');
    if(saved&&saved!==body){response.statusCode=400;response.end(JSON.stringify({error:{type:'idempotency_error',message:'Parameters differ from the original accepted request'}}));return;}
    providerRequests.set(key,body);
    const params=new URLSearchParams(body),id='cs_live_'+params.get('client_reference_id').replaceAll('-','');
    response.end(JSON.stringify({id,object:'checkout.session',client_secret:'local_fixture',status:'open',livemode:true}));
  });
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const serializedSdk=new Stripe('sk_test_local_fixture',{host:'127.0.0.1',port:provider.address().port,protocol:'http',maxNetworkRetries:0}),mockCreate=sdk.checkout.sessions.create;
  try{
    sdk.checkout.sessions.create=(params,options)=>serializedSdk.checkout.sessions.create(params,options);
    const recoveryCases=[
      ['pack:starter',1500,1000,null,'FiveGen Starter credits',null],
      ['pack:studio',3500,2500,null,'FiveGen Pro credits',null],
      ['pack:scale',7500,6000,null,'FiveGen Advanced credits',null],
      ['subscription:pro:month',2900,2500,'month','FiveGen Pro',null],
      ['subscription:pro:year',29000,2500,'year','FiveGen Pro',null],
      ['subscription:studio:month',6900,6000,'month','FiveGen Studio',null],
      ['subscription:studio:year',69000,6000,'year','FiveGen Studio',null],
      ['subscription:scale:month',9900,6000,'month','FiveGen Scale','FiveGen Scale'],
      ['pack:starter',1500,1000,null,'FiveGen 1,000 credits','FiveGen 1,000 credits'],
    ];
    for(const [index,[offerId,amount,credits,interval,name,frozenName]] of recoveryCases.entries()){
      const recoveryOwner='orphaned-provider-'+index,email=recoveryOwner+'@example.test',intentId=randomUUID(),customer='cus_orphan_'+index,origin='https://example.test';
      sql.prepare('INSERT INTO wallet_customers VALUES(?,?,?,?)').run('production:'+recoveryOwner,recoveryOwner,'production',customer);
      sql.prepare('INSERT INTO wallet_checkout_intents(id,owner,environment,offer_id,email,amount,credits,billing_interval,checkout_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(intentId,recoveryOwner,'production',offerId,email,amount,credits,interval,frozenName,now);
      const metadata={purpose:'fivegen_wallet',fivegen_intent:intentId},key='fivegen-wallet-checkout:v4-adaptive:'+intentId;
      const original={ui_mode:'elements',mode:interval?'subscription':'payment',customer,managed_payments:{enabled:false},payment_method_types:['card','link'],allow_promotion_codes:false,adaptive_pricing:{enabled:true},line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:amount,product_data:{name,metadata:{fivegen_offer:offerId}},...(interval?{recurring:{interval}}:{})}}],metadata,client_reference_id:intentId,...(interval?{subscription_data:{metadata}}:{payment_intent_data:{metadata},invoice_creation:{enabled:true}}),return_url:`${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`};
      const accepted=await serializedSdk.checkout.sessions.create(original,{idempotencyKey:key});
      const recovered=await billing.createWalletCheckout(recoveryOwner,email,offerId,origin);
      assert.equal(recovered.sessionId,accepted.id,`${offerId} recovers the original accepted provider request after a missing session DB write`);
      assert.equal(providerCalls.get(key),2,'Recovery reused the existing provider idempotency key');
      assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_checkout_intents WHERE owner=?').get(recoveryOwner).n,1,'The retry never creates a duplicate purchase record');
    }
  }finally{sdk.checkout.sessions.create=mockCreate;await new Promise((resolve,reject)=>provider.close(error=>error?reject(error):resolve()));}

  const expiredLegacy=fixture('expired-legacy',{interval:'year',credits:6000,amount:69000,offerId:'subscription:studio:year'});selectOwner(expiredLegacy);
  sql.prepare("UPDATE wallet_checkout_intents SET status='open' WHERE id=?").run(expiredLegacy.id);
  sessions.get(expiredLegacy.session).status='expired';
  await assert.rejects(()=>billing.createWalletCheckout(expiredLegacy.id,'qa@example.test','subscription:studio:year','https://example.test'),e=>e.status===409,'An expired legacy session cannot be converted into a new retired sale');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_checkout_intents WHERE owner=?').get(expiredLegacy.id).n,1);
  const delayed=fixture('delayed-delivery');selectOwner(delayed);
  sql.prepare("UPDATE wallet_checkout_intents SET status='open' WHERE id=?").run(delayed.id);
  const unrelated=fixture('other-owner-unprocessed');selectOwner(unrelated);
  sql.prepare("UPDATE wallet_checkout_intents SET status='open' WHERE id=?").run(unrelated.id);
  const recovered=await billing.reconcileWalletAccount(delayed.id);
  assert.equal(recovered.checked,1);assert.equal(recovered.unavailable,0);
  assert.equal(balance(delayed.id),1000,'Billing recovers a paid checkout when its webhook is delayed');
  assert.equal(balance(unrelated.id),0,'Reconciliation never fulfills another account purchase');
  await billing.reconcileWalletAccount(delayed.id);assert.equal(balance(delayed.id),1000,'A refresh cannot duplicate delivery');
  const listed=(await billing.walletAccount(delayed.id)).payments;
  assert.equal(listed.length,1);assert.equal(listed[0].amount,1500);assert.equal(listed[0].name,'1,000 credits');
  assert.equal((await billing.walletAccount('attacker')).payments.length,0,'Billing history is isolated by signed-in owner');
  assert.equal((await billing.walletReceipt(delayed.id,delayed.session)).url,'https://pay.stripe.com/receipts/payment/'+delayed.id);
  await assert.rejects(()=>billing.walletReceipt('attacker',delayed.session),e=>e.status===404);
  charges.get(delayed.charge).receipt_url='https://malicious.example/receipt';
  await assert.rejects(()=>billing.walletReceipt(delayed.id,delayed.session),e=>e.status===503,'Receipt redirects only to the verified Stripe host');
  charges.get(delayed.charge).receipt_url='https://pay.stripe.com/receipts/payment/'+delayed.id;
  charges.get(delayed.charge).customer='cus_other';
  await assert.rejects(()=>billing.walletReceipt(delayed.id,delayed.session),e=>e.status===404,'Receipt customer is checked against the signed-in owner');
  charges.get(delayed.charge).customer=delayed.customer;
  environment='sandbox';await assert.rejects(()=>billing.walletReceipt(delayed.id,delayed.session),e=>e.status===404,'Receipt environment cannot cross from test to live');environment='production';
  const recoveringSub=fixture('delayed-renewal',{interval:'month',credits:2500,amount:2900});selectOwner(recoveringSub);
  await billing.fulfillWalletSession(recoveringSub.session);
  const renewalInvoice='in_renewal_recovery',renewalPi='pi_renewal_recovery',renewalCharge='ch_renewal_recovery';
  invoices.set(renewalInvoice,{...structuredClone(invoices.get(recoveringSub.invoice)),id:renewalInvoice,payments:{data:[{status:'paid',payment:{payment_intent:renewalPi}}]}});
  invoiceLines.set(renewalInvoice,structuredClone(invoiceLines.get(recoveringSub.invoice)));
  charges.set(renewalCharge,{...structuredClone(charges.get(recoveringSub.charge)),id:renewalCharge,payment_intent:renewalPi});
  intents.set(renewalPi,{...structuredClone(intents.get(recoveringSub.pi)),id:renewalPi,charge:renewalCharge});
  subscriptions.get(recoveringSub.sub).latest_invoice=renewalInvoice;
  await billing.reconcileWalletAccount(recoveringSub.id);await billing.reconcileWalletAccount(recoveringSub.id);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_payments WHERE id=?').get(renewalInvoice).n,1,'The latest paid subscription invoice is recovered and recorded exactly once');

  const sdkReal=new Stripe('sk_test_fixture'),secret='whsec_fixture',payload=JSON.stringify({id:'evt_fixture',object:'event',type:'unused.test',livemode:false,data:{object:{}}});
  const signature=sdkReal.webhooks.generateTestHeaderString({payload,secret});
  assert.equal((await sdkReal.webhooks.constructEventAsync(payload,signature,secret)).id,'evt_fixture');
  await assert.rejects(()=>sdkReal.webhooks.constructEventAsync(payload+' ',signature,secret));
  const route=fs.readFileSync('app/api/webhooks/wallet/route.ts','utf8');assert.match(route,/await req.text\(\)/);assert.match(route,/constructEventAsync/);assert.doesNotMatch(route,/JSON\.parse/);
  const ui=fs.readFileSync('app/checkout/wallet-checkout.tsx','utf8');assert.match(ui,/<PaymentElement/);assert.match(ui,/<ExpressCheckoutElement/);assert.match(ui,/<CurrencySelectorElement/);assert.doesNotMatch(ui,/initializePaddle/);
  assert.match(ui,/adaptivePricing:\s*\{allowed:true\}/,'Checkout Elements opts in to displaying local prices');
  const {cardCheckoutOptions,expressCheckoutOptions}=await load('lib/wallet-checkout-options.ts');
  assert.deepEqual(cardCheckoutOptions.wallets,{applePay:'never',googlePay:'never',link:'never'},'The card form avoids duplicate wallet buttons, with express checkout mounted separately');
  assert.deepEqual(cardCheckoutOptions.paymentMethodOrder,['card']);
  assert.equal(expressCheckoutOptions.paymentMethods.applePay,'always');assert.equal(expressCheckoutOptions.paymentMethods.googlePay,'auto');assert.equal(expressCheckoutOptions.paymentMethods.link,'auto');
  assert.equal(expressCheckoutOptions.paymentMethods.amazonPay,'never');assert.equal(expressCheckoutOptions.paymentMethods.paypal,'never');assert.equal(expressCheckoutOptions.paymentMethods.klarna,'never');
  assert.match(fs.readFileSync('app/api/paddle/checkout/route.ts','utf8'),/status:410/);
  console.log('Passed: current monthly Creator Pro/Scale checkout, retired-offer rejection, legacy annual/Studio preservation and recovery, real SDK byte-identical orphaned-checkout idempotency recovery with frozen new and legacy names, Stripe express and card checkout, Adaptive Pricing with exact USD verification, MNT presentment/refunds/subscriptions, settled Link funding groups, unsafe settlement rejection, account-default override, failed-intent recovery, incompatible-session upgrades/completion races, exact-once credit delivery, refund ordering, disputes/debt, monthly annual grants, cancellation/status, test isolation, portal ownership, SDK webhook signatures and Paddle retirement.');
  console.log('Permanent QA records retained: '+root);
}finally{storage.close();}
