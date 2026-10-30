import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import {creditPolicy,creditPacks,monthlyWindow} from '../lib/credit-policy.ts';

// Actual launch policy and credit SQL against a fully migrated isolated database.
// Provider and payment transports are disabled: no credentials or paid calls.
assert.equal(creditPolicy.monthly,60);
const sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const statement=(query,args=[])=>({query,args,bind:(...values)=>statement(query,values),first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:sql.prepare(query).run(...args).changes}})});
const db={prepare:statement,async batch(items){sql.exec('BEGIN');try{const results=items.map(item=>({meta:{changes:sql.prepare(item.query).run(...item.args).changes}}));sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const deps={ApiError,database:()=>db,binding:()=>'',stripe:()=>{throw new Error('Live billing disabled in this test');},creditPolicy,creditPacks,monthlyWindow,mcpCreditLimit:new AsyncLocalStorage()};
async function load(path){const key='freeCredits'+crypto.randomUUID().replaceAll('-','');globalThis[key]={...deps};const source=fs.readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;try{return await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}finally{delete globalThis[key];}}
for(const path of ['lib/generation-access.ts','lib/product-allowance.ts','lib/subscription-credits.ts'])Object.assign(deps,await load(path));
const credits=await load('lib/credits.ts'),now=Date.UTC(2026,9,30,8),nextMonth=Date.UTC(2026,10,1),owner='free-monthly';
const balance=(id=owner,time=now)=>credits.creditBalance(id,time);
const reserve=(id,cost,time=now,account=owner)=>credits.reserveCredits(account,id,'image',cost,time);
function paidWallet(account,id,{start=now-1000,end=now+86400000,amount=2900,allowance=2000,status='active',credited=1,reversed=0,environment='production'}={}){
 const customer='cus_'+id,subscription='sub_'+id;
 sql.prepare('INSERT INTO wallet_checkout_intents (id,owner,environment,offer_id,email,amount,credits,billing_interval,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,account,environment,'subscription:pro:month','fixture@example.test',amount,allowance,'month','complete',start);
 sql.prepare('INSERT INTO wallet_subscriptions (subscription_id,owner,environment,customer_id,intent_id,status,period_end,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(subscription,account,environment,customer,id,status,end,start);
 sql.prepare('INSERT INTO wallet_payments (id,owner,environment,intent_id,payment_intent,subscription_id,amount,credits,credited,reversed,starts_at,ends_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('pay_'+id,account,environment,id,'pi_'+id,subscription,amount,allowance,credited,reversed,start,end,start);
 return subscription;
}
function paidPaddle(account,id,{start=now-1000,end=now+86400000,environment='production',allowance=2500}={}){
 const sub='psub_'+id,transaction='ptxn_'+id,customer='pctm_'+id,date=new Date(start).toISOString();
 sql.prepare('INSERT INTO paddle_customers (customer_id,environment,email,owner,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(customer,environment,'fixture@example.test',account,date,date);
 sql.prepare('INSERT INTO paddle_subscriptions (subscription_id,environment,customer_id,status,price_id,product_id,items,created_at,updated_at,event_time) VALUES (?,?,?,?,?,?,?,?,?,?)').run(sub,environment,customer,'active','pri_'+id,'prod_'+id,'[]',date,date,start);
 sql.prepare('INSERT INTO paddle_transactions (transaction_id,environment,customer_id,owner,status,currency,total,credits,credited,created_at,updated_at,event_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(transaction,environment,customer,account,'completed','USD','2900',0,1,date,date,start);
 sql.prepare('INSERT INTO paddle_subscription_periods VALUES (?,?,?,?,?,?,?,?)').run(transaction,environment,account,sub,'pri_'+id,allowance,start,end);
 return {sub,transaction};
}
try{
 assert.equal((await balance()).starter,60);
 assert.equal((await balance()).total,60);
 assert.equal((await balance()).renewsAt,nextMonth);
 await Promise.all(Array.from({length:12},()=>balance()));
 assert.equal(sql.prepare('SELECT starter FROM wallets WHERE owner=?').get(owner).starter,60,'Repeated and parallel reads cannot mint additional credits');
 assert.equal((await balance('another-owner')).starter,60,'Free balances are tenant isolated');
 const attempts=await Promise.allSettled(Array.from({length:20},(_,index)=>reserve('free-'+index,4)));
 assert.equal(attempts.filter(result=>result.status==='fulfilled').length,15,'A 60-credit allowance permits exactly 15 concurrent Low images');
 assert.equal((await balance()).total,0);
 assert.equal(sql.prepare('SELECT SUM(starter_used) amount FROM credit_usage WHERE owner=?').get(owner).amount,60);
 await Promise.all([credits.refundCredits('free-0',now),credits.refundCredits('free-0',now)]);
 assert.equal((await balance()).starter,4,'Refund restores a reserved Free charge exactly once');
 await reserve('free-restored',4);await credits.completeCredits('free-restored');await credits.refundCredits('free-restored',now);
 assert.equal((await balance()).total,0,'A completed request cannot be refunded again');
 await assert.rejects(()=>reserve('empty',4),error=>error.status===402);
 sql.prepare('UPDATE wallets SET purchased=20 WHERE owner=?').run(owner);
 await reserve('paid-topup-after-free',12);assert.equal((await balance()).purchased,8);
 await credits.refundCredits('paid-topup-after-free',now);assert.equal((await balance()).purchased,20);
 assert.equal((await balance(owner,nextMonth)).starter,60,'A new UTC month resets the Free allowance');
 await credits.refundCredits('free-1',nextMonth+1);
 assert.equal((await balance(owner,nextMonth+1)).starter,60,'Late refund never carries old credits into the new month');
 await balance(owner,now);
 assert.equal(sql.prepare('SELECT cycle FROM wallets WHERE owner=?').get(owner).cycle,'free:2026-11','An older delayed read cannot rewind the monthly pool');
 const late='late-unread';await balance(late);await reserve('late-reservation',12,now,late);await credits.refundCredits('late-reservation',nextMonth+1);
 assert.equal(sql.prepare('SELECT starter FROM wallets WHERE owner=?').get(late).starter,48,'An expired pool cannot be refilled even before another balance read');
 assert.equal((await balance(late,nextMonth+1)).starter,60);
 const mixed='free-and-topup';await balance(mixed);sql.prepare('UPDATE wallets SET purchased=20 WHERE owner=?').run(mixed);
 await reserve('mixed',70,now,mixed);assert.equal((await balance(mixed)).starter,0);assert.equal((await balance(mixed)).purchased,10);
 assert.deepEqual({...sql.prepare('SELECT starter_used,included_used,purchased_used FROM credit_usage WHERE id=?').get('mixed')},{starter_used:60,included_used:0,purchased_used:10});
 await balance(mixed,nextMonth);await credits.refundCredits('mixed',nextMonth+1);
 assert.equal((await balance(mixed,nextMonth+1)).starter,60);assert.equal((await balance(mixed,nextMonth+1)).purchased,20,'A cross-month refund restores purchased credits while discarding expired Free credits');
 const upgraded='upgrade-no-remint';await balance(upgraded);await reserve('before-upgrade',12,now,upgraded);await credits.completeCredits('before-upgrade');
 const sub=paidWallet(upgraded,'upgrade');assert.equal((await balance(upgraded)).starter,0);assert.equal((await balance(upgraded)).included,2000);assert.equal((await balance(upgraded)).total,2000,'Pro receives exactly its paid allowance, without a hidden extra60');
 await reserve('pro-all',2000,now,upgraded);await credits.completeCredits('pro-all');assert.equal((await balance(upgraded)).total,0,'Exhausting Pro does not unlock Free credits');
 await assert.rejects(()=>reserve('pro-cannot-get-free',4,now,upgraded),error=>error.status===402);
 sql.prepare("UPDATE wallet_subscriptions SET status='canceled' WHERE subscription_id=?").run(sub);
 assert.equal((await balance(upgraded)).starter,48,'Downgrading within a month restores only the unspent original Free pool');
 sql.prepare("UPDATE wallet_subscriptions SET status='active' WHERE subscription_id=?").run(sub);assert.equal((await balance(upgraded)).starter,0);
 sql.prepare("UPDATE wallet_subscriptions SET status='canceled' WHERE subscription_id=?").run(sub);assert.equal((await balance(upgraded)).starter,48,'Repeated upgrades and downgrades cannot remint Free credits');
 assert.equal((await balance(upgraded,nextMonth+1)).starter,60);
 const currentPaid='scale-precise';paidWallet(currentPaid,'scale',{allowance:6000,amount:9900});assert.equal((await balance(currentPaid)).total,6000);assert.equal((await balance(currentPaid)).starter,0);
 for(const [id,options] of [['sandbox',{environment:'sandbox'}],['unpaid',{credited:0}],['future',{start:nextMonth,end:nextMonth+86400000}],['expired',{start:now-172800000,end:now-86400000}],['fully-reversed',{reversed:2000}]]){
  paidWallet(id,id,options);assert.equal((await balance(id)).starter,60,id+' does not suppress a genuine Free allowance');
 }
 const legacy='paddle-legacy';const paddle=paidPaddle(legacy,'legacy');assert.equal((await balance(legacy)).total,2500);assert.equal((await balance(legacy)).starter,0,'Paid legacy subscriptions retain their exact historical allowance');
 const adjustment=(id,transaction,amount)=>sql.prepare('INSERT INTO paddle_adjustments (adjustment_id,environment,transaction_id,action,status,total,created_at,updated_at,event_time) VALUES (?,?,?,?,?,?,?,?,?)').run(id,'production',transaction,'refund','approved',String(amount),new Date(now).toISOString(),new Date(now).toISOString(),now);
 adjustment('legacy-half-refund',paddle.transaction,1450);
 assert.equal((await balance(legacy)).included,1250);assert.equal((await balance(legacy)).starter,0,'A partial paid refund does not unlock a second Free allowance');
 adjustment('legacy-refund-rest',paddle.transaction,1450);
 assert.equal((await balance(legacy)).starter,60,'A fully refunded unused paid plan returns to Free');
 assert.equal((await balance(legacy)).included,0);
 const futurePaddle='paddle-future';paidPaddle(futurePaddle,'future',{start:nextMonth,end:nextMonth+86400000});
 assert.equal((await balance(futurePaddle)).total,60,'A future Paddle paid period cannot suppress Free or spend paid credits early');
 assert.equal((await balance(futurePaddle,nextMonth+1)).starter,0);assert.equal((await balance(futurePaddle,nextMonth+1)).included,2500,'A future verified period becomes paid only when its window begins');
 const paddleDebtOwner='paddle-refunded-spent';const debtPaddle=paidPaddle(paddleDebtOwner,'spent');await reserve('spend-paddle-before-refund',2500,now,paddleDebtOwner);await credits.completeCredits('spend-paddle-before-refund');
 adjustment('paddle-spent-refund',debtPaddle.transaction,2900);
 const debtBalance=await balance(paddleDebtOwner);assert.equal(debtBalance.starter,60);assert.equal(debtBalance.included,-2500);assert.equal(debtBalance.total,-2440);assert.equal(debtBalance.media,0,'Monthly Free does not erase already-spent refund debt');
 await assert.rejects(()=>reserve('refund-debt-blocked',4,now,paddleDebtOwner),error=>error.status===402);
 const unlimited='verified-owner';sql.prepare('INSERT INTO terms_acceptances VALUES (?,?,?,?,?)').run('unlimited',unlimited,'fixture','kamzewac@gmail.com',now);
 assert.equal((await balance(unlimited)).total,0);assert.equal((await balance(unlimited)).starter,0,'Unlimited access never mints a fake Free balance');
 await reserve('unlimited-request',40,now,unlimited);await credits.refundCredits('unlimited-request',now);assert.equal((await balance(unlimited)).total,0);
 await assert.rejects(()=>balance('bad-time',NaN),/Invalid credit allowance time/);
 console.log('Passed: actual 60-credit UTC monthly policy, concurrent reads/spends, tenant isolation, exact paid and legacy allowances, no Free unlock on paid exhaustion, upgrade/downgrade without reminting, rollover and late-refund conservation, purchased-credit ordering/refunds, sandbox and unpaid isolation, unlimited no-mint.');
}finally{sql.close();}
