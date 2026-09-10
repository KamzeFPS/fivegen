import {ApiError,binding,database,stripe} from "./server";
import {creditPacks,creditPolicy,monthlyWindow,type CreditBalance} from "./credit-policy";
import {mcpCreditLimit} from "./mcp-context";

export async function creditBalance(owner:string):Promise<CreditBalance>{
  const db=database();
  await db.prepare("INSERT OR IGNORE INTO wallets (owner) VALUES (?)").bind(owner).run();
  const membership=await db.prepare("SELECT * FROM memberships WHERE owner=?").bind(owner).first();
  const active=membership?.status==="active"&&Number(membership.period_end)*1000>Date.now();
  if(active){
    const end=Number(membership!.period_end)*1000;
    const fallback=new Date(end);fallback.setUTCMonth(fallback.getUTCMonth()-(membership!.interval==="year"?12:1));
    const window=monthlyWindow(Number(membership!.period_start)*1000||fallback.getTime(),end);
    const cycle=`${membership!.subscription_id}:${window.start}`;
    await db.prepare("UPDATE wallets SET included=?,cycle=?,expires=? WHERE owner=? AND cycle<>? AND expires<=?")
      .bind(creditPolicy.monthly,cycle,window.end,owner,cycle,window.start).run();
  }
  const w=(await db.prepare("SELECT * FROM wallets WHERE owner=?").bind(owner).first())!;
  const included=active&&Number(w.expires)>Date.now()?Number(w.included):0;
  return {starter:Number(w.starter),included,purchased:Number(w.purchased),total:Number(w.starter)+included+Number(w.purchased),media:included+Number(w.purchased),renewsAt:active?Number(w.expires):null};
}

// The ledger claim, balance deduction, and state transition commit atomically in D1.
export async function reserveCredits(owner:string,id:string,operation:string,cost:number){
  const limit=mcpCreditLimit.getStore();
  if(limit){if(cost>limit.remaining)throw new ApiError("This generation exceeds the credit limit approved for this MCP call.",402);limit.remaining-=cost;}
  if(!Number.isSafeInteger(cost)||cost<1)throw new Error("Invalid credit cost");
  const balance=await creditBalance(owner);
  const db=database(),text=operation==="text",now=Date.now();
  const allowIncluded=balance.included>0;
  const starter=text?"starter":"0",included=allowIncluded?`CASE WHEN expires>${now} THEN included ELSE 0 END`:"0";
  // Spend expiring monthly credits before the non-expiring starter/purchased balance.
  const iu=`min(${included},${cost})`,su=`min(${starter},max(0,${cost}-(${iu})))`,pu=`max(0,${cost}-(${su})-(${iu}))`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO credit_usage (id,owner,operation,cost,state,starter_used,included_used,purchased_used,cycle,created_at) SELECT ?,owner,?,?,'pending',${su},${iu},${pu},cycle,? FROM wallets WHERE owner=? AND purchased>=0 AND (${starter})+(${included})+purchased>=?`).bind(id,operation,cost,now,owner,cost),
    db.prepare("UPDATE wallets SET starter=starter-(SELECT starter_used FROM credit_usage WHERE id=?),included=included-(SELECT included_used FROM credit_usage WHERE id=?),purchased=purchased-(SELECT purchased_used FROM credit_usage WHERE id=?) WHERE owner=? AND EXISTS(SELECT 1 FROM credit_usage WHERE id=? AND owner=? AND state='pending')").bind(id,id,id,owner,id,owner),
    db.prepare("UPDATE credit_usage SET state='reserved' WHERE id=? AND owner=? AND state='pending'").bind(id,owner),
  ]);
  const usage=await db.prepare("SELECT state,owner,cost FROM credit_usage WHERE id=?").bind(id).first();
  if(!usage)throw new ApiError(`You need ${cost} ${text?"AI":"image/video"} credits. Add credits in Plan & billing or choose Pro.`,402);
  if(usage.owner!==owner||usage.cost!==cost||usage.state!=="reserved")throw new ApiError("This generation request has already been processed.",409);
}
export async function completeCredits(id:string){await database().prepare("UPDATE credit_usage SET state='completed' WHERE id=? AND state='reserved'").bind(id).run();}
export async function refundCredits(id:string){
  const db=database();
  await db.batch([
    db.prepare("UPDATE wallets SET starter=starter+(SELECT starter_used FROM credit_usage WHERE id=?),included=included+CASE WHEN cycle=(SELECT cycle FROM credit_usage WHERE id=?) THEN (SELECT included_used FROM credit_usage WHERE id=?) ELSE 0 END,purchased=purchased+(SELECT purchased_used FROM credit_usage WHERE id=?) WHERE owner=(SELECT owner FROM credit_usage WHERE id=? AND state='reserved')").bind(id,id,id,id,id),
    db.prepare("UPDATE credit_usage SET state='refunded' WHERE id=? AND state='reserved'").bind(id),
  ]);
}
// A conservative daily cost ceiling includes failed calls; it is not a provider invoice.
export async function reserveAIBudget(micros:number){
  const db=database(),row=await db.prepare("SELECT config FROM providers WHERE owner='__fivegen_platform__'").first();
  const config=JSON.parse(String(row?.config||"{}"));
  if(config.paused)throw new ApiError("AI generation is temporarily paused. Your work and credits are safe.",503);
  const limit=Number(config.dailyBudget??binding("AI_DAILY_BUDGET_USD"))||10;
  const day=new Date().toISOString().slice(0,10);
  await db.prepare("INSERT OR IGNORE INTO ai_budget (day) VALUES (?)").bind(day).run();
  const result=await db.prepare("UPDATE ai_budget SET reserved_micros=reserved_micros+? WHERE day=? AND reserved_micros+?<=?").bind(micros,day,micros,Math.round(limit*1e6)).run();
  if(!result.meta.changes)throw new ApiError("Today's AI capacity has been reached. Please try again tomorrow. Credits have not been spent.",429);
}
export async function recordCreditPurchase(session:Record<string,any>){
  if(session.metadata?.purpose!=="fivegen_credits")return;
  const pack=creditPacks.find(p=>p.id===session.metadata.pack);
  if(!pack||!session.metadata.owner||session.mode!=="payment"||session.payment_status!=="paid"||session.currency!=="usd"||session.amount_total!==pack.cents)throw new ApiError("Credit purchase could not be verified.",409);
  const owner=String(session.metadata.owner),db=database();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO wallets (owner) VALUES (?)").bind(owner),
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
