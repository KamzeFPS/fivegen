import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import Stripe from 'stripe';
const source=readFileSync('lib/commerce-fees.ts','utf8').replace(/^import[^\n]*\n/gm,'');
const {COMMERCE_COMMISSION_BPS,commerceCommission,commerceFeeSnapshot}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
assert.equal(COMMERCE_COMMISSION_BPS,500);
for(const [gross,fee] of [[50,3],[100,5],[1000,50],[1999,100],[4900,245],[999900,49995]])assert.equal(commerceCommission(gross),fee);
assert.equal(commerceCommission(Number.MAX_SAFE_INTEGER),450359962737050,'Rounding stays exact at safe integer limits');
for(const invalid of [-1,1.5,NaN,Infinity])assert.throws(()=>commerceCommission(invalid));
for(const rate of [-1,10001,1.5])assert.throws(()=>commerceCommission(100,rate));
const charge={id:'ch_fixture',currency:'usd',amount:100,amount_refunded:0,disputed:false,application_fee_amount:5,balance_transaction:{id:'txn_fixture',source:'ch_fixture',currency:'usd',amount:100,fee:39,net:61,status:'pending',available_on:1792972800,fee_details:[{amount:34,currency:'usd',type:'stripe_fee'},{amount:5,currency:'usd',type:'application_fee'}]}};
let actual=commerceFeeSnapshot(charge,5);assert.equal(actual.platformFeeAmount,5);assert.equal(actual.stripeFeeAmount,34);assert.equal(actual.creatorNetAmount,61);assert.equal(actual.settlementCurrency,'usd');assert.equal(actual.availableAt,1792972800000);assert.equal(actual.availability,'pending');
charge.balance_transaction.status='available';assert.equal(commerceFeeSnapshot(charge,5).availability,'available');
const fx=structuredClone(charge);Object.assign(fx.balance_transaction,{currency:'eur',amount:91,fee:36,net:55,fee_details:[{amount:31,currency:'eur',type:'stripe_fee'},{amount:5,currency:'eur',type:'application_fee'}]});actual=commerceFeeSnapshot(fx,5);assert.equal(actual.chargeApplicationFeeAmount,5);assert.equal(actual.settlementAmount,91);assert.equal(actual.creatorNetAmount,55);assert.equal(actual.settlementCurrency,'eur','No mixing order USD and actual settlement EUR');
const legacy=structuredClone(charge);legacy.application_fee_amount=null;Object.assign(legacy.balance_transaction,{fee:34,net:66,fee_details:[{amount:34,currency:'usd',type:'stripe_fee'}]});actual=commerceFeeSnapshot(legacy,0);assert.equal(actual.platformFeeAmount,0);assert.equal(actual.creatorNetAmount,66,'Legacy purchase is never retrocharged');
const delayed=structuredClone(legacy);actual=commerceFeeSnapshot(delayed,5);assert.equal(actual.creatorNetAmount,null,'Asynchronously created application fees stay pending instead of overstating creator net');assert.equal(actual.chargeApplicationFeeAmount,5);
actual=commerceFeeSnapshot({...charge,balance_transaction:'txn_not_expanded'},5);assert.equal(actual.stripeFeeAmount,null);assert.equal(actual.creatorNetAmount,null);
actual=commerceFeeSnapshot({...charge,amount_refunded:100,disputed:true},5);assert.equal(actual.refundedAmount,100);assert.equal(actual.disputed,true,'Retain original sale accounting while reporting adjustments separately');
for(const modify of [
 c=>{c.balance_transaction.net=100;},c=>{c.balance_transaction.source='ch_other';},c=>{c.balance_transaction.fee_details[0].currency='eur';},c=>{c.balance_transaction.fee_details[0].amount=35;},c=>{c.balance_transaction.fee_details[1].amount=6;c.balance_transaction.fee=40;c.balance_transaction.net=60;},
]){const invalid=structuredClone(charge);modify(invalid);assert.throws(()=>commerceFeeSnapshot(invalid,5));}
// Exercise the actual Stripe SDK's Checkout serialization while intercepting
// transport completely. No request reaches Stripe and no financial object exists.
let serialized;
const sdk=new Stripe('rk_test_fixture_only',{httpClient:Stripe.createFetchHttpClient(async(url,init)=>{
 serialized={url:String(url),method:init.method,headers:new Headers(init.headers),body:new URLSearchParams(String(init.body))};
 return new Response(JSON.stringify({id:'cs_fixture',object:'checkout.session',url:'https://checkout.stripe.test/fixture'}),{status:200,headers:{'content-type':'application/json'}});
})});
await sdk.checkout.sessions.create({mode:'payment',customer_email:'buyer@example.test',payment_intent_data:{application_fee_amount:commerceCommission(100),metadata:{fivegen_order:'fixture'}},line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:100,product_data:{name:'Fixture product'}}}],success_url:'https://fivegen.test/customer'},{stripeAccount:'acct_fixture',idempotencyKey:'fivegen-fixture'});
assert.equal(serialized.method,'POST');assert.equal(new URL(serialized.url).pathname,'/v1/checkout/sessions');assert.equal(serialized.headers.get('stripe-account'),'acct_fixture');assert.equal(serialized.headers.get('idempotency-key'),'fivegen-fixture');assert.equal(serialized.body.get('payment_intent_data[application_fee_amount]'),'5');assert.equal(serialized.body.get('line_items[0][price_data][unit_amount]'),'100');
console.log('Passed: 5% minor-unit rounding, actual Stripe/platform/net split without double subtraction, zero legacy commission, FX settlement isolation, delayed fees, availability, refund/dispute flags and rejected mismatched balance accounting. No external calls.');
