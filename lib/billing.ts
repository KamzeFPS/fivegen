import { ApiError, binding, database, stripe } from "./server";
import { plans, type PlanInfo } from "./plans";

export async function planFor(owner:string):Promise<PlanInfo>{
  const db=database();
  const [row,count]=await Promise.all([
    db.prepare("SELECT * FROM memberships WHERE owner=?").bind(owner).first(),
    db.prepare("SELECT COUNT(*) as n FROM products WHERE owner=?").bind(owner).first<{n:number}>(),
  ]);
  const active=!!row && ["active","trialing"].includes(String(row.status)) && Number(row.period_end)*1000>Date.now();
  const tier=active?"pro":"free";
  return {tier,limit:plans[tier].limit,used:count?.n||0,status:String(row?.status||"free"),interval:row?.interval as "month"|"year"|null||null,renewsAt:row?.period_end?Number(row.period_end)*1000:null,cancelAtPeriodEnd:!!row?.cancel_at_period_end,billingReady:!!binding("STRIPE_SECRET_KEY")&&!!binding("STRIPE_BILLING_WEBHOOK_SECRET"),hasCustomer:!!row?.customer_id};
}
export async function requirePro(owner:string){const p=await planFor(owner);if(p.tier!=="pro")throw new ApiError("Upgrade to FiveGen Pro to use deals, upsells, funnels, and subscriptions.",403);return p;}
export async function syncMembership(subscription:Record<string,any>){
  if(subscription.metadata?.purpose!=="fivegen_pro" || !subscription.metadata?.owner) return;
  const owner=String(subscription.metadata.owner);
  const existing=await database().prepare("SELECT subscription_id FROM memberships WHERE owner=?").bind(owner).first();
  // Ignore cancellation events for an older subscription after a replacement.
  if(existing?.subscription_id && existing.subscription_id!==subscription.id && !["active","trialing"].includes(subscription.status))return;
  const item=subscription.items?.data?.[0];
  const end=Number(item?.current_period_end||subscription.current_period_end||0);
  await database().prepare("INSERT INTO memberships (owner,customer_id,subscription_id,status,interval,period_start,period_end,cancel_at_period_end,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,status=excluded.status,interval=excluded.interval,period_start=excluded.period_start,period_end=excluded.period_end,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=excluded.updated_at")
    .bind(owner,String(subscription.customer),subscription.id,subscription.status,item?.price?.recurring?.interval||"month",Number(item?.current_period_start||subscription.current_period_start||subscription.start_date||0),end,subscription.cancel_at_period_end?1:0,Date.now()).run();
}
export async function reconcileMembership(owner:string,sessionId:string){
  if(!/^cs_[a-zA-Z0-9_]+$/.test(sessionId))throw new ApiError("Invalid billing reference.");
  const session=await stripe(`checkout/sessions/${sessionId}`);
  if(session.metadata?.owner!==owner||session.metadata?.purpose!=="fivegen_pro"||!session.subscription)throw new ApiError("This subscription belongs to a different account.",403);
  if(session.payment_status!=="paid")throw new ApiError("Your subscription payment is still processing. Please refresh shortly.",409);
  const sub=await stripe(`subscriptions/${session.subscription}`);await syncMembership(sub);
}
