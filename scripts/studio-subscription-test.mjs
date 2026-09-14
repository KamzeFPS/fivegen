import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {resolve} from 'node:path';
import {createStorage} from '../runtime/render/storage.mjs';
import {creditPolicy,creditPacks,textCredits,monthlyWindow} from '../lib/credit-policy.ts';

const root=resolve('outputs/studio-subscription-qa',randomUUID()),storage=createStorage(root),db=storage.DB,sql=storage.sqlite;
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const deps={ApiError,database:()=>db,binding:()=>'',creditPolicy,creditPacks,textCredits,monthlyWindow,mcpCreditLimit:new AsyncLocalStorage(),stripe:()=>{throw Error('No external payments in this test');}};
async function load(path){const key='qa'+randomUUID().replaceAll('-','');globalThis[key]={...deps};const source=fs.readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;const result=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete globalThis[key];return result;}
Object.assign(deps,await load('lib/generation-access.ts'));
Object.assign(deps,await load('lib/product-allowance.ts'),await load('lib/subscription-credits.ts'));
const credits=await load('lib/credits.ts');
const now=Date.now(),owner='subscription-fixture';
function funding(id,{environment='production',months=12,startsAt=now-10000,amount=29000,allowance=2500,status='active'}={}){
 const customer='ctm_'+id,sub='sub_'+id,txn='txn_'+id,endDate=new Date(startsAt);endDate.setUTCMonth(endDate.getUTCMonth()+months);const end=endDate.getTime(),date=new Date(startsAt).toISOString();
 sql.prepare('INSERT INTO paddle_customers (customer_id,environment,email,owner,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(customer,environment,'qa@example.test',owner,date,date);
 sql.prepare('INSERT INTO paddle_subscriptions (subscription_id,environment,customer_id,status,price_id,product_id,items,created_at,updated_at,event_time) VALUES (?,?,?,?,?,?,?,?,?,?)').run(sub,environment,customer,status,'pri_'+id,'pro_'+id,'[]',date,date,startsAt);
 sql.prepare('INSERT INTO paddle_transactions (transaction_id,environment,customer_id,owner,status,currency,total,credits,credited,created_at,updated_at,event_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(txn,environment,customer,owner,'completed','USD',String(amount),0,1,date,date,startsAt);
 sql.prepare('INSERT INTO paddle_subscription_periods VALUES (?,?,?,?,?,?,?,?)').run(txn,environment,owner,sub,'pri_'+id,allowance,startsAt,end);
 return {customer,sub,txn,startsAt,end,amount};
}
try{
 const year=funding('annual');
 assert.equal((await credits.creditBalance(owner)).included,2500,'Annual purchase grants one month, not 12 months at once');
 await Promise.all(Array.from({length:8},()=>credits.creditBalance(owner)));
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM subscription_credit_grants').get().n,1,'Concurrent balance reads do not refill twice');
 sql.prepare('UPDATE wallets SET purchased=100 WHERE owner=?').run(owner);
 await credits.reserveCredits(owner,'image-1','image',12);
 assert.equal((await credits.creditBalance(owner)).included,2488);assert.equal((await credits.creditBalance(owner)).purchased,100,'Subscription credits spent first');
 await Promise.all([credits.refundCredits('image-1'),credits.refundCredits('image-1')]);
 assert.equal((await credits.creditBalance(owner)).included,2500);assert.equal((await credits.creditBalance(owner)).purchased,100);
 assert.equal(sql.prepare('SELECT included FROM wallets WHERE owner=?').get(owner).included,0,'Refund does not duplicate grant into legacy wallet');
 sql.prepare("UPDATE paddle_subscriptions SET scheduled_change_action='cancel',scheduled_change_at=? WHERE subscription_id=?").run(new Date(year.end).toISOString(),year.sub);
 assert.equal((await credits.creditBalance(owner)).included,2500,'Scheduled cancellation leaves current credits usable');
 for(const status of ['paused','past_due','canceled']){sql.prepare('UPDATE paddle_subscriptions SET status=? WHERE subscription_id=?').run(status,year.sub);assert.equal((await credits.creditBalance(owner)).included,0,status+' cannot spend subscription credits');}
 sql.prepare("UPDATE paddle_subscriptions SET status='trialing' WHERE subscription_id=?").run(year.sub);
 assert.equal((await credits.creditBalance(owner)).included,2500,'Paid trialing status restores unexpired credits');
 sql.prepare("UPDATE paddle_subscriptions SET status='active' WHERE subscription_id=?").run(year.sub);
 const second=monthlyWindow(year.startsAt,year.end,new Date(new Date(now).setUTCMonth(new Date(now).getUTCMonth()+1)).getTime());
 const next=await deps.subscriptionCreditBalance(owner,'production',second.start+1);
 assert.equal(next.included,2500,'Annual second month receives a fresh allowance; unused prior credits do not roll over');
 assert.equal((await deps.subscriptionCreditBalance(owner,'production',year.end+1)).included,0,'Unpaid future annual period grants nothing');
 // Restore present-time view: the future bucket must not be spendable early.
 assert.equal((await credits.creditBalance(owner)).included,2500);
 funding('sandbox',{environment:'sandbox',allowance:6000});
 assert.equal((await credits.creditBalance(owner)).included,2500,'Sandbox never grants production AI capacity');
 assert.equal((await deps.subscriptionCreditBalance(owner,'sandbox')).included,6000);
 await credits.reserveCredits(owner,'large-usage','text',2400);await credits.completeCredits('large-usage');
 assert.equal((await credits.creditBalance(owner)).included,100);
 const adjustment=(id,total,action='refund')=>sql.prepare('INSERT INTO paddle_adjustments (adjustment_id,environment,transaction_id,action,status,total,created_at,updated_at,event_time) VALUES (?,?,?,?,?,?,?,?,?)').run(id,'production',year.txn,action,'approved',String(total),new Date().toISOString(),new Date().toISOString(),Date.now());
 adjustment('refund',year.amount);
 assert.equal((await credits.creditBalance(owner)).included,-2400,'Refunded spent subscription credits remain a debt');
 assert.equal((await credits.creditBalance(owner)).included,-2400,'Repeated refund refresh is idempotent');
 assert.equal((await deps.subscriptionCreditBalance(owner,'production',year.end+1)).included,-2400,'Debt does not disappear at expiry');
 await assert.rejects(()=>credits.reserveCredits(owner,'after-refund','image',12),e=>e.status===402);
 adjustment('refund-reversal',year.amount,'chargeback_reverse');
 assert.equal((await credits.creditBalance(owner)).included,100,'Reversed chargeback restores credit state');
 const parallel=await Promise.allSettled(Array.from({length:30},(_,i)=>credits.reserveCredits(owner,'parallel-'+i,'image',10)));
 assert.equal(parallel.filter(r=>r.status==='fulfilled').length,20,'Concurrent spending uses exactly the available 100 included + 100 purchased credits');
 assert.equal((await credits.creditBalance(owner)).total,0);
 // January anchors do not drift after short months or leap days.
 assert.deepEqual(monthlyWindow(Date.UTC(2028,0,31),Date.UTC(2029,0,31),Date.UTC(2028,1,29)),{start:Date.UTC(2028,1,29),end:Date.UTC(2028,2,31)});
 console.log('Passed: real subscription ledger, monthly annual release, no rollover, future period exclusion, status access, scheduled cancellation, subscription-first spend, concurrency, refunds and persistent debt, sandbox isolation.');
 console.log('Permanent QA records retained: '+root);
}finally{storage.close();}
