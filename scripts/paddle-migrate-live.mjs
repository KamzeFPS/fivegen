import { Paddle, Environment } from '@paddle/paddle-node-sdk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

// Explicit operator command only: node --env-file=.env.paddle-live.local scripts/paddle-migrate-live.mjs
// Does not deploy, take payments, migrate customers, or delete any Paddle entities.
assert.equal(process.env.PADDLE_ENVIRONMENT,'production');
assert.ok(process.env.PADDLE_API_KEY?.startsWith('pdl_live_apikey_'),'A live server API key is required');
const source=JSON.parse(readFileSync('outputs/paddle-sandbox-catalog.json','utf8'));
const p=new Paddle(process.env.PADDLE_API_KEY,{environment:Environment.production});
const mappingPath='docs/paddle-live-mapping.json';
const mapping=existsSync(mappingPath)?JSON.parse(readFileSync(mappingPath,'utf8')):{source:'sandbox',destination:'production',products:[],prices:[],discounts:[]};
const save=()=>writeFileSync(mappingPath,JSON.stringify({...mapping,updatedAt:new Date().toISOString()},null,2)+'\n');
const products=[],prices=[];
for await(const item of p.products.list()) products.push(item);
for await(const item of p.prices.list()) prices.push(item);
const allowed=new Set(['starter','studio','scale']);
const eligible=source.products.filter(product=>product.status==='active'&&allowed.has(product.customData?.fivegen_pack_id));
assert.equal(eligible.length,3,'Expected exactly the three reviewed FiveGen credit packs');
assert.equal(source.discounts.length,0,'New discounts require explicit review before migration');
for(const product of eligible){
  let live=products.find(item=>item.customData?.fivegen_source_sandbox_id===product.id);
  if(!live){
    live=await p.products.create({name:product.name,description:product.description,taxCategory:product.taxCategory,type:product.type,imageUrl:product.imageUrl,customData:{...product.customData,fivegen_source_sandbox_id:product.id}});
    products.push(live);
  }
  assert.equal(live.status,'active');assert.equal(live.name,product.name);assert.equal(live.taxCategory,product.taxCategory);
  if(!mapping.products.some(row=>row.sandboxId===product.id))mapping.products.push({packId:product.customData.fivegen_pack_id,name:product.name,sandboxId:product.id,liveId:live.id});
  save();
  for(const price of source.prices.filter(price=>price.productId===product.id&&price.status==='active')){
    let livePrice=prices.find(item=>item.customData?.fivegen_source_sandbox_id===price.id);
    if(!livePrice){
      livePrice=await p.prices.create({productId:live.id,name:price.name,description:price.description,type:price.type,unitPrice:price.unitPrice,billingCycle:price.billingCycle,trialPeriod:price.trialPeriod,taxMode:price.taxMode,unitPriceOverrides:price.unitPriceOverrides,quantity:price.quantity,customData:{...price.customData,fivegen_source_sandbox_id:price.id}});
      prices.push(livePrice);
    }
    assert.equal(livePrice.status,'active');assert.equal(livePrice.productId,live.id);assert.equal(livePrice.unitPrice.amount,price.unitPrice.amount);assert.equal(livePrice.unitPrice.currencyCode,price.unitPrice.currencyCode);assert.equal(livePrice.billingCycle,null);assert.equal(livePrice.trialPeriod,null);
    if(!mapping.prices.some(row=>row.sandboxId===price.id))mapping.prices.push({packId:product.customData.fivegen_pack_id,sandboxId:price.id,liveId:livePrice.id,liveProductId:live.id,amount:price.unitPrice.amount,currency:price.unitPrice.currencyCode,billingCycle:null});
    save();
  }
}
const tokens=[];for await(const token of p.clientTokens.list())tokens.push(token);
let token=process.env.PADDLE_CLIENT_TOKEN?tokens.find(token=>token.token===process.env.PADDLE_CLIENT_TOKEN&&token.status==='active'):tokens.find(token=>token.name==='FiveGen live web checkout'&&token.status==='active');
if(process.env.PADDLE_CLIENT_TOKEN&&!token)throw new Error('The supplied live client token is not active in this account');
if(!token)token=await p.clientTokens.create({name:'FiveGen live web checkout',description:'FiveGen AI credit packs. Prepared privately until live verification and website approval complete.'});
assert.ok(token.token.startsWith('live_'));
mapping.clientTokenId=token.id;save();
const events=['customer.created','customer.updated','subscription.created','subscription.updated','subscription.canceled','subscription.activated','subscription.trialing','subscription.paused','subscription.past_due','subscription.resumed','transaction.completed','adjustment.created','adjustment.updated'];
const notifications=await p.notificationSettings.list();
let notification=process.env.PADDLE_NOTIFICATION_ID?notifications.find(n=>n.id===process.env.PADDLE_NOTIFICATION_ID):notifications.find(n=>n.destination==='https://www.fivegen.ai/api/webhooks/paddle');
if(process.env.PADDLE_NOTIFICATION_ID&&!notification)throw new Error('The supplied notification is not in this live account');
if(!notification)notification=await p.notificationSettings.create({description:'FiveGen live fulfillment',destination:'https://www.fivegen.ai/api/webhooks/paddle',type:'url',apiVersion:1,trafficSource:'platform',includeSensitiveFields:false,subscribedEvents:events});
assert.ok(notification.active);assert.ok(notification.endpointSecretKey);assert.equal(notification.destination,'https://www.fivegen.ai/api/webhooks/paddle');
assert.ok(events.every(name=>notification.subscribedEvents.some(e=>e.name===name)),'The destination must subscribe to every fulfillment event');
mapping.notification={id:notification.id,destination:notification.destination,active:notification.active};save();
const envPath='.env.paddle-live.local';
const values={PADDLE_ENVIRONMENT:'production',PADDLE_LIVE_RELEASE:'staging',PADDLE_CLIENT_TOKEN:token.token,PADDLE_WEBHOOK_SECRET:notification.endpointSecretKey,PADDLE_PRICE_STARTER:mapping.prices.find(p=>p.packId==='starter').liveId,PADDLE_PRICE_PRO:mapping.prices.find(p=>p.packId==='studio').liveId,PADDLE_PRICE_ADVANCED:mapping.prices.find(p=>p.packId==='scale').liveId};
let env=readFileSync(envPath,'utf8');
for(const [name,value] of Object.entries(values)){const line=`${name}=${value}`;const pattern=new RegExp(`^${name}=.*$`,'m');env=pattern.test(env)?env.replace(pattern,line):env.trimEnd()+'\n'+line+'\n';}
writeFileSync(envPath,env,{mode:0o600});
console.log(JSON.stringify({products:mapping.products,prices:mapping.prices,discounts:mapping.discounts,clientTokenId:token.id,notification:mapping.notification,privateEnvironmentSaved:true,publicDeploymentChanged:false},null,2));
