import type Stripe from 'stripe';
import {ApiError, binding, database} from './server';
import {walletCatalog} from './wallet-catalog';
import {assertWalletCheckout, walletEnvironment, walletObjectId, walletStripe} from './wallet-stripe';
import {refreshSubscriptionCredits, subscriptionCreditBalance} from './subscription-credits';

type Intent={id:string;owner:string;environment:string;offer_id:string;email:string;amount:number;credits:number;billing_interval:'month'|'year'|null;session_id:string|null;status:string;created_at:number};
const purpose='fivegen_wallet';
const paidStatuses="'active','trialing','past_due','paused','unpaid','incomplete'";
async function intentById(id:string) {
  return database().prepare('SELECT * FROM wallet_checkout_intents WHERE id=? AND environment=?').bind(id,walletEnvironment()).first<Intent>();
}
function assertMode(live:boolean) {if(live!==(walletEnvironment()==='production'))throw new ApiError('Payment environment mismatch.',400);}
async function ownedCustomer(owner:string,email:string) {
  const db=database(),environment=walletEnvironment(),key=`${environment}:${owner}`;
  const row=await db.prepare('SELECT customer_id FROM wallet_customers WHERE key=?').bind(key).first<{customer_id:string}>();
  if(row)return row.customer_id;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
  const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  const customer=await walletStripe().customers.create({email,metadata:{purpose}},{idempotencyKey:`fivegen-wallet-customer:${hash}`});
  await db.prepare('INSERT OR IGNORE INTO wallet_customers (key,owner,environment,customer_id) VALUES (?,?,?,?)').bind(key,owner,environment,customer.id).run();
  return (await db.prepare('SELECT customer_id FROM wallet_customers WHERE key=?').bind(key).first<{customer_id:string}>())!.customer_id;
}

