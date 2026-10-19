import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {z} from 'zod';

const settings={STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_fixture',STRIPE_PUBLISHABLE_KEY:'pk_live_fixture',STRIPE_WALLET_WEBHOOK_SECRET:'whsec_fixture',STRIPE_WALLET_PORTAL_CONFIGURATION:'bpc_fixture',STRIPE_WALLET_CHECKOUT_ENABLED:'false'};
const requiredEvents=['checkout.session.completed','checkout.session.async_payment_succeeded','invoice.paid','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','charge.refunded','charge.dispute.created','charge.dispute.updated','charge.dispute.closed'];
let chargesEnabled=false,portalUpdates=false,missingEvents=false,signedIn=true,admin=true,remoteCalls=0,ownerCalls=[];
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const sdk={
  accounts:{retrieve:async()=>{remoteCalls++;return {charges_enabled:chargesEnabled};}},
  webhookEndpoints:{list:async()=>({has_more:false,data:[{url:'https://www.fivegen.ai/api/webhooks/wallet',status:'enabled',enabled_events:missingEvents?['checkout.session.completed']:requiredEvents}]})},
  billingPortal:{configurations:{retrieve:async()=>({active:true,features:{invoice_history:{enabled:true},subscription_cancel:{enabled:true},payment_method_update:{enabled:portalUpdates}}})}},
  paymentMethodDomains:{list:async()=>({data:[{domain_name:'www.fivegen.ai',enabled:true,apple_pay:{status:'active'},google_pay:{status:'active'}}]})},
};
const deps={ApiError,z,binding:key=>settings[key]||'',walletEnvironment:()=>{if(!['live','test'].includes(settings.STRIPE_MODE))throw new ApiError('mode',503);return settings.STRIPE_MODE==='live'?'production':'sandbox';},walletPublicConfig:()=>settings.STRIPE_MODE&&settings.STRIPE_SECRET_KEY&&settings.STRIPE_PUBLISHABLE_KEY?{environment:settings.STRIPE_MODE==='live'?'production':'sandbox',publishableKey:settings.STRIPE_PUBLISHABLE_KEY,enabled:settings.STRIPE_WALLET_CHECKOUT_ENABLED==='true'&&settings.STRIPE_WALLET_WEBHOOK_SECRET.startsWith('whsec_')&&Boolean(settings.STRIPE_WALLET_PORTAL_CONFIGURATION)}:null,walletStripe:()=>sdk};
async function load(path){const key='walletQa'+randomUUID().replaceAll('-','');globalThis[key]={...deps};const source=fs.readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;try{return await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}finally{delete globalThis[key];}}
const {walletReadiness}=await load('lib/wallet-readiness.ts');
let report=await walletReadiness('https://www.fivegen.ai');
assert.equal(report.enabled,false);assert.equal(report.readyToEnable,false);
assert.equal(report.checks.find(x=>x.id==='activation').status,'blocked');
assert.match(report.checks.find(x=>x.id==='activation').detail,/charges_enabled=false/);
assert.equal(report.checks.find(x=>x.id==='switch').status,'blocked');
assert.equal(report.checks.find(x=>x.id==='webhook').status,'ready');
assert.equal(report.checks.find(x=>x.id==='payment-method-update').status,'warning');
for(const value of Object.values(settings).filter(v=>/^(sk_|pk_|whsec_|bpc_)/.test(v)))assert.ok(!JSON.stringify(report).includes(value),'Readiness never exposes a credential value');
chargesEnabled=true;portalUpdates=true;report=await walletReadiness('https://www.fivegen.ai');assert.equal(report.readyToEnable,true);assert.equal(report.enabled,false,'Readiness never changes the release switch');
missingEvents=true;report=await walletReadiness('https://www.fivegen.ai');assert.equal(report.readyToEnable,false);assert.equal(report.checks.find(x=>x.id==='webhook').status,'blocked');missingEvents=false;
const before=remoteCalls;settings.STRIPE_MODE='';report=await walletReadiness('https://www.fivegen.ai');assert.equal(report.environment,null);assert.equal(report.readyToEnable,false);assert.equal(remoteCalls,before,'Unset environment cannot call a payment account');settings.STRIPE_MODE='live';
Object.assign(deps,{walletReadiness,commerceReadiness:async()=>({mode:settings.STRIPE_MODE,enabled:false,readyToEnable:false,checks:[]}),requireAdmin:async()=>{if(!signedIn)throw new ApiError('Sign in',401);if(!admin)throw new ApiError('Forbidden',403);return {userId:'signed-owner'};},identity:async options=>{assert.equal(options?.allowUnaccepted,true,'Existing billing access is retained after a Terms update');if(!signedIn)throw new ApiError('Sign in',401);return {userId:'signed-owner'};},sameOrigin:req=>{if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new ApiError('Forbidden',403);},failure:error=>Response.json({error:error.message},{status:error.status||400}),walletAccount:async owner=>{ownerCalls.push(owner);return {payments:[]};},reconcileWalletAccount:async owner=>{ownerCalls.push(owner);return {account:{payments:[]}};},walletReceipt:async(owner,id)=>{ownerCalls.push(owner);return {url:'https://pay.stripe.com/receipts/payment/'+id};}});
const readinessRoute=await load('app/api/admin/billing/readiness/route.ts');
signedIn=false;assert.equal((await readinessRoute.GET(new Request('https://www.fivegen.ai/api/admin/billing/readiness'))).status,401);
signedIn=true;admin=false;const beforeForbidden=remoteCalls;assert.equal((await readinessRoute.GET(new Request('https://www.fivegen.ai/api/admin/billing/readiness'))).status,403);assert.equal(remoteCalls,beforeForbidden,'Authorization precedes Stripe diagnostics');admin=true;
assert.equal((await readinessRoute.GET(new Request('https://www.fivegen.ai/api/admin/billing/readiness'))).headers.get('cache-control'),'no-store');
const accountRoute=await load('app/api/wallet/account/route.ts'),receiptRoute=await load('app/api/wallet/receipt/route.ts');
signedIn=false;assert.equal((await accountRoute.GET()).status,401);assert.equal((await accountRoute.POST(new Request('https://www.fivegen.ai/api/wallet/account',{method:'POST'}))).status,401);assert.equal(ownerCalls.length,0);
signedIn=true;
assert.equal((await accountRoute.POST(new Request('https://www.fivegen.ai/api/wallet/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerId:'cus_attacker',owner:'attacker'})}))).status,200);
assert.deepEqual(ownerCalls,['signed-owner'],'Caller-supplied IDs cannot select an account');
assert.equal((await accountRoute.POST(new Request('https://www.fivegen.ai/api/wallet/account',{method:'POST',headers:{Origin:'https://malicious.example'}}))).status,403);
const receipt=await receiptRoute.POST(new Request('https://www.fivegen.ai/api/wallet/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paymentId:'cs_live_fixture'})}));
assert.equal(receipt.status,200);assert.equal(receipt.headers.get('cache-control'),'no-store');assert.equal(ownerCalls.at(-1),'signed-owner');
assert.equal((await receiptRoute.POST(new Request('https://www.fivegen.ai/api/wallet/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paymentId:'cs_live_fixture',customerId:'cus_attacker'})}))).status,400);
console.log('Passed: admin-only nonsecret billing readiness, incomplete activation and disabled release switch, event coverage, no default environment, authenticated owner-only refresh and receipts, retained billing access after Terms updates, same-origin checks and no-store responses.');
