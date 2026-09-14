import {ApiError,database} from './server';
import {creditPolicy} from './credit-policy';
import {hasUnlimitedGeneration} from './generation-access';

export function calendarMonth(now=Date.now()) {
  const date=new Date(now);
  return {period:date.toISOString().slice(0,7),resetsAt:Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)};
}
export async function productAllowance(owner:string,now=Date.now()) {
  const db=database(),{period,resetsAt}=calendarMonth(now);
  // Recover a process that stopped before producing any usable outline.
  await db.prepare("UPDATE ai_product_runs SET state='released' WHERE owner=? AND state='reserved' AND NOT EXISTS (SELECT 1 FROM generation g WHERE g.run_id=ai_product_runs.id AND g.lease>?)").bind(owner,now).run();
  const row=await db.prepare("SELECT COUNT(*) n FROM ai_product_runs WHERE owner=? AND period=? AND mode='included' AND state<>'released'").bind(owner,period).first<{n:number}>();
  const used=row?.n||0,limit=creditPolicy.productsPerMonth;
  return {unlimited:await hasUnlimitedGeneration(owner),used,remaining:Math.max(0,limit-used),limit,resetsAt};
}
// Called only after acquiring the product generation lease. The conditional
// insert serializes the monthly allowance across simultaneous product jobs.
export async function claimProductRun(owner:string,productId:string,runId:string|null,allowCredits:boolean,now=Date.now()) {
  const db=database();
  if(await hasUnlimitedGeneration(owner)){
    if(runId){const existing=await db.prepare("SELECT id,state FROM ai_product_runs WHERE id=? AND owner=? AND product_id=? AND state<>'released'").bind(runId,owner,productId).first<{id:string;state:string}>();if(existing){await db.prepare("UPDATE ai_product_runs SET mode='unlimited' WHERE id=? AND owner=?").bind(runId,owner).run();return {...existing,mode:'unlimited'};}}
    const id=crypto.randomUUID(),{period}=calendarMonth(now);
    await db.batch([
      db.prepare("INSERT INTO ai_product_runs (id,owner,product_id,period,mode,state,created_at) VALUES (?,?,?,?,'unlimited','reserved',?)").bind(id,owner,productId,period,now),
      db.prepare('UPDATE generation SET run_id=? WHERE product_id=? AND owner=?').bind(id,productId,owner),
    ]);
    return {id,mode:'unlimited',state:'reserved'};
  }
  if(runId){const existing=await db.prepare("SELECT id,mode,state FROM ai_product_runs WHERE id=? AND owner=? AND product_id=? AND state<>'released'").bind(runId,owner,productId).first<{id:string;mode:string;state:string}>();if(existing){if(existing.mode==='credits'&&!allowCredits)throw new ApiError('Confirm credit use to continue this product.',402);return existing;}}
  await productAllowance(owner,now);
  const id=crypto.randomUUID(),{period}=calendarMonth(now);
  await db.batch([
    db.prepare("INSERT INTO ai_product_runs (id,owner,product_id,period,mode,state,created_at) SELECT ?,?,?,?,'included','reserved',? WHERE (SELECT COUNT(*) FROM ai_product_runs WHERE owner=? AND period=? AND mode='included' AND state<>'released')<?").bind(id,owner,productId,period,now,owner,period,creditPolicy.productsPerMonth),
    db.prepare("UPDATE generation SET run_id=? WHERE product_id=? AND owner=? AND EXISTS(SELECT 1 FROM ai_product_runs WHERE id=?)").bind(id,productId,owner,id),
  ]);
  let run=await db.prepare("SELECT id,mode,state FROM ai_product_runs WHERE id=?").bind(id).first<{id:string;mode:string;state:string}>();
  if(!run){
    if(!allowCredits)throw new ApiError('Your 3 included AI products for this month have been used. Confirm credit use to create another, or write a free manual draft.',402);
    await db.batch([
      db.prepare("INSERT INTO ai_product_runs (id,owner,product_id,period,mode,state,created_at) VALUES (?,?,?,?,'credits','reserved',?)").bind(id,owner,productId,period,now),
      db.prepare("UPDATE generation SET run_id=? WHERE product_id=? AND owner=?").bind(id,productId,owner),
    ]);
    run={id,mode:'credits',state:'reserved'};
  }
  return run;
}
export async function releaseUnstartedRun(id:string) {
  await database().prepare("UPDATE ai_product_runs SET state='released' WHERE id=? AND state='reserved'").bind(id).run();
}