export async function createWalletCheckout(owner:string,email:string,offerId:string,origin:string) {
  const config=assertWalletCheckout(),sdk=walletStripe(),db=database();
  const offer=walletCatalog().find(o=>o.id===offerId);
  if(!offer)throw new ApiError('Choose an available credit pack or subscription.');
  if(config.environment==='production'&&!(await sdk.accounts.retrieve(null)).charges_enabled)throw new ApiError('Wallet payments are not available yet. Your account has not been charged.',503);
  const existing=await db.prepare("SELECT * FROM wallet_checkout_intents WHERE owner=? AND environment=? AND status='open'").bind(owner,config.environment).first<Intent>();
  if(existing){
    if(existing.session_id){
      const session=await sdk.checkout.sessions.retrieve(existing.session_id);
      if(session.status==='complete'){
        await fulfillWalletSession(session.id);
        throw new ApiError('Your previous purchase is complete. View Billing & receipts before making another purchase.',409);
      }
      if(session.status==='expired')await db.prepare("UPDATE wallet_checkout_intents SET status='expired' WHERE id=?").bind(existing.id).run();
      else if(existing.offer_id===offerId)return {clientSecret:session.client_secret!,sessionId:session.id};
      else if((await closeWalletCheckout(owner,session.id)).completed)throw new ApiError('Your previous purchase is complete. View Billing & receipts.',409);
    } else if(existing.offer_id!==offerId)throw new ApiError('Another checkout is being prepared. Try again in a moment.',409);
  }
  if(offer.interval){
    const [current,previous]=await Promise.all([
      db.prepare(`SELECT subscription_id FROM wallet_subscriptions WHERE owner=? AND environment=? AND status IN (${paidStatuses}) LIMIT 1`).bind(owner,config.environment).first(),
      db.prepare(`SELECT s.subscription_id FROM paddle_subscriptions s JOIN paddle_customers c ON c.customer_id=s.customer_id AND c.environment=s.environment WHERE c.owner=? AND s.environment=? AND s.status IN (${paidStatuses}) LIMIT 1`).bind(owner,config.environment).first(),
    ]);
    if(current||previous)throw new ApiError('You already have a subscription. Manage it in Billing & receipts, or choose a one-time top-up.',409);
  }
  const id=crypto.randomUUID();
  await db.prepare("INSERT OR IGNORE INTO wallet_checkout_intents (id,owner,environment,offer_id,email,amount,credits,billing_interval,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,owner,config.environment,offer.id,email,offer.cents,offer.credits,offer.interval??null,Date.now()).run();
  const intent=(await db.prepare("SELECT * FROM wallet_checkout_intents WHERE owner=? AND environment=? AND status='open'").bind(owner,config.environment).first<Intent>())!;
  if(intent.offer_id!==offerId)throw new ApiError('Another checkout is open. Close it before switching your selection.',409);
  const customer=await ownedCustomer(owner,email);
  const metadata={purpose,fivegen_intent:intent.id};
  // Prices are server-owned. Wallets tokenize cards; no standalone card form is mounted.
  const session=await sdk.checkout.sessions.create({
    ui_mode:'elements',mode:offer.interval?'subscription':'payment',customer,
    payment_method_types:['card'],allow_promotion_codes:false,
    adaptive_pricing:{enabled:false},
    line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:intent.amount,
      product_data:{name:`FiveGen ${offer.name}${offer.interval?'':' credits'}`,metadata:{fivegen_offer:offer.id}},
      ...(offer.interval?{recurring:{interval:offer.interval}}:{})}}],
    metadata,client_reference_id:intent.id,
    ...(offer.interval?{subscription_data:{metadata}}:{payment_intent_data:{metadata},invoice_creation:{enabled:true}}),
    return_url:`${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
  },{idempotencyKey:`fivegen-wallet-checkout:${intent.id}`});
  await db.prepare('UPDATE wallet_checkout_intents SET session_id=? WHERE id=?').bind(session.id,intent.id).run();
  return {clientSecret:session.client_secret!,sessionId:session.id};
}

export async function closeWalletCheckout(owner:string,sessionId:string) {
  const db=database(),row=await db.prepare('SELECT * FROM wallet_checkout_intents WHERE owner=? AND environment=? AND session_id=?').bind(owner,walletEnvironment(),sessionId).first<Intent>();
  if(!row)throw new ApiError('Checkout not found.',404);
  const sdk=walletStripe(),session=await sdk.checkout.sessions.retrieve(sessionId);
  if(session.status==='complete'){await fulfillWalletSession(sessionId);return {completed:true};}
  if(session.status==='open')await sdk.checkout.sessions.expire(sessionId);
  await db.prepare("UPDATE wallet_checkout_intents SET status='expired' WHERE id=?").bind(row.id).run();
  return {completed:false};
}

async function verifySession(session:Stripe.Checkout.Session,intent:Intent) {
  assertMode(session.livemode);
  const customer=await database().prepare('SELECT customer_id FROM wallet_customers WHERE owner=? AND environment=?').bind(intent.owner,intent.environment).first<{customer_id:string}>();
  if(session.id!==intent.session_id||session.metadata?.purpose!==purpose||session.metadata.fivegen_intent!==intent.id||session.client_reference_id!==intent.id||walletObjectId(session.customer)!==customer?.customer_id)throw new ApiError('Checkout identity did not match its purchase record.',400);
  const lines=await walletStripe().checkout.sessions.listLineItems(session.id,{limit:2});
  const item=lines.data[0];
  if(lines.has_more||lines.data.length!==1||item.quantity!==1||item.price?.unit_amount!==intent.amount||item.price.currency!=='usd'||(item.price.recurring?.interval??null)!==intent.billing_interval||session.currency!=='usd'||session.amount_subtotal!==intent.amount||session.total_details?.amount_discount)throw new ApiError('Checkout does not match the selected offer.',400);
  if(session.mode!==(intent.billing_interval?'subscription':'payment'))throw new ApiError('Invalid checkout mode.');
}

export async function syncWalletSubscription(subscriptionId:string,eventTime=Date.now()) {
  const sub=await walletStripe().subscriptions.retrieve(subscriptionId);
  assertMode(sub.livemode);
  if(sub.metadata?.purpose!==purpose)return null;
  const intent=await intentById(sub.metadata.fivegen_intent);
  if(!intent||!intent.billing_interval)throw new ApiError('Subscription purchase record is not available yet.',503);
  const customer=await database().prepare('SELECT customer_id FROM wallet_customers WHERE owner=? AND environment=?').bind(intent.owner,intent.environment).first<{customer_id:string}>();
  if(walletObjectId(sub.customer)!==customer?.customer_id)throw new ApiError('Subscription customer mismatch.',400);
  const item=sub.items.data[0];
  if(sub.items.data.length!==1||item.quantity!==1||item.price.unit_amount!==intent.amount||item.price.currency!=='usd'||item.price.recurring?.interval!==intent.billing_interval)throw new ApiError('Subscription price mismatch.',400);
  await database().prepare(`INSERT INTO wallet_subscriptions (subscription_id,owner,environment,customer_id,intent_id,status,cancel_at,period_end,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(subscription_id) DO UPDATE SET status=excluded.status,cancel_at=excluded.cancel_at,period_end=excluded.period_end,updated_at=excluded.updated_at WHERE excluded.updated_at>=wallet_subscriptions.updated_at`)
    .bind(sub.id,intent.owner,intent.environment,customer.customer_id,intent.id,sub.status,sub.cancel_at?sub.cancel_at*1000:sub.cancel_at_period_end?item.current_period_end*1000:null,item.current_period_end*1000,eventTime).run();
  return {sub,intent};
}

export async function fulfillWalletSession(sessionId:string) {
  const sdk=walletStripe(),session=await sdk.checkout.sessions.retrieve(sessionId);
  if(session.metadata?.purpose!==purpose)return;
  const intent=await intentById(session.metadata.fivegen_intent);
  if(!intent||!intent.session_id)throw new ApiError('Purchase record is not ready. Delivery will retry.',503);
  await verifySession(session,intent);
  if(session.status!=='complete'||session.payment_status!=='paid')return;
  if(intent.billing_interval){
    const subscriptionId=walletObjectId(session.subscription);
    if(!subscriptionId)throw new ApiError('Subscription is not available yet.',503);
    await syncWalletSubscription(subscriptionId);
    const invoiceId=walletObjectId(session.invoice);
    if(!invoiceId)throw new ApiError('Paid invoice is not available yet.',503);
    await fulfillWalletInvoice(invoiceId);
  }else{
    const paymentIntent=walletObjectId(session.payment_intent);
    if(!paymentIntent)throw new ApiError('Payment confirmation is not available yet.',503);
    await saveWalletPayment(intent,session.id,paymentIntent,session.amount_total!,null,null,null);
  }
  await database().prepare("UPDATE wallet_checkout_intents SET status='complete' WHERE id=?").bind(intent.id).run();
}

export async function fulfillWalletInvoice(invoiceId:string) {
  const sdk=walletStripe(),invoice=await sdk.invoices.retrieve(invoiceId,{expand:['payments.data.payment.payment_intent']});
  assertMode(invoice.livemode);
  const subId=walletObjectId(invoice.parent?.subscription_details?.subscription);
  if(!subId)return;
  const synced=await syncWalletSubscription(subId);
  if(!synced)return;
  const {intent}=synced;
  if(invoice.status!=='paid')return;
  if(!intent.session_id)throw new ApiError('Purchase record is not ready.',503);
  await verifySession(await sdk.checkout.sessions.retrieve(intent.session_id),intent);
  const lines=await sdk.invoices.listLineItems(invoice.id,{limit:2});
  const item=lines.data[0];
  // No unreviewed proration, discounts or additional products may fund credits.
  if(lines.has_more||lines.data.length!==1||item.quantity!==1||item.amount!==intent.amount||invoice.currency!=='usd'||invoice.amount_paid<=0||invoice.amount_remaining!==0||!item.period.start||item.period.end<=item.period.start)throw new ApiError('Invoice does not match the subscription allowance.',400);
  const payments=invoice.payments?.data.filter(p=>p.status==='paid')??[];
  const pi=payments.length===1?walletObjectId(payments[0].payment.payment_intent):null;
  if(!pi)throw new ApiError('A verified wallet payment is required for subscription credits.',400);
  await saveWalletPayment(intent,invoice.id,pi,invoice.amount_paid,subId,item.period.start*1000,item.period.end*1000);
}

async function saveWalletPayment(intent:Intent,id:string,paymentIntent:string,amount:number,sub:string|null,start:number|null,end:number|null) {
  const sdk=walletStripe(),pi=await sdk.paymentIntents.retrieve(paymentIntent,{expand:['latest_charge']});
  assertMode(pi.livemode);
  const charge=pi.latest_charge as Stripe.Charge|null;
  if(pi.status!=='succeeded'||pi.currency!=='usd'||pi.amount_received!==amount||!charge||typeof charge==='string'||charge.status!=='succeeded')throw new ApiError('Payment is not settled.',400);
  // Only wallet buttons are exposed at checkout. Honor every settled payment
  // for the issued session, including later off-session card-token renewals
  // whose charge may not retain the initial wallet annotation.
  if(!charge.payment_method_details?.card)throw new ApiError('The card-token payment could not be verified.',400);
  const db=database();
  await db.prepare('INSERT OR IGNORE INTO wallet_payments (id,owner,environment,intent_id,payment_intent,subscription_id,amount,credits,starts_at,ends_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(id,intent.owner,intent.environment,intent.id,paymentIntent,sub,amount,intent.credits,start,end,Date.now()).run();
  await recordWalletCharge(charge.id);
  const table=intent.environment==='production'?'wallets':'wallet_test_balances',column=intent.environment==='production'?'purchased':'credits';
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO ${table} (owner) VALUES (?)`).bind(intent.owner),
    db.prepare(`UPDATE ${table} SET ${column}=${column}+(SELECT credits FROM wallet_payments WHERE id=? AND credited=0 AND subscription_id IS NULL) WHERE owner=? AND EXISTS(SELECT 1 FROM wallet_payments WHERE id=? AND credited=0 AND subscription_id IS NULL)`).bind(id,intent.owner,id),
    db.prepare('UPDATE wallet_payments SET credited=1 WHERE id=?').bind(id),
  ]);
  await reconcileWalletReversals(intent.owner,intent.environment);
  await refreshSubscriptionCredits(intent.owner,intent.environment);
}

