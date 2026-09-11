import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import {creditPolicy,creditPacks,monthlyWindow,commissionAmount,commissionRate} from '../lib/credit-policy.ts';

// Run the actual credit SQL against SQLite; only D1 transport and Stripe are mocked.
const sqlite=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
  if(file.startsWith('0006')){
    sqlite.prepare('INSERT INTO wallets (owner,starter,included,purchased,expires) VALUES (?,?,?,?,?)').run('migration-paid',1200,180,70,Date.now()+86400000);
    sqlite.prepare('INSERT INTO wallets (owner,starter,included,purchased,expires) VALUES (?,?,?,?,?)').run('migration-expired',1200,180,70,0);
  }
  sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));
}
assert.deepEqual({...sqlite.prepare('SELECT starter,included,purchased FROM wallets WHERE owner=?').get('migration-paid')},{starter:0,included:0,purchased:250});
assert.deepEqual({...sqlite.prepare('SELECT starter,included,purchased FROM wallets WHERE owner=?').get('migration-expired')},{starter:0,included:0,purchased:70});
function statement(sql,values=[]){return {bind(...args){return statement(sql,args);},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:r.changes}};},sql,values};}
const db={prepare:statement,async batch(items){sqlite.exec('BEGIN');try{const results=items.map(x=>({meta:{changes:sqlite.prepare(x.sql).run(...x.values).changes}}));sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
let charge={payment_intent:'pi_test',amount_refunded:0,dispute:null};
globalThis.__creditTest={ApiError,binding:()=>'',database:()=>db,stripe:async path=>{assert.ok(path.startsWith('charges/'));return charge;},planFor:async owner=>{const m=sqlite.prepare('SELECT * FROM memberships WHERE owner=?').get(owner);return {tier:m?.status==='active'&&m.period_end*1000>Date.now()?'pro':'free'};},creditPacks,creditPolicy,monthlyWindow};
const allowanceSource=fs.readFileSync('lib/product-allowance.ts','utf8').replace(/^import .*;\r?\n/gm,'');
const allowanceCode='const {ApiError,database,creditPolicy}=globalThis.__creditTest;\n'+ts.transpileModule(allowanceSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const a=await import('data:text/javascript;base64,'+Buffer.from(allowanceCode).toString('base64'));
globalThis.__creditTest.productAllowance=a.productAllowance;
const source=fs.readFileSync('lib/credits.ts','utf8').replace(/^import .*;\r?\n/gm,'');
globalThis.__creditTest.mcpCreditLimit=new AsyncLocalStorage();
const code='const {ApiError,binding,database,stripe,planFor,creditPacks,creditPolicy,monthlyWindow,mcpCreditLimit,productAllowance}=globalThis.__creditTest;\n'+ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const c=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const owner='credit-test';
await assert.rejects(()=>globalThis.__creditTest.mcpCreditLimit.run({remaining:9},()=>c.reserveCredits(owner,'over-mcp-cap','text',10)),e=>e.status===402);
assert.equal((await c.creditBalance(owner)).total,0);
assert.equal((await c.creditBalance(owner)).products.remaining,3);
await assert.rejects(()=>c.reserveCredits(owner,'no-free-media','image',12),e=>e.status===402);
sqlite.prepare('UPDATE wallets SET purchased=10 WHERE owner=?').run(owner);
await c.reserveCredits(owner,'text-1','text',10);assert.equal((await c.creditBalance(owner)).purchased,0);await c.completeCredits('text-1');
await assert.rejects(()=>c.reserveCredits(owner,'text-1','text',10),e=>e.status===409);
await assert.rejects(()=>c.reserveCredits(owner,'free-media','image',12),e=>e.status===402);
sqlite.prepare('UPDATE wallets SET starter=0,purchased=100 WHERE owner=?').run(owner);
const parallel=await Promise.allSettled(Array.from({length:20},(_,i)=>c.reserveCredits(owner,'parallel-'+i,'image',10)));
assert.equal(parallel.filter(r=>r.status==='fulfilled').length,10);assert.equal((await c.creditBalance(owner)).purchased,0);
await Promise.all([c.refundCredits('parallel-0'),c.refundCredits('parallel-0'),c.refundCredits('parallel-0')]);assert.equal((await c.creditBalance(owner)).purchased,10);
sqlite.prepare("INSERT INTO memberships (owner,subscription_id,status,interval,period_start,period_end,updated_at) VALUES (?,?,'active','month',?,?,?)").run(owner,'sub_test',Date.now()/1000,Date.now()/1000+86400,Date.now());
assert.equal((await c.creditBalance(owner)).included,0,'Legacy subscriptions never mint credits');
const session={id:'cs_test',metadata:{purpose:'fivegen_credits',pack:'starter',owner},mode:'payment',payment_status:'paid',currency:'usd',amount_total:1500,payment_intent:'pi_test'};
await assert.rejects(()=>c.recordCreditPurchase({...session,amount_total:1}),e=>e.status===409);
await Promise.all([c.recordCreditPurchase(session),c.recordCreditPurchase(session)]);assert.equal((await c.creditBalance(owner)).purchased,1010);
charge.amount_refunded=750;await c.reverseCreditPurchase('ch_test');await c.reverseCreditPurchase('ch_test');assert.equal((await c.creditBalance(owner)).purchased,510);
charge.dispute={status:'needs_response'};await c.reverseCreditPurchase('ch_test');assert.equal((await c.creditBalance(owner)).purchased,10);
charge.dispute={status:'won'};await c.reverseCreditPurchase('ch_test');assert.equal((await c.creditBalance(owner)).purchased,510);
await c.recordCreditPurchase(session);assert.equal((await c.creditBalance(owner)).purchased,510);
sqlite.prepare('UPDATE wallets SET purchased=-1 WHERE owner=?').run(owner);await assert.rejects(()=>c.reserveCredits(owner,'debt','text',10),e=>e.status===402);
await c.reserveAIBudget(9e6);await assert.rejects(()=>c.reserveAIBudget(2e6),e=>e.status===429);
sqlite.prepare("INSERT INTO providers (owner,config) VALUES ('__fivegen_platform__',?)").run(JSON.stringify({paused:true,dailyBudget:100}));await assert.rejects(()=>c.reserveAIBudget(1),e=>e.status===503);
assert.equal(commissionAmount(4900,'free'),245);assert.equal(commissionAmount(4900,'pro'),245);assert.equal(commissionAmount(0,'free'),0);assert.equal(commissionRate('free'),5);
assert.deepEqual(monthlyWindow(Date.UTC(2026,0,31),Date.UTC(2027,0,31),Date.UTC(2026,1,28)),{start:Date.UTC(2026,1,28),end:Date.UTC(2026,2,31)});
assert.deepEqual(monthlyWindow(Date.UTC(2024,0,31),Date.UTC(2025,0,31),Date.UTC(2024,1,29)),{start:Date.UTC(2024,1,29),end:Date.UTC(2024,2,31)});

const quotaOwner='monthly-owner',now=Date.UTC(2026,8,15),jobs=['p1','p2','p3','p4','p5'];
for(const product of jobs)sqlite.prepare("INSERT INTO generation (product_id,owner,brief,lease,updated_at) VALUES (?,?,'{}',?,?)").run(product,quotaOwner,now+180000,now);
const claimed=await Promise.allSettled(jobs.slice(0,4).map(p=>a.claimProductRun(quotaOwner,p,null,false,now)));
assert.equal(claimed.filter(x=>x.status==='fulfilled').length,3,'Concurrent jobs cannot exceed three included products');
assert.equal(claimed.filter(x=>x.status==='rejected'&&x.reason.status===402).length,1);
const runs=claimed.filter(x=>x.status==='fulfilled').map(x=>x.value);
for(const run of runs)sqlite.prepare("UPDATE ai_product_runs SET state='active' WHERE id=?").run(run.id);
const used=(await a.productAllowance(quotaOwner,now));assert.equal(used.remaining,0);
const saved=sqlite.prepare('SELECT product_id FROM ai_product_runs WHERE id=?').get(runs[0].id);
assert.equal((await a.claimProductRun(quotaOwner,saved.product_id,runs[0].id,false,now)).id,runs[0].id,'Resume consumes no extra run');
await a.releaseUnstartedRun(runs[0].id);assert.equal((await a.productAllowance(quotaOwner,now)).used,3,'Completed output cannot be returned by cancelling');
const paid=await a.claimProductRun(quotaOwner,'p4',null,true,now);assert.equal(paid.mode,'credits');
await assert.rejects(()=>a.claimProductRun(quotaOwner,'p4',paid.id,false,now),e=>e.status===402);
await a.releaseUnstartedRun(paid.id);
const nextMonth=Date.UTC(2026,9,1);assert.equal((await a.productAllowance(quotaOwner,nextMonth)).remaining,3,'UTC rollover resets allowance');
assert.equal((await a.claimProductRun(quotaOwner,saved.product_id,runs[0].id,false,nextMonth)).id,runs[0].id,'A previous-month run stays included');
sqlite.prepare('UPDATE generation SET lease=? WHERE product_id=?').run(nextMonth+180000,'p5');
const failed=await a.claimProductRun(quotaOwner,'p5',null,false,nextMonth);await a.releaseUnstartedRun(failed.id);
assert.equal((await a.productAllowance(quotaOwner,nextMonth)).remaining,3,'Failure before outline returns allowance');
const crash=await a.claimProductRun(quotaOwner,'p5',null,false,nextMonth);sqlite.prepare('UPDATE generation SET lease=0 WHERE product_id=?').run('p5');
assert.equal((await a.productAllowance(quotaOwner,nextMonth)).remaining,3,'Expired unstarted leases recover allowance');
sqlite.close();delete globalThis.__creditTest;
console.log('Passed: actual credit SQL, concurrent spending, idempotent refunds/top-ups, refund and dispute reversals, monthly product quota, concurrent claims, retries, UTC rollover, crash recovery, no plan grants, budget cap, fee rounding, and leap-month windows.');
