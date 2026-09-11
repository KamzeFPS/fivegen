import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const stmt=(sql,args=[])=>({bind:(...v)=>stmt(sql,v),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})});
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const transfers=new Map(),charges=new Map(),fees=new Map(),idempotent=new Map();let transferCalls=0,refundCalls=0,releaseTransfer,startedTransfer,delayNext=false;
async function stripe(path,fields,account,key){
 if(path.startsWith('accounts/'))return {payouts_enabled:true,capabilities:{transfers:'active'}};
 if(path.startsWith('invoice_payments?'))return {data:[{payment:{type:'payment_intent',payment_intent:'pi_subscription'}}]};
 if(path.startsWith('payment_intents/')){const id=path.split('/')[1].split('?')[0];return {latest_charge:charges.get(id)};}
 if(path.startsWith('transfers?')){const group=new URLSearchParams(path.split('?')[1]).get('transfer_group');return {data:[...transfers.values()].filter(t=>t.transfer_group===group)};}
 if(path==='transfers'){
   if(key&&idempotent.has(key))return idempotent.get(key);
   if(delayNext){delayNext=false;startedTransfer();await new Promise(resolve=>releaseTransfer=resolve);}
   transferCalls++;const t={id:'tr_'+crypto.randomUUID(),amount:Number(fields.get('amount')),amount_reversed:0,transfer_group:fields.get('transfer_group'),metadata:{fivegen_commission:fields.get('metadata[fivegen_commission]')}};
   transfers.set(t.id,t);if(key)idempotent.set(key,t);return t;
 }
 if(path.startsWith('transfers/')){const t=transfers.get(path.split('/')[1]);if(fields){if(key&&idempotent.has(key))return idempotent.get(key);const r={id:'trr_'+crypto.randomUUID()};t.amount_reversed+=Number(fields.get('amount'));if(key)idempotent.set(key,r);return r;}return t;}
 if(path.startsWith('application_fees/')){
   const fee=fees.get(path.split('/')[1]);if(path.includes('/refunds')){
     if(!fields)return {data:fee.refunds,has_more:false};
     if(key&&idempotent.has(key))return idempotent.get(key);
     refundCalls++;const amount=Number(fields.get('amount'));assert.ok(amount>0&&fee.amount_refunded+amount<=fee.amount);const r={id:'fr_'+crypto.randomUUID(),amount,metadata:{fivegen_commission:fields.get('metadata[fivegen_commission]')}};
     fee.amount_refunded+=amount;fee.refunds.push(r);if(key)idempotent.set(key,r);return r;
   }return fee;
 }
 throw Error('Unimplemented test Stripe path: '+path);
}
globalThis.__referralTest={ApiError,database:()=>({prepare:stmt}),stripe};
const source=fs.readFileSync('lib/referrals.ts','utf8').replace(/^import .*;\r?\n/gm,'');
const code='const {ApiError,database,stripe}=globalThis.__referralTest;\n'+ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {checkoutReferral,recordReferral,payReferral,voidReferral,handleReferralCharge}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
db.prepare("INSERT INTO sellers (owner,name,stripe_account,created_at) VALUES ('partner','Partner','acct_partner',0)").run();
db.prepare("INSERT INTO referral_invites (id,owner,product_id,email,percent,code,token_hash,user_id,status,expires_at,created_at) VALUES ('invite','creator','product','partner@example.test',2250,'code','hash','partner','accepted',9999999999999,0)").run();
assert.equal((await checkoutReferral(new Request('https://example.test',{headers:{cookie:'fivegen_ref_product=code'}}),'product','creator',4999)).fee,1124);
assert.equal(await checkoutReferral(new Request('https://example.test'),'product','creator',4999),null);
let sequence=0;
async function commission(id,email='buyer'+(++sequence)+'@example.test',subscription=false){
 const pi=subscription?'pi_subscription':'pi_'+id,feeId='fee_'+id;
 charges.set(pi,{id:'ch_'+id,paid:true,refunded:false,amount_refunded:0,disputed:false,application_fee:feeId,payment_intent:pi});fees.set(feeId,{amount:1274,amount_refunded:0,refunds:[]});
 const order={id,email,created_at:Date.now()};
 db.prepare("INSERT INTO orders (id,product_id,owner,email,amount,provider,token,created_at) VALUES (?,'product','creator',?,4999,'stripe',?,?)").run(id,email,id,order.created_at);
 const intent={referral_id:'invite',referral_fee:1124,owner:'creator',product_id:'product',account:'acct_creator'};
 await recordReferral(order,intent,subscription?{invoice:'in_first'}:{payment_intent:pi});
 await recordReferral(order,intent,subscription?{invoice:'in_first'}:{payment_intent:pi});
 return db.prepare('SELECT * FROM referral_commissions WHERE id=?').get(id);
}
const c=await commission('cs_first');assert.equal(c.amount,1124);assert.equal(db.prepare('SELECT COUNT(*) n FROM referral_commissions').get().n,1);
await assert.rejects(()=>payReferral(c.id,'wrong-user'),e=>e.status===404);
await assert.rejects(()=>payReferral(c.id,'partner'),e=>e.status===409);
db.prepare('UPDATE referral_commissions SET available_at=0 WHERE id=?').run(c.id);
await payReferral(c.id,'partner');await payReferral(c.id,'partner');assert.equal(transferCalls,1,'Repeated claims cannot transfer twice');
const paid=db.prepare('SELECT * FROM referral_commissions WHERE id=?').get(c.id);assert.equal(paid.state,'paid');
await voidReferral(c.id);await voidReferral(c.id);assert.equal(transfers.get(paid.transfer_id).amount_reversed,1124);assert.equal(db.prepare('SELECT state FROM referral_commissions WHERE id=?').get(c.id).state,'reversed');
const self=await commission('cs_self','partner@example.test');assert.equal(self.state,'void','Self referrals refund the reserved share');
await commission('cs_repeat_a','repeat@example.test');await new Promise(r=>setTimeout(r,2));const repeat=await commission('cs_repeat_b','repeat@example.test');assert.equal(repeat.state,'void','Only the first paid product purchase earns a share');
const sub=await commission('cs_subscription',undefined,true);assert.equal(sub.payment_intent,'pi_subscription','First subscription invoice resolves its payment');
const refunded=await commission('cs_refund');charges.get('pi_cs_refund').amount_refunded=500;
await handleReferralCharge(charges.get('pi_cs_refund'),'acct_creator');assert.equal(db.prepare('SELECT state FROM referral_commissions WHERE id=?').get(refunded.id).state,'void','Partial refunds cancel the full partner commission');
// Recover after Stripe succeeded but saving local completion failed, even after its key cache expires.
const crash=await commission('cs_crash');db.prepare('UPDATE referral_commissions SET available_at=0 WHERE id=?').run(crash.id);await payReferral(crash.id,'partner');
const count=transferCalls;db.prepare("UPDATE referral_commissions SET state='paying',transfer_id=NULL,payout_started_at=1 WHERE id=?").run(crash.id);idempotent.clear();await payReferral(crash.id,'partner');assert.equal(transferCalls,count,'Reconciliation finds the existing transfer');
await voidReferral(crash.id);const refunds=refundCalls;db.prepare("UPDATE referral_commissions SET state='voiding' WHERE id=?").run(crash.id);idempotent.clear();await voidReferral(crash.id);assert.equal(refundCalls,refunds,'Refund metadata prevents duplicate fee refunds after key expiration');
// A refund arriving while a transfer is in flight must be reversed when the transfer settles.
const race=await commission('cs_race');db.prepare('UPDATE referral_commissions SET available_at=0 WHERE id=?').run(race.id);
delayNext=true;const started=new Promise(resolve=>startedTransfer=resolve),payout=payReferral(race.id,'partner');await started;
await assert.rejects(()=>voidReferral(race.id),e=>e.status===409);releaseTransfer();await assert.rejects(()=>payout,e=>e.status===409);
const raced=db.prepare('SELECT * FROM referral_commissions WHERE id=?').get(race.id);assert.equal(raced.state,'reversed');assert.equal(transfers.get(raced.transfer_id).amount_reversed,1124);
db.close();delete globalThis.__referralTest;
console.log('Passed: referral fee rounding, authenticated payout ownership, holds, first-purchase-only and self-referral rules, initial subscription payment, partial refunds, repeated claims, transfer/refund recovery, and refund/payout race. Stripe transport is a test double; no money moved.');