export async function recordWalletCharge(chargeId:string,eventTime=Date.now()) {
  const sdk=walletStripe(),charge=await sdk.charges.retrieve(chargeId);
  assertMode(charge.livemode);
  const pi=walletObjectId(charge.payment_intent);
  if(!pi)return;
  let disputed=false;
  if(charge.disputed){const disputes=await sdk.disputes.list({charge:charge.id,limit:100});disputed=disputes.data.some(d=>!['won','warning_closed'].includes(d.status));}
  const reversed=disputed?charge.amount:charge.amount_refunded;
  await database().prepare(`INSERT INTO wallet_charge_state (charge_id,environment,payment_intent,amount,reversed_amount,event_time) VALUES (?,?,?,?,?,?) ON CONFLICT(charge_id) DO UPDATE SET reversed_amount=excluded.reversed_amount,event_time=excluded.event_time WHERE excluded.event_time>=wallet_charge_state.event_time`).bind(charge.id,walletEnvironment(),pi,charge.amount,reversed,eventTime).run();
  const row=await database().prepare('SELECT owner,environment FROM wallet_payments WHERE payment_intent=?').bind(pi).first<{owner:string;environment:string}>();
  if(row){await reconcileWalletReversals(row.owner,row.environment);await refreshSubscriptionCredits(row.owner,row.environment);}
}

