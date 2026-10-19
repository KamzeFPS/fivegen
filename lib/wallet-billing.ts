import type Stripe from 'stripe';
import {ApiError, binding, database} from './server';
import {walletCatalog} from './wallet-catalog';
import {assertWalletCheckout, walletEnvironment, walletObjectId, walletStripe} from './wallet-stripe';
import {refreshSubscriptionCredits, subscriptionCreditBalance} from './subscription-credits';

type Intent={id:string;owner:string;environment:string;offer_id:string;email:string;amount:number;credits:number;billing_interval:'month'|'year'|null;session_id:string|null;status:string;created_at:number};
const purpose='fivegen_wallet';
const paidStatuses="'active','trialing','past_due','paused','unpaid','incomplete'";
function supportsExpressCurrency(session:Stripe.Checkout.Session) {
  return session.ui_mode==='elements'&&session.managed_payments?.enabled===false&&session.adaptive_pricing?.enabled===true&&session.payment_method_types.length===2&&session.payment_method_types.includes('card')&&session.payment_method_types.includes('link');
}
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
  if(config.environment==='production'&&!(await sdk.accounts.retrieve(null)).charges_enabled)throw new ApiError('Card payments are not available yet. Your account has not been charged.',503);
  const existing=await db.prepare("SELECT * FROM wallet_checkout_intents WHERE owner=? AND environment=? AND status='open'").bind(owner,config.environment).first<Intent>();
  if(existing){
    if(existing.session_id){
      const session=await sdk.checkout.sessions.retrieve(existing.session_id);
      if(session.status==='complete'){
        await fulfillWalletSession(session.id);
        throw new ApiError('Your previous purchase is complete. View Billing & receipts before making another purchase.',409);
      }
      if(session.status==='expired')await db.prepare("UPDATE wallet_checkout_intents SET status='expired' WHERE id=?").bind(existing.id).run();
      else if(existing.offer_id===offerId&&supportsExpressCurrency(session))return {clientSecret:session.client_secret!,sessionId:session.id};
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
  // Prices stay server-owned in USD. Stripe handles local presentment and
  // reports integration amounts in the API, with FX under presentment_details.
  const session=await sdk.checkout.sessions.create({
    ui_mode:'elements',mode:offer.interval?'subscription':'payment',customer,
    // Keep direct merchant settlement and our own invoices regardless of the
    // account default. Card also enables eligible Apple Pay / Google Pay tokens.
    managed_payments:{enabled:false},payment_method_types:['card','link'],
    allow_promotion_codes:false,
    adaptive_pricing:{enabled:true},
    line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:intent.amount,
      product_data:{name:`FiveGen ${offer.name}${offer.interval?'':' credits'}`,metadata:{fivegen_offer:offer.id}},
      ...(offer.interval?{recurring:{interval:offer.interval}}:{})}}],
    metadata,client_reference_id:intent.id,
    ...(offer.interval?{subscription_data:{metadata}}:{payment_intent_data:{metadata},invoice_creation:{enabled:true}}),
    return_url:`${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
  },{idempotencyKey:`fivegen-wallet-checkout:v4-adaptive:${intent.id}`});
  await db.prepare('UPDATE wallet_checkout_intents SET session_id=? WHERE id=?').bind(session.id,intent.id).run();
  return {clientSecret:session.client_secret!,sessionId:session.id};
}

export async function closeWalletCheckout(owner:string,sessionId:string) {
  const db=database(),row=await db.prepare('SELECT * FROM wallet_checkout_intents WHERE owner=? AND environment=? AND session_id=?').bind(owner,walletEnvironment(),sessionId).first<Intent>();
  if(!row)throw new ApiError('Checkout not found.',404);
  const sdk=walletStripe(),session=await sdk.checkout.sessions.retrieve(sessionId);
  if(session.status==='complete'){await fulfillWalletSession(sessionId);return {completed:true};}
  if(session.status==='open'){
    try { await sdk.checkout.sessions.expire(sessionId); }
    catch(error){
      // Payment may complete in another tab while an old checkout is being
      // replaced. Never discard its intent or allow a second purchase then.
      const current=await sdk.checkout.sessions.retrieve(sessionId);
      if(current.status==='complete'){await fulfillWalletSession(sessionId);return {completed:true};}
      if(current.status!=='expired')throw error;
    }
  }
  await db.prepare("UPDATE wallet_checkout_intents SET status='expired' WHERE id=?").bind(row.id).run();
  return {completed:false};
}

async function verifySession(session:Stripe.Checkout.Session,intent:Intent) {
  assertMode(session.livemode);
  const customer=await database().prepare('SELECT customer_id FROM wallet_customers WHERE owner=? AND environment=?').bind(intent.owner,intent.environment).first<{customer_id:string}>();
  if(session.id!==intent.session_id||session.metadata?.purpose!==purpose||session.metadata.fivegen_intent!==intent.id||session.client_reference_id!==intent.id||walletObjectId(session.customer)!==customer?.customer_id)throw new ApiError('Checkout identity did not match its purchase record.',400);
  const lines=await walletStripe().checkout.sessions.listLineItems(session.id,{limit:2});
  const item=lines.data[0];
  // Adaptive Pricing localizes Stripe.js display values, not these REST API
  // integration amounts. MNT presentment must never bypass the USD price check.
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
  if(!pi)throw new ApiError('A verified payment is required for subscription credits.',400);
  await saveWalletPayment(intent,invoice.id,pi,invoice.amount_paid,subId,item.period.start*1000,item.period.end*1000);
}

async function saveWalletPayment(intent:Intent,id:string,paymentIntent:string,amount:number,sub:string|null,start:number|null,end:number|null) {
  const sdk=walletStripe(),pi=await sdk.paymentIntents.retrieve(paymentIntent,{expand:['latest_charge']});
  assertMode(pi.livemode);
  const charge=pi.latest_charge as Stripe.Charge|null;
  const db=database();
  const customer=await db.prepare('SELECT customer_id FROM wallet_customers WHERE owner=? AND environment=?').bind(intent.owner,intent.environment).first<{customer_id:string}>();
  if(pi.status!=='succeeded'||pi.currency!=='usd'||pi.amount!==amount||pi.amount_received!==amount||!charge||typeof charge==='string'||charge.status!=='succeeded'||!charge.paid||!charge.captured||charge.currency!=='usd'||charge.amount!==amount||charge.amount_captured!==amount)throw new ApiError('Payment is not settled.',400);
  assertMode(charge.livemode);
  if(pi.id!==paymentIntent||walletObjectId(pi.customer)!==customer?.customer_id||walletObjectId(charge.customer)!==customer?.customer_id||walletObjectId(charge.payment_intent)!==pi.id)throw new ApiError('Payment identity did not match its purchase record.',400);
  // Link can settle from cards or its other supported funding sources. Stripe
  // reports those under type=link (or a card wallet); only a fully captured,
  // successful payment for this customer and exact USD amount funds credits.
  const details=charge.payment_method_details;
  if(!((details?.type==='card'&&details.card)||(details?.type==='link'&&details.link)))throw new ApiError('The payment method could not be verified.',400);
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
    db.prepare('SELECT p.id,p.amount,p.credits,p.credited,p.reversed,p.subscription_id,p.created_at,i.offer_id FROM wallet_payments p JOIN wallet_checkout_intents i ON i.id=p.intent_id WHERE p.owner=? AND p.environment=? ORDER BY p.created_at DESC LIMIT 30').bind(owner,environment).all<{id:string;amount:number;credits:number;credited:number;reversed:number;subscription_id:string|null;created_at:number;offer_id:string}>(),
    db.prepare('SELECT credits FROM wallet_test_balances WHERE owner=?').bind(owner).first<{credits:number}>(),
    subscriptionCreditBalance(owner,environment),
  ]);
  return {environment,hasCustomer:!!customer,subscriptions:subscriptions.results.map(r=>({...r})),payments:payments.results.map(r=>({...r,name:walletCatalog().find(offer=>offer.id===r.offer_id)?.name??'AI credits'})),subscriptionCredits:credits.included,creditsResetAt:credits.renewsAt,testCredits:environment==='sandbox'?(balance?.credits??0)+credits.included:null};
}

// A delayed webhook should never require a customer to purchase twice. This
// action only reads the signed-in owner's existing records and Stripe state;
// it uses exactly the same verified, idempotent fulfillment as the webhook.
export async function reconcileWalletAccount(owner:string){
  const db=database(),environment=walletEnvironment(),sdk=walletStripe();
  const [pending,subscriptions]=await Promise.all([
    db.prepare("SELECT session_id FROM wallet_checkout_intents WHERE owner=? AND environment=? AND status='open' AND session_id IS NOT NULL ORDER BY created_at DESC LIMIT 10").bind(owner,environment).all<{session_id:string}>(),
    db.prepare("SELECT subscription_id FROM wallet_subscriptions WHERE owner=? AND environment=? AND status IN ('active','trialing','past_due','unpaid','incomplete') ORDER BY updated_at DESC LIMIT 5").bind(owner,environment).all<{subscription_id:string}>(),
  ]);
  let checked=0,pendingCount=0,unavailable=0;
  for(const row of pending.results){
    try{
      const session=await sdk.checkout.sessions.retrieve(row.session_id);assertMode(session.livemode);
      if(session.status==='complete'&&session.payment_status==='paid')await fulfillWalletSession(row.session_id);
      else if(session.status==='expired')await db.prepare("UPDATE wallet_checkout_intents SET status='expired' WHERE owner=? AND environment=? AND session_id=? AND status='open'").bind(owner,environment,row.session_id).run();
      else pendingCount++;
      checked++;
    }catch{unavailable++;}
  }
  for(const row of subscriptions.results){
    try{
      const synced=await syncWalletSubscription(row.subscription_id);
      const invoiceId=walletObjectId(synced?.sub.latest_invoice);
      if(invoiceId)await fulfillWalletInvoice(invoiceId);
      checked++;
    }catch{unavailable++;}
  }
  return {account:await walletAccount(owner),checked,pending:pendingCount,unavailable};
}

export async function walletReceipt(owner:string,paymentId:string){
  const environment=walletEnvironment(),db=database();
  const row=await db.prepare('SELECT payment_intent FROM wallet_payments WHERE id=? AND owner=? AND environment=? AND credited=1').bind(paymentId,owner,environment).first<{payment_intent:string}>();
  if(!row)throw new ApiError('Receipt not found.',404);
  const customer=await db.prepare('SELECT customer_id FROM wallet_customers WHERE owner=? AND environment=?').bind(owner,environment).first<{customer_id:string}>();
  const payment=await walletStripe().paymentIntents.retrieve(row.payment_intent,{expand:['latest_charge']});assertMode(payment.livemode);
  const charge=payment.latest_charge;
  if(!customer||walletObjectId(payment.customer)!==customer.customer_id||!charge||typeof charge==='string'||walletObjectId(charge.customer)!==customer.customer_id||walletObjectId(charge.payment_intent)!==payment.id)throw new ApiError('Receipt not found.',404);
  assertMode(charge.livemode);
  const url=charge.receipt_url?new URL(charge.receipt_url):null;
  if(!url||url.protocol!=='https:'||url.hostname!=='pay.stripe.com')throw new ApiError('Your receipt is not available yet. Use Manage billing to view your invoice.',503);
  return {url:url.href};
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
