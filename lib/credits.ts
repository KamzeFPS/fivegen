import {ApiError,binding,database,stripe} from "./server";
import {creditPacks,type CreditBalance} from "./credit-policy";
import {productAllowance} from "./product-allowance";
import {mcpCreditLimit} from "./mcp-context";
import {subscriptionCreditBalance,spendableGrant} from './subscription-credits';
import {hasUnlimitedGeneration} from './generation-access';

export async function creditBalance(owner:string):Promise<CreditBalance>{
  const db=database();
  await db.prepare("INSERT OR IGNORE INTO wallets (owner,starter) VALUES (?,0)").bind(owner).run();
  const w=(await db.prepare("SELECT purchased FROM wallets WHERE owner=?").bind(owner).first())!;
  const purchased=Number(w.purchased);
  const subscription=await subscriptionCreditBalance(owner);
  const products=await productAllowance(owner);
  return {unlimited:!!products.unlimited,starter:0,...subscription,purchased,total:purchased+subscription.included,media:Math.max(0,purchased+subscription.included),products};
}

// The ledger claim, balance deduction, and state transition commit atomically in D1.
export async function reserveCredits(owner:string,id:string,operation:string,cost:number){
  if(!Number.isSafeInteger(cost)||cost<1)throw new Error("Invalid credit cost");
  if(await hasUnlimitedGeneration(owner)){
    const db=database();
    await db.prepare("INSERT OR IGNORE INTO credit_usage (id,owner,operation,cost,state,starter_used,included_used,purchased_used,cycle,created_at) VALUES (?,?,?,0,'reserved',0,0,0,'unlimited',?)").bind(id,owner,operation,Date.now()).run();
    const usage=await db.prepare('SELECT owner,operation,cost,state,cycle FROM credit_usage WHERE id=?').bind(id).first();
    if(usage?.owner!==owner||usage.operation!==operation||usage.cost!==0||usage.cycle!=='unlimited'||usage.state!=='reserved')throw new ApiError('This generation request has already been processed.',409);
    return;
  }
  const limit=mcpCreditLimit.getStore();
  if(limit){if(cost>limit.remaining)throw new ApiError("This generation exceeds the credit limit approved for this MCP call.",402);limit.remaining-=cost;}
  if(!Number.isSafeInteger(cost)||cost<1)throw new Error("Invalid credit cost");
  const balance=await creditBalance(owner);
  const db=database(),text=operation==="text",now=Date.now();
  const eligible=`g.owner=wallets.owner AND g.environment='production' AND ${spendableGrant(now)}`;
  const available=`(SELECT COALESCE(SUM(g.remaining),0) FROM subscription_credit_grants g WHERE ${eligible})`;
  const positive=`(SELECT COALESCE(SUM(max(0,g.remaining)),0) FROM subscription_credit_grants g WHERE ${eligible})`;
  const iu=`min(${positive},${cost})`,pu=`max(0,${cost}-(${iu}))`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO credit_usage (id,owner,operation,cost,state,starter_used,included_used,purchased_used,cycle,created_at) SELECT ?,owner,?,?,'pending',0,${iu},${pu},'subscription-grants',? FROM wallets WHERE owner=? AND ${available}+purchased>=?`).bind(id,operation,cost,now,owner,cost),
    db.prepare(`INSERT OR IGNORE INTO credit_usage_grants (id,usage_id,grant_id,amount)
      SELECT ?||':'||id,?,id,min(remaining,max(0,?-preceding)) FROM
      (SELECT g.id,g.remaining,COALESCE(SUM(g.remaining) OVER (ORDER BY g.expires_at,g.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) preceding FROM subscription_credit_grants g WHERE g.owner=? AND g.environment='production' AND g.remaining>0 AND ${spendableGrant(now)})
      WHERE preceding<? AND EXISTS(SELECT 1 FROM credit_usage WHERE id=? AND owner=? AND state='pending')`).bind(id,id,cost,owner,cost,id,owner),
    db.prepare("UPDATE subscription_credit_grants SET remaining=remaining-(SELECT amount FROM credit_usage_grants WHERE usage_id=? AND grant_id=subscription_credit_grants.id) WHERE id IN (SELECT grant_id FROM credit_usage_grants WHERE usage_id=?) AND EXISTS(SELECT 1 FROM credit_usage WHERE id=? AND state='pending')").bind(id,id,id),
    db.prepare("UPDATE wallets SET purchased=purchased-(SELECT purchased_used FROM credit_usage WHERE id=?) WHERE owner=? AND EXISTS(SELECT 1 FROM credit_usage WHERE id=? AND owner=? AND state='pending')").bind(id,owner,id,owner),
    db.prepare("UPDATE credit_usage SET state='reserved' WHERE id=? AND owner=? AND state='pending'").bind(id,owner),
  ]);
  const usage=await db.prepare("SELECT state,owner,cost FROM credit_usage WHERE id=?").bind(id).first();
  if(!usage)throw new ApiError(`You need ${cost} ${text?"AI":"image/video"} credits. Add credits in AI & credits.`,402);
  if(usage.owner!==owner||usage.cost!==cost||usage.state!=="reserved")throw new ApiError("This generation request has already been processed.",409);
}
export async function completeCredits(id:string){await database().prepare("UPDATE credit_usage SET state='completed' WHERE id=? AND state='reserved'").bind(id).run();}
export async function refundCredits(id:string){
  const db=database();
  await db.batch([
    db.prepare("UPDATE subscription_credit_grants SET remaining=remaining+(SELECT amount FROM credit_usage_grants WHERE usage_id=? AND grant_id=subscription_credit_grants.id) WHERE id IN (SELECT grant_id FROM credit_usage_grants WHERE usage_id=?) AND EXISTS(SELECT 1 FROM credit_usage WHERE id=? AND state='reserved')").bind(id,id,id),
    db.prepare("UPDATE wallets SET starter=starter+(SELECT starter_used FROM credit_usage WHERE id=?),included=included+CASE WHEN cycle=(SELECT cycle FROM credit_usage WHERE id=?) THEN (SELECT included_used FROM credit_usage WHERE id=?) ELSE 0 END,purchased=purchased+(SELECT purchased_used FROM credit_usage WHERE id=?) WHERE owner=(SELECT owner FROM credit_usage WHERE id=? AND state='reserved')").bind(id,id,id,id,id),
    db.prepare("UPDATE credit_usage SET state='refunded' WHERE id=? AND state='reserved'").bind(id),
  ]);
}
// A conservative daily cost ceiling includes failed calls; it is not a provider invoice.
export async function reserveAIBudget(micros:number,owner?:string){
  const db=database(),row=await db.prepare("SELECT config FROM providers WHERE owner='__fivegen_platform__'").first();
  const config=JSON.parse(String(row?.config||"{}"));
  if(config.paused)throw new ApiError("AI generation is temporarily paused. Your work and credits are safe.",503);
  const limit=Number(config.dailyBudget??binding("AI_DAILY_BUDGET_USD"))||10;
  const day=new Date().toISOString().slice(0,10);
  await db.prepare("INSERT OR IGNORE INTO ai_budget (day) VALUES (?)").bind(day).run();
  if(owner&&await hasUnlimitedGeneration(owner)){
    await db.prepare('UPDATE ai_budget SET reserved_micros=reserved_micros+? WHERE day=?').bind(micros,day).run();
    return;
  }
  const result=await db.prepare("UPDATE ai_budget SET reserved_micros=reserved_micros+? WHERE day=? AND reserved_micros+?<=?").bind(micros,day,micros,Math.round(limit*1e6)).run();
  if(!result.meta.changes)throw new ApiError("Today's AI capacity has been reached. Please try again tomorrow. Credits have not been spent.",429);
}
export async function recordCreditPurchase(session:Record<string,any>){
  if(session.metadata?.purpose!=="fivegen_credits")return;
  const pack=creditPacks.find(p=>p.id===session.metadata.pack);
  if(!pack||!session.metadata.owner||session.mode!=="payment"||session.payment_status!=="paid"||session.currency!=="usd"||session.amount_total!==pack.cents)throw new ApiError("Credit purchase could not be verified.",409);
  const owner=String(session.metadata.owner),db=database();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO wallets (owner,starter) VALUES (?,0)").bind(owner),
    db.prepare("INSERT OR IGNORE INTO credit_purchases (id,owner,credits,amount,payment_intent,state,created_at) VALUES (?,?,?,?,?,'pending',?)").bind(session.id,owner,pack.credits,pack.cents,String(session.payment_intent),Date.now()),
    db.prepare("UPDATE wallets SET purchased=purchased+? WHERE owner=? AND EXISTS(SELECT 1 FROM credit_purchases WHERE id=? AND state='pending')").bind(pack.credits,owner,session.id),
    db.prepare("UPDATE credit_purchases SET state='paid' WHERE id=? AND state='pending'").bind(session.id),
  ]);
}
export async function reconcileCredits(owner:string,sessionId:string){
  if(!/^cs_[\w]+$/.test(sessionId))throw new ApiError("Invalid checkout reference.");
  const s=await stripe(`checkout/sessions/${sessionId}`);
  if(s.metadata?.owner!==owner||s.metadata?.purpose!=="fivegen_credits")throw new ApiError("This credit purchase belongs to another account.",403);
  await recordCreditPurchase(s);
}
export async function reverseCreditPurchase(chargeId:string){
  const charge=await stripe(`charges/${chargeId}?expand[]=dispute`),db=database();
  const purchase=await db.prepare("SELECT * FROM credit_purchases WHERE payment_intent=?").bind(String(charge.payment_intent)).first();
  if(!purchase){
    if(!charge.payment_intent)return;
    const intent=await stripe(`payment_intents/${charge.payment_intent}`);
    if(intent.metadata?.purpose==="fivegen_credits")throw new ApiError("Waiting for the credit purchase record.",409);
    return;
  }
  const disputed=charge.dispute&&charge.dispute.status!=="won"&&charge.dispute.status!=="warning_closed";
  const target=disputed?Number(purchase.credits):Math.min(Number(purchase.credits),Math.ceil(Number(purchase.credits)*Number(charge.amount_refunded||0)/Number(purchase.amount)));
  await db.batch([
    db.prepare("UPDATE wallets SET purchased=purchased-(?- (SELECT reversed FROM credit_purchases WHERE id=?)) WHERE owner=?").bind(target,purchase.id,purchase.owner),
    db.prepare("UPDATE credit_purchases SET reversed=? WHERE id=?").bind(target,purchase.id),
  ]);
}