export async function reconcileWalletReversals(owner:string,environment:string) {
  const db=database(),table=environment==='production'?'wallets':'wallet_test_balances',column=environment==='production'?'purchased':'credits';
  const target=`min(p.credits,COALESCE((SELECT CAST((p.credits*c.reversed_amount+c.amount-1)/c.amount AS INTEGER) FROM wallet_charge_state c WHERE c.payment_intent=p.payment_intent AND c.environment=p.environment AND c.amount>0),0))`;
  await db.batch([
    db.prepare(`UPDATE ${table} SET ${column}=${column}-(SELECT COALESCE(SUM(${target}-p.reversed),0) FROM wallet_payments p WHERE p.owner=? AND p.environment=? AND p.credited=1 AND p.subscription_id IS NULL) WHERE owner=?`).bind(owner,environment,owner),
    db.prepare(`UPDATE wallet_payments AS p SET reversed=${target} WHERE owner=? AND environment=? AND credited=1`).bind(owner,environment),
  ]);
}

export async function walletAccount(owner:string) {
  const db=database(),environment=walletEnvironment();
  const [customer,subscriptions,payments,balance,credits]=await Promise.all([
    db.prepare('SELECT customer_id FROM wallet_customers WHERE owner=? AND environment=?').bind(owner,environment).first<{customer_id:string}>(),
    db.prepare('SELECT subscription_id,status,cancel_at,period_end FROM wallet_subscriptions WHERE owner=? AND environment=? ORDER BY updated_at DESC').bind(owner,environment).all<{subscription_id:string;status:string;cancel_at:number|null;period_end:number|null}>(),
    db.prepare('SELECT id,credits,credited,reversed,subscription_id,created_at FROM wallet_payments WHERE owner=? AND environment=? ORDER BY created_at DESC LIMIT 30').bind(owner,environment).all<{id:string;credits:number;credited:number;reversed:number;subscription_id:string|null;created_at:number}>(),
    db.prepare('SELECT credits FROM wallet_test_balances WHERE owner=?').bind(owner).first<{credits:number}>(),
    subscriptionCreditBalance(owner,environment),
  ]);
  return {environment,hasCustomer:!!customer,subscriptions:subscriptions.results.map(r=>({...r})),payments:payments.results.map(r=>({...r})),subscriptionCredits:credits.included,creditsResetAt:credits.renewsAt,testCredits:environment==='sandbox'?(balance?.credits??0)+credits.included:null};
}

