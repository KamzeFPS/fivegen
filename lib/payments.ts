import { ApiError, database, stripe } from "./server";
import type { OfferProduct } from "./commerce";
import {commissionAmount,commissionRate} from "./credit-policy";
import {planFor} from "./billing";
export type PurchasedItem=OfferProduct & {amount:number};
export function orderItems(order:Record<string,unknown>):PurchasedItem[]{try{return JSON.parse(String(order.items||"[]"));}catch{return [];}}
async function insertOrder(id:string,intent:Record<string,unknown>,email:string,provider:string,subscriptionId:string|null=null,customerId:string|null=null){
  const token=crypto.randomUUID()+crypto.randomUUID();
  await database().prepare("INSERT OR IGNORE INTO orders (id,product_id,owner,email,amount,platform_fee,provider,token,items,subscription_id,customer_id,stripe_account,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,intent.product_id,intent.owner,email,intent.amount,intent.platform_fee||0,provider,token,intent.items||"[]",subscriptionId,customerId,intent.account||null,Date.now()).run();
  return (await database().prepare("SELECT * FROM orders WHERE id=?").bind(id).first())!;
}
export async function recordFreeOrder(ref:string){
  const intent=await database().prepare("SELECT * FROM checkout_intents WHERE id=?").bind(ref).first();
  if(!intent||intent.amount!==0||intent.mode!=="payment")throw new ApiError("This offer requires payment.",403);
  return insertOrder(`free_${ref}`,intent,"Free download","free");
}
export async function recordPayment(
  session: Record<string, any>,
  account: string,
) {
  if(session.metadata?.order_ref){
    const intent=await database().prepare("SELECT * FROM checkout_intents WHERE id=?").bind(session.metadata.order_ref).first();
    if(!intent||intent.account!==account||intent.owner!==session.metadata.owner||intent.product_id!==session.metadata.product_id||(intent.session_id&&intent.session_id!==session.id))throw new ApiError("Payment could not be matched to this offer.",403);
    if(session.payment_status!=="paid"||session.currency!=="usd"||session.mode!==intent.mode||Number(session.amount_total)!==Number(intent.amount))throw new ApiError("Payment has not completed or its amount could not be verified.",409);
    return insertOrder(session.id,intent,session.customer_details?.email||"customer","stripe",session.subscription?String(session.subscription):null,session.customer?String(session.customer):null);
  }
  if (
    session.payment_status !== "paid" ||
    session.mode !== "payment" ||
    session.currency !== "usd"
  )
    throw new ApiError("Payment has not completed yet.", 409);
  const p = await database()
    .prepare(
      "SELECT p.id,p.owner,s.stripe_account FROM products p JOIN sellers s ON p.owner=s.owner WHERE p.id=?",
    )
    .bind(session.metadata?.product_id || "")
    .first();
  if (!p || p.stripe_account !== account || p.owner !== session.metadata?.owner)
    throw new ApiError("Payment could not be matched to this product.", 403);
  const amount = Number(session.amount_total);
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    amount !== Number(session.metadata?.expected_amount)
  )
    throw new ApiError("The payment amount could not be verified.", 409);
  const token = crypto.randomUUID() + crypto.randomUUID();
  await database()
    .prepare(
      "INSERT OR IGNORE INTO orders (id,product_id,owner,email,amount,provider,token,created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .bind(
      session.id,
      p.id,
      p.owner,
      session.customer_details?.email || "customer",
      amount,
      "stripe",
      token,
      Date.now(),
    )
    .run();
  return database()
    .prepare("SELECT token FROM orders WHERE id=?")
    .bind(session.id)
    .first<{ token: string }>();
}
export async function assertSubscriptionAccess(order:Record<string,unknown>){
  if(!order.subscription_id)return;
  const sub=await stripe(`subscriptions/${order.subscription_id}`,undefined,String(order.stripe_account));
  const end=Number(sub.items?.data?.[0]?.current_period_end||sub.current_period_end||0)*1000;
  if(!["active","trialing"].includes(sub.status)||end<=Date.now())throw new ApiError("Your subscription is not active. Manage billing to restore access.",403);
}
export async function recordRenewal(invoice:Record<string,any>,account:string){
  if(invoice.billing_reason==="subscription_create"||invoice.status!=="paid"||invoice.currency!=="usd")return;
  const subId=invoice.parent?.subscription_details?.subscription||invoice.subscription;
  if(!subId)return;
  const original=await database().prepare("SELECT * FROM orders WHERE subscription_id=? AND stripe_account=? ORDER BY created_at LIMIT 1").bind(String(subId),account).first();
  if(!original){
    const subscription=await stripe(`subscriptions/${subId}`,undefined,account);
    // Connected accounts may also sell subscriptions outside FiveGen.
    if(!subscription.metadata?.order_ref||!subscription.metadata?.product_id)return;
    throw new ApiError("The initial subscription order has not arrived yet.",409);
  }
  const amount=Number(invoice.amount_paid);if(!Number.isSafeInteger(amount)||amount<0)throw new ApiError("Invalid invoice amount.");
  await insertOrder(String(invoice.id),{...original,amount,account,platform_fee:Number(invoice.application_fee_amount||0)},String(original.email),"stripe",String(subId),String(original.customer_id));
}
export async function updateRenewalCommission(invoice:Record<string,any>,account:string){
  if(invoice.status!=="draft"||invoice.billing_reason==="subscription_create")return;
  const subId=invoice.parent?.subscription_details?.subscription||invoice.subscription;
  if(!subId)return;
  const subscription=await stripe(`subscriptions/${subId}`,undefined,account);
  const owner=subscription.metadata?.owner;if(!owner||!subscription.metadata?.order_ref)return;
  const seller=await database().prepare("SELECT stripe_account FROM sellers WHERE owner=?").bind(owner).first();
  if(seller?.stripe_account!==account)throw new ApiError("Subscription account mismatch.",403);
  const plan=await planFor(owner);
  await stripe(`subscriptions/${subId}`,new URLSearchParams({application_fee_percent:String(commissionRate(plan.tier))}),account);
  await stripe(`invoices/${invoice.id}`,new URLSearchParams({application_fee_amount:String(commissionAmount(Math.max(0,Number(invoice.total)||0),plan.tier))}),account);
}
