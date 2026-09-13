import {Paddle,Environment} from '@paddle/paddle-node-sdk';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {subscriptionPlans} from '../lib/subscriptions.ts';
assert.equal(process.env.PADDLE_ENVIRONMENT,'sandbox');
assert.ok(process.env.PADDLE_API_KEY?.startsWith('pdl_sdbx_apikey_'));
const paddle=new Paddle(process.env.PADDLE_API_KEY,{environment:Environment.sandbox});
const products=[],prices=[];
for await(const product of paddle.products.list())products.push(product);
for await(const price of paddle.prices.list())prices.push(price);
const mapping=[];
for(const plan of subscriptionPlans){
 let product=products.find(p=>p.status==='active'&&p.customData?.fivegen_subscription_plan===plan.id);
 if(!product){product=await paddle.products.create({name:`FiveGen ${plan.name}`,description:`Private AI digital-product creation studio. ${plan.credits} AI credits refresh monthly.`,taxCategory:'saas',customData:{fivegen_subscription_plan:plan.id,credits_per_month:plan.credits}});products.push(product);}
 if(product.customData?.credits_per_month!==plan.credits)await paddle.products.update(product.id,{description:`Private AI digital-product creation studio. ${plan.credits} AI credits refresh monthly.`,customData:{...product.customData,credits_per_month:plan.credits}});
 for(const interval of ['month','year']){
  const amount=String(interval==='month'?plan.monthlyCents:plan.annualCents);
  let price=prices.find(p=>p.status==='active'&&p.productId===product.id&&p.billingCycle?.interval===interval&&p.billingCycle.frequency===1&&p.unitPrice.amount===amount&&p.unitPrice.currencyCode==='USD');
  if(!price){price=await paddle.prices.create({productId:product.id,name:`${plan.name} ${interval==='month'?'Monthly':'Annual'}`,description:`${plan.name}: ${plan.credits} credits refreshed monthly; ${interval==='month'?'monthly':'annual'} renewal`,unitPrice:{amount,currencyCode:'USD'},billingCycle:{interval,frequency:1},trialPeriod:null,taxMode:'account_setting',quantity:{minimum:1,maximum:1},customData:{fivegen_subscription_plan:plan.id,credits_per_month:plan.credits}});prices.push(price);}
  if(price.customData?.credits_per_month!==plan.credits)await paddle.prices.update(price.id,{description:`${plan.name}: ${plan.credits} credits refreshed monthly; ${interval} renewal`,customData:{...price.customData,credits_per_month:plan.credits}});
  assert.equal(price.billingCycle.interval,interval);mapping.push({plan:plan.id,productId:product.id,priceId:price.id,interval,amount,currency:'USD',monthlyCredits:plan.credits});
 }
 writeFileSync('docs/paddle-subscriptions-sandbox.json',JSON.stringify({environment:'sandbox',catalog:mapping},null,2)+'\n');
}
let env=readFileSync('.env.render.local','utf8');
for(const row of mapping){const name=`PADDLE_SUB_${row.plan.toUpperCase()}_${row.interval.toUpperCase()}`,line=`${name}=${row.priceId}`,pattern=new RegExp(`^${name}=.*$`,'m');env=pattern.test(env)?env.replace(pattern,line):env.trimEnd()+'\n'+line+'\n';}
writeFileSync('.env.render.local',env,{mode:0o600});
console.log(JSON.stringify({environment:'sandbox',catalog:mapping,publicEnvironmentChanged:false},null,2));