export async function walletPortal(owner:string,origin:string) {
  const customer=await database().prepare('SELECT customer_id FROM wallet_customers WHERE owner=? AND environment=?').bind(owner,walletEnvironment()).first<{customer_id:string}>();
  if(!customer)throw new ApiError('Your billing profile appears after your first purchase.',404);
  const configuration=binding('STRIPE_WALLET_PORTAL_CONFIGURATION');
  if(!configuration)throw new ApiError('Billing management is being set up. Contact support for payment or cancellation assistance.',503);
  const session=await walletStripe().billingPortal.sessions.create({customer:customer.customer_id,configuration,return_url:`${origin}/account/billing`});
  return {url:session.url};
}

export async function handleWalletEvent(event:Stripe.Event) {
  assertMode(event.livemode);
  if(event.account)return;
  const time=Date.now(); // Fetch current Stripe state; the delivery's snapshot may be old.
  switch(event.type){
    case 'checkout.session.completed':case 'checkout.session.async_payment_succeeded':
      await fulfillWalletSession(event.data.object.id);break;
    case 'invoice.paid':await fulfillWalletInvoice(event.data.object.id);break;
    case 'customer.subscription.created':case 'customer.subscription.updated':case 'customer.subscription.deleted':case 'customer.subscription.paused':case 'customer.subscription.resumed':
      await syncWalletSubscription(event.data.object.id,time);break;
    case 'charge.refunded':await recordWalletCharge(event.data.object.id,time);break;
    case 'charge.dispute.created':case 'charge.dispute.closed':case 'charge.dispute.updated':{
      const chargeId=walletObjectId(event.data.object.charge);if(chargeId)await recordWalletCharge(chargeId,time);break;
    }
  }
}
