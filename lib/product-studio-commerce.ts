import {z} from 'zod';
import type Stripe from 'stripe';
import {ApiError,binding,database} from './server';
import {studioPricing} from './product-studio-contract';
import {communityTierDelivery,communityTierSelection} from './product-community-tier-contract';
import {builderDeliverySnapshotSchema} from './builder-publication-contract';
import {commerceStripe,commerceMode,commerceAccount,commerceHash,commerceCookie,customerOrder,recordCommerceEarnings,revokeCommercePayment,assertCommerceContent} from './commerce-v2-server';
import {creatorPlan} from './creator-plan-server';
import {commerceCommission} from './commerce-fees';
import {productShippingAddressSchema,saveProductShipping,productHasPhysicalDelivery} from './product-service-fulfillment';
import {commercePurchaseEmailStatement} from './purchase-email';

const studioShippingCountries:Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[]=['US','CA','GB','AU','NZ','DE','FR','IT','ES','NL','BE','AT','CH','SE','NO','DK','FI','IE','PT','PL','CZ','GR','RO','HU','JP','SG','HK','KR','MY','TH','PH','ID','VN','IN','AE','SA','IL','ZA','MX','BR','CL','CO','PE','MN'];
const checkoutInput=z.object({slug:z.string().min(1).max(100),email:z.string().trim().email().max(254),requestId:z.string().uuid(),expectedPublicationVersion:z.number().int().min(1).optional(),amount:z.number().int().min(0).max(999900).optional(),coupon:z.string().trim().max(40).default(''),shippingAddress:productShippingAddressSchema.optional(),tierId:z.string().uuid().optional(),campaign:z.string().regex(/^[a-zA-Z0-9_-]{0,80}$/).default('')});
async function publishedOffer(slug:string){
 const mode=commerceMode(),row=await database().prepare(`SELECT b.*,o.enabled,o.enabled_mode,o.updated_at offer_updated,o.amount,o.currency,a.account_id,a.status account_status FROM product_builder_publications b JOIN products p ON p.id=b.product_id AND p.owner=b.owner JOIN commerce_offers o ON o.product_id=b.product_id AND o.owner=b.owner LEFT JOIN commerce_accounts a ON a.owner=b.owner AND a.mode=? WHERE b.slug=? AND b.published_at>0 AND p.archived_at IS NULL AND o.enabled=1 AND o.enabled_mode=?`).bind(mode,slug,mode).first();
 if(!row)return null;const shown=JSON.parse(String(row.public_snapshot)),delivery=builderDeliverySnapshotSchema.parse(JSON.parse(String(row.content_snapshot))),pricing=studioPricing(delivery.studio);
 if(shown.priceCents!==row.amount||shown.currency!==row.currency)return null;
 return {row,shown,delivery,pricing,mode};
}
export async function publicFreeStudioOffer(slug:string){if(!['test','live'].includes(binding('STRIPE_MODE')))return null;const offer=await publishedOffer(slug);if(!offer||offer.pricing.model!=='free'&&!offer.delivery.studio?.community?.tiers?.some(tier=>tier.billing==='free'))return null;return {amount:0,currency:String(offer.row.currency),title:String(offer.shown.title),mode:offer.mode,publicationVersion:Number(offer.row.version)};}

/** Only new pricing modes enter here. The existing one-time checkout stays on
 * its established verification path. Prices and discounts are server-derived. */
export async function createStudioCheckout(req:Request,input:unknown){
 const value=checkoutInput.parse(input),offer=await publishedOffer(value.slug);
 if(!offer)return null;
 const {row,shown,mode}=offer;let selection:ReturnType<typeof communityTierSelection>;try{selection=communityTierSelection(offer.delivery.studio,value.tierId);}catch(error){throw new ApiError(error instanceof Error?error.message:'Choose a published membership plan.');}
 const delivery=selection?{...offer.delivery,studio:selection.studio}:offer.delivery,pricing=selection?{...offer.pricing,...selection.pricing,coupons:offer.pricing.coupons,bundleProductIds:offer.pricing.bundleProductIds}:offer.pricing;
 const physical=(delivery.studio?.custom?.deliveryKinds as string[]|undefined)?.includes('physical')||(delivery.studio?.custom?.blocks as {kind?:string}[]|undefined)?.some(block=>block.kind==='physical');
 if(!selection&&pricing.model==='one-time'&&!value.coupon&&!pricing.bundleProductIds.length&&!physical)return null;
 if(value.expectedPublicationVersion!==Number(row.version))throw new ApiError('This product changed. Reload its page before continuing.',409);
 const db=database(),email=value.email.toLowerCase();let amount=selection?.amount??Number(row.amount);
 if(pricing.model==='free')amount=0;
 if(pricing.model==='pwyw'){amount=value.amount??(pricing.suggestedCents||amount);if(amount<pricing.minimumCents)throw new ApiError('Choose an amount at or above the displayed minimum.');}
 if(value.coupon){const coupon=pricing.coupons.find(item=>item.code.toLowerCase()===value.coupon.toLowerCase());if(!coupon)throw new ApiError('That discount code is unavailable.');amount=Math.round(amount*(100-coupon.percentOff)/100);}
 if(physical&&amount===0&&!value.shippingAddress)throw new ApiError('Add your delivery address before continuing.');
 if(amount>0&&amount<50)throw new ApiError(value.coupon?'This discount leaves a total below the payment minimum. Try another code.':'Choose at least 0.50, or use a free offer.');
 if(pricing.model==='subscription'&&amount===0)throw new ApiError('Subscriptions need a paid recurring price. Use a free product for free access.');
 if(amount>0){commerceStripe();if(binding('STRIPE_COMMERCE_ENABLED')!=='true'||!binding('STRIPE_CONNECT_WEBHOOK_SECRET').startsWith('whsec_'))throw new ApiError('This creator’s payment setup is not complete.',503);const account=await commerceAccount(String(row.owner),true);if(!account.ready||account.accountId!==row.account_id)throw new ApiError('This creator cannot accept payments yet.',409);}
 await assertCommerceContent({id:row.product_id,owner:row.owner},selection?communityTierDelivery(delivery):undefined);
 let existing=await db.prepare('SELECT * FROM commerce_orders WHERE id=?').bind(value.requestId).first(),token='';
 if(existing){await customerOrder(req,value.requestId,false);const previous=await db.prepare('SELECT publication_version,snapshot FROM product_builder_order_snapshots WHERE order_id=?').bind(value.requestId).first();const priorTier=previous?builderDeliverySnapshotSchema.parse(JSON.parse(String(previous.snapshot))).studio?.community?.purchasedTierId:undefined;if(priorTier!==selection?.tier.id)throw new ApiError('Start a new checkout attempt for this membership plan.',409);if(existing.product_id!==row.product_id||existing.email!==email||existing.amount!==amount||existing.mode!==mode||Number(previous?.publication_version)!==Number(row.version)||existing.status==='revoked')throw new ApiError('Start a new checkout attempt.',409);if(existing.status==='paid')return {url:`${new URL(req.url).origin}/customer?order=${value.requestId}`,orderId:value.requestId,cookie:null};}
 else{
  const attempts=await db.prepare('SELECT COUNT(*) n FROM commerce_orders WHERE product_id=? AND created_at>?').bind(row.product_id,Date.now()-3600000).first();if(Number(attempts?.n)>300)throw new ApiError('Too many requests. Please try again later.',429);
  token=crypto.randomUUID()+crypto.randomUUID();const hash=await commerceHash(token),now=Date.now(),plan=amount>0?await creatorPlan(String(row.owner),mode,now):null;
  const bundles: {productId:string;version:number;snapshot:string;title:string}[]=[],bundleCommunityTierIds:Record<string,string>={};
  for(const productId of pricing.bundleProductIds){const child=await db.prepare('SELECT b.* FROM product_builder_publications b JOIN products p ON p.id=b.product_id AND p.owner=b.owner WHERE b.product_id=? AND b.owner=? AND p.archived_at IS NULL AND b.published_at>0').bind(productId,row.owner).first();if(!child)throw new ApiError('An included product is no longer available.',409);let snapshot=builderDeliverySnapshotSchema.parse(JSON.parse(String(child.content_snapshot)));let included:ReturnType<typeof communityTierSelection>;try{included=communityTierSelection(snapshot.studio,snapshot.studio?.community?.bundleTierId);}catch{throw new ApiError('Choose an included membership plan in the community’s bundle settings before selling this bundle.',409);}if(included){if(included.tier.billing!=='free'&&(pricing.model!=='subscription'||pricing.interval!==included.tier.billing))throw new ApiError('A bundled paid community needs a subscription bundle with the same billing interval.',409);snapshot={...snapshot,studio:included.studio};bundleCommunityTierIds[productId]=included.tier.id;}if(studioPricing(snapshot.studio).bundleProductIds.length)throw new ApiError('Nested bundles are not supported. Include the individual products.');await assertCommerceContent({id:productId,owner:row.owner},included?communityTierDelivery(snapshot):undefined);bundles.push({productId,version:Number(child.version),snapshot:JSON.stringify(snapshot),title:snapshot.title});}
  const accountId=amount>0?String(row.account_id):`free:${row.owner}`,spec={amount,currency:row.currency,interval:pricing.interval,communityTierId:selection?.tier.id,bundleCommunityTierIds,commissionBps:plan?.commissionBps||0,bundleProductIds:pricing.bundleProductIds};
  const statements=[
   db.prepare(`INSERT INTO commerce_orders(id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at,campaign,expected_fee_bps,expected_fee_amount,fee_plan_id) SELECT ?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM product_builder_publications b JOIN products p ON p.id=b.product_id AND p.owner=b.owner JOIN commerce_offers o ON o.product_id=b.product_id WHERE b.product_id=? AND b.version=? AND o.enabled=1 AND o.updated_at=?)`).bind(value.requestId,row.owner,row.product_id,accountId,mode,email,amount,row.currency,shown.title,hash,now,value.campaign,plan?.commissionBps||0,commerceCommission(amount,plan?.commissionBps||0),plan?.id||'free',row.product_id,row.version,row.offer_updated),
   db.prepare('INSERT INTO product_builder_order_snapshots(order_id,product_id,publication_version,snapshot,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM commerce_orders WHERE id=? AND access_hash=?)').bind(value.requestId,row.product_id,row.version,JSON.stringify(delivery),now,value.requestId,hash),
   db.prepare('INSERT INTO product_commerce_intents(order_id,pricing_model,status,spec,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM commerce_orders WHERE id=? AND access_hash=?)').bind(value.requestId,pricing.model,'pending',JSON.stringify(spec),now,value.requestId,hash),
  ];
  for(const child of bundles){const childId=crypto.randomUUID();statements.push(db.prepare(`INSERT INTO commerce_orders(id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at,fee_plan_id) SELECT ?,?,?,?,?,?,0,?,?,'pending',?,?,'bundle' WHERE EXISTS(SELECT 1 FROM commerce_orders WHERE id=? AND access_hash=?)`).bind(childId,row.owner,child.productId,accountId,mode,email,row.currency,child.title,hash,now,value.requestId,hash),db.prepare('INSERT INTO product_builder_order_snapshots(order_id,product_id,publication_version,snapshot,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM commerce_orders WHERE id=?)').bind(childId,child.productId,child.version,child.snapshot,now,childId),db.prepare('INSERT INTO product_bundle_entitlements(parent_order_id,order_id,product_id) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM commerce_orders WHERE id=?)').bind(value.requestId,childId,child.productId,childId));}
  const saved=await db.batch(statements);if(!saved[0].meta.changes)throw new ApiError('The offer changed. Reload before continuing.',409);existing=await db.prepare('SELECT * FROM commerce_orders WHERE id=?').bind(value.requestId).first();
 }
 const origin=new URL(req.url).origin;
 if(amount===0){if(physical)await saveProductShipping(value.requestId,value.shippingAddress,'checkout');await activateStudioOrder(value.requestId);return {url:`${origin}/customer?order=${value.requestId}`,orderId:value.requestId,cookie:token?commerceCookie(value.requestId,token,origin):null};}
 const subscription=pricing.model==='subscription',metadata={fivegen_order:value.requestId,fivegen_product:String(row.product_id)};
 const session=await commerceStripe().checkout.sessions.create({mode:subscription?'subscription':'payment',...(physical?{shipping_address_collection:{allowed_countries:studioShippingCountries}}:{}),payment_method_types:['card'],customer_email:email,client_reference_id:value.requestId,metadata,...(subscription?{subscription_data:{metadata,application_fee_percent:Number(existing!.expected_fee_bps)/100}}:{payment_intent_data:{metadata,...(Number(existing!.expected_fee_amount)>0?{application_fee_amount:Number(existing!.expected_fee_amount)}:{})}}),line_items:[{quantity:1,price_data:{currency:String(existing!.currency),unit_amount:Number(existing!.amount),product_data:{name:String(existing!.title).slice(0,120)},...(subscription?{recurring:{interval:pricing.interval}}:{})}}],success_url:`${origin}/customer?order=${value.requestId}`,cancel_url:`${origin}/b/${encodeURIComponent(value.slug)}`},{stripeAccount:String(row.account_id),idempotencyKey:`fivegen-studio-${mode}-${value.requestId}`});
 await db.prepare('UPDATE commerce_orders SET session_id=? WHERE id=? AND session_id IS NULL').bind(session.id,value.requestId).run();
 if(!session.url)throw new ApiError('The payment provider did not return a checkout URL.',502);
 return {url:session.url,orderId:value.requestId,cookie:token?commerceCookie(value.requestId,token,origin):null};
}
export async function activateStudioOrder(id:string){const db=database(),now=Date.now();await db.batch([db.prepare("UPDATE commerce_orders SET status='paid',paid_at=COALESCE(paid_at,?) WHERE id=? AND status='pending'").bind(now,id),db.prepare("UPDATE product_commerce_intents SET status='active',updated_at=? WHERE order_id=? AND status!='revoked'").bind(now,id),db.prepare("UPDATE commerce_orders SET status='paid',paid_at=COALESCE(paid_at,?) WHERE id IN(SELECT order_id FROM product_bundle_entitlements WHERE parent_order_id=?) AND status='pending' AND EXISTS(SELECT 1 FROM commerce_orders WHERE id=? AND status='paid')").bind(now,id,id),commercePurchaseEmailStatement(id,now)]);}
const objectId=(value:unknown):string|null=>typeof value==='string'?value:value&&typeof value==='object'&&'id' in value?String(value.id):null;
export async function fulfillStudioSession(sessionId:string,account:string){
 const db=database(),mode=commerceMode(),session=await commerceStripe().checkout.sessions.retrieve(sessionId,{expand:['payment_intent.latest_charge','subscription']},{stripeAccount:account}),id=session.metadata?.fivegen_order;if(!id)return;
 const order=await db.prepare('SELECT * FROM commerce_orders WHERE id=? AND account_id=? AND mode=?').bind(id,account,mode).first(),intent=await db.prepare('SELECT * FROM product_commerce_intents WHERE order_id=?').bind(id).first();if(!order||!intent)throw new ApiError('Unknown checkout.',400);
 if(session.livemode!==(mode==='live')||session.client_reference_id!==id||session.metadata?.fivegen_product!==order.product_id||session.amount_total!==order.amount||session.currency!==order.currency||order.session_id&&order.session_id!==session.id)throw new ApiError('Payment does not match the reviewed product.',400);
 if(session.status!=='complete'||session.payment_status!=='paid')return;
 if(session.customer_details?.email?.trim().toLowerCase()!==order.email)throw new ApiError('Payment email mismatch.',400);
 if(intent.pricing_model==='subscription'){
  const subscriptionId=objectId(session.subscription);if(!subscriptionId||session.mode!=='subscription')throw new ApiError('Recurring payment verification is incomplete.',502);
  const sub=await commerceStripe().subscriptions.retrieve(subscriptionId,{}, {stripeAccount:account});if(sub.livemode!==(mode==='live')||sub.metadata.fivegen_order!==id||!['active','trialing'].includes(sub.status))throw new ApiError('The subscription is not active.',409);
  const item=sub.items.data[0],start=item?.current_period_start,end=item?.current_period_end;if(!start||!end)throw new ApiError('The subscription period is unavailable.',502);
  await db.prepare("UPDATE product_commerce_intents SET subscription_id=?,period_start=?,period_end=?,status='active',updated_at=? WHERE order_id=? AND status!='revoked'").bind(sub.id,start*1000,end*1000,Date.now(),id).run();
  const invoiceId=objectId(sub.latest_invoice);if(!invoiceId)throw new ApiError('The membership invoice is unavailable.',502);await recordSubscriptionInvoice(id,invoiceId,account);
 }else{
  if(session.mode!=='payment')throw new ApiError('Unexpected payment mode.',400);const payment=session.payment_intent;if(!payment||typeof payment==='string'||payment.status!=='succeeded'||payment.amount_received!==order.amount||payment.currency!==order.currency||payment.livemode!==(mode==='live')||payment.metadata.fivegen_order!==id||(payment.application_fee_amount||0)!==Number(order.expected_fee_amount))throw new ApiError('Payment verification failed.',400);const charge=payment.latest_charge;if(!charge||typeof charge==='string'||objectId(charge.payment_intent)!==payment.id||charge.amount!==order.amount||charge.currency!==order.currency||charge.livemode!==(mode==='live')||charge.application_fee_amount!=null&&charge.application_fee_amount!==Number(order.expected_fee_amount))throw new ApiError('Charge verification failed.',400);await db.prepare('UPDATE commerce_orders SET payment_intent=? WHERE id=?').bind(payment.id,id).run();if(charge.disputed||charge.amount_refunded>0||await db.prepare('SELECT key FROM commerce_revocations WHERE account_id=? AND mode=? AND payment_intent=?').bind(account,mode,payment.id).first()){await revokeCommercePayment(account,mode,payment.id,charge.disputed?'disputed':'refunded');return;}await recordCommerceEarnings(order,payment,charge).catch(()=>{console.warn('Sale earnings will retry during reconciliation.');});
 }
 if(await db.prepare("SELECT order_id FROM product_commerce_intents WHERE order_id=? AND status='revoked'").bind(id).first()||order.status==='revoked'||intent.status==='revoked')return;
 const shipping=session.collected_information?.shipping_details;if(await productHasPhysicalDelivery(id)&&!shipping?.address)throw new ApiError('Payment is confirmed, but its delivery address is unavailable. Contact your creator.',409);if(shipping){const address=shipping.address;if(address)await saveProductShipping(id,{name:shipping.name,line1:address.line1,line2:address.line2||undefined,city:address.city,state:address.state||undefined,postalCode:address.postal_code||undefined,country:address.country},'stripe');}
 await activateStudioOrder(id);
}
export async function assertStudioSubscriptionAccess(id:string){const intent=await database().prepare('SELECT pricing_model,status,period_end FROM product_commerce_intents WHERE order_id=?').bind(id).first();if(intent?.pricing_model==='subscription'&&(!['active','trialing'].includes(String(intent.status))||Number(intent.period_end||0)<=Date.now()))throw new ApiError('Your membership is not active. Manage your subscription to continue.',403);}
export async function studioSubscriptionEvent(event:Stripe.Event,account:string){
 const db=database(),object=event.data.object as unknown as Record<string,unknown>;
 const invoice=event.type.startsWith('invoice.')?object:null;
 const parent=invoice?.parent as {subscription_details?:{subscription?:unknown}}|undefined;
 const subscriptionId=invoice?objectId(parent?.subscription_details?.subscription||invoice.subscription):objectId(object);
 if(!subscriptionId)return;const row=await db.prepare('SELECT i.*,o.account_id,o.mode FROM product_commerce_intents i JOIN commerce_orders o ON o.id=i.order_id WHERE i.subscription_id=? AND o.account_id=? AND o.mode=?').bind(subscriptionId,account,commerceMode()).first();if(!row)return;
 // Fetch current state: stale/out-of-order events never restore expired access.
 const subscription=await commerceStripe().subscriptions.retrieve(subscriptionId,{}, {stripeAccount:account});if(subscription.livemode!==(commerceMode()==='live')||subscription.metadata.fivegen_order!==row.order_id)throw new ApiError('Subscription identity mismatch.',400);
 const item=subscription.items.data[0],status=subscription.status,start=(item?.current_period_start||0)*1000,end=(item?.current_period_end||0)*1000;
 if(event.type==='invoice.paid'&&invoice?.status==='paid'&&invoice.amount_paid===invoice.amount_due){await recordSubscriptionInvoice(String(row.order_id),String(invoice.id),account);await db.prepare("UPDATE product_commerce_intents SET period_start=?,period_end=?,status=?,updated_at=? WHERE order_id=? AND status!='revoked'").bind(start,end,status,Date.now(),row.order_id).run();}
 else if(event.type.startsWith('customer.subscription.')||event.type==='invoice.payment_failed')await db.prepare("UPDATE product_commerce_intents SET status=?,period_start=?,period_end=?,updated_at=? WHERE order_id=? AND status!='revoked'").bind(status,start,end,Date.now(),row.order_id).run();
}
export async function revokeStudioEntitlements(id:string){const db=database(),renewal=await db.prepare('SELECT parent_order_id FROM product_subscription_renewals WHERE order_id=?').bind(id).first(),parent=String(renewal?.parent_order_id||id);await db.batch([db.prepare("UPDATE product_commerce_intents SET status='revoked',updated_at=? WHERE order_id=?").bind(Date.now(),parent),db.prepare("UPDATE commerce_orders SET status='revoked' WHERE id IN(SELECT order_id FROM product_bundle_entitlements WHERE parent_order_id=?)").bind(parent),db.prepare("UPDATE product_service_sessions SET status='cancelled',updated_at=? WHERE order_id=? OR order_id IN(SELECT order_id FROM product_bundle_entitlements WHERE parent_order_id=?)").bind(Date.now(),parent,parent),db.prepare("UPDATE commerce_bookings SET status='cancelled' WHERE order_id=? OR order_id IN(SELECT order_id FROM product_bundle_entitlements WHERE parent_order_id=?)").bind(parent,parent)]);}

/** Verify invoices on the connected account, then retain every renewal as its
 * own sale. The purchased content and customer library remain one membership. */
export async function recordSubscriptionInvoice(parentId:string,invoiceId:string,account:string){
 const db=database(),mode=commerceMode(),parent=await db.prepare('SELECT o.*,i.subscription_id,i.spec,i.status intent_status FROM commerce_orders o JOIN product_commerce_intents i ON i.order_id=o.id WHERE o.id=? AND o.account_id=? AND o.mode=?').bind(parentId,account,mode).first();
 if(!parent?.subscription_id)throw new ApiError('Membership not found.',404);
 const invoice=await commerceStripe().invoices.retrieve(invoiceId,{}, {stripeAccount:account});
 if(invoice.livemode!==(mode==='live')||objectId(invoice.parent?.subscription_details?.subscription)!==parent.subscription_id||invoice.currency!==parent.currency||invoice.status!=='paid'||invoice.amount_paid!==invoice.amount_due)throw new ApiError('Membership invoice verification failed.',409);
 const payments=await commerceStripe().invoicePayments.list({invoice:invoiceId,status:'paid',limit:10},{stripeAccount:account});
 const card=payments.data.filter(item=>item.payment.type==='payment_intent');
 if(invoice.amount_paid>0&&(payments.has_more||card.length!==1||card[0].amount_paid!==invoice.amount_paid))throw new ApiError('Membership payment verification is incomplete.',502);
 const paymentId=objectId(card[0]?.payment.payment_intent);let payment:Stripe.PaymentIntent|null=null;
 if(paymentId){try{payment=await commerceStripe().paymentIntents.retrieve(paymentId,{expand:['latest_charge.balance_transaction']},{stripeAccount:account});}catch{payment=await commerceStripe().paymentIntents.retrieve(paymentId,{expand:['latest_charge']},{stripeAccount:account});}}
 const charge=payment?.latest_charge;
 if(payment&&(payment.status!=='succeeded'||payment.amount_received!==invoice.amount_paid||payment.currency!==parent.currency||payment.livemode!==(mode==='live')||!charge||typeof charge==='string'||objectId(charge.payment_intent)!==payment.id||charge.amount!==invoice.amount_paid||charge.currency!==parent.currency||charge.livemode!==(mode==='live')))throw new ApiError('Membership charge verification failed.',409);
 const spec=JSON.parse(String(parent.spec)),fee=payment?.application_fee_amount||0,expected=commerceCommission(invoice.amount_paid,Number(spec.commissionBps)||0);
 if(fee!==expected||charge&&typeof charge!=='string'&&charge.application_fee_amount!=null&&charge.application_fee_amount!==expected)throw new ApiError('Membership commission does not match its original price agreement.',409);
 const previous=await db.prepare('SELECT order_id FROM product_subscription_renewals WHERE invoice_id=?').bind(invoiceId).first();
 const first=invoice.billing_reason==='subscription_create',id=previous?String(previous.order_id):first?parentId:crypto.randomUUID(),now=Date.now();
 if(first&&invoice.amount_paid!==parent.amount)throw new ApiError('The first membership payment does not match checkout.',409);
 if(!previous){
  const statements=[];
  if(!first)statements.push(db.prepare(`INSERT INTO commerce_orders(id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at,paid_at,payment_intent,expected_fee_bps,expected_fee_amount,fee_plan_id) SELECT ?,owner,product_id,account_id,mode,email,?,currency,title,'paid',access_hash,?,?,?,expected_fee_bps,?,fee_plan_id FROM commerce_orders WHERE id=?`).bind(id,invoice.amount_paid,invoice.created?invoice.created*1000:now,invoice.status_transitions.paid_at?invoice.status_transitions.paid_at*1000:now,paymentId,expected,parentId),db.prepare('INSERT INTO product_builder_order_snapshots(order_id,product_id,publication_version,snapshot,created_at) SELECT ?,product_id,publication_version,snapshot,? FROM product_builder_order_snapshots WHERE order_id=?').bind(id,now,parentId));
  else statements.push(db.prepare('UPDATE commerce_orders SET payment_intent=? WHERE id=? AND (payment_intent IS NULL OR payment_intent=?)').bind(paymentId,parentId,paymentId));
  statements.push(db.prepare('INSERT INTO product_subscription_renewals(order_id,parent_order_id,invoice_id) VALUES(?,?,?)').bind(id,parentId,invoiceId));
  await db.batch(statements);
 }
 if(payment&&charge&&typeof charge!=='string'){
  if(charge.disputed||charge.amount_refunded>0||await db.prepare('SELECT key FROM commerce_revocations WHERE account_id=? AND mode=? AND payment_intent=?').bind(account,mode,payment.id).first())await revokeCommercePayment(account,mode,payment.id,charge.disputed?'disputed':'refunded');
  const order=await db.prepare('SELECT * FROM commerce_orders WHERE id=?').bind(id).first();await recordCommerceEarnings(order!,payment,charge).catch(()=>{console.warn('Membership earnings will retry during reconciliation.');});
 }
}

/** Only provider-returned dates; a missing retry date is unknown, never invented. */
export function providerSubscriptionState(subscription:Stripe.Subscription){
 const endsAt=(subscription.items.data[0]?.current_period_end||0)*1000,invoice=subscription.latest_invoice&&typeof subscription.latest_invoice==='object'?subscription.latest_invoice:null,cancelAt=(subscription.cancel_at||0)*1000;
 return {status:subscription.status,endsAt,cancelAtPeriodEnd:subscription.cancel_at_period_end,cancelAt,nextRetryAt:invoice?.next_payment_attempt?invoice.next_payment_attempt*1000:null,renewsAt:['active','trialing'].includes(subscription.status)&&!subscription.cancel_at_period_end&&!cancelAt?endsAt:null,endedAt:subscription.ended_at?subscription.ended_at*1000:null,checkedAt:Date.now()};
}
export async function customerSubscription(req:Request,id:string,manage=false){
 const order=await customerOrder(req,id,false,{purchaserOnly:true}),intent=await database().prepare('SELECT * FROM product_commerce_intents WHERE order_id=?').bind(id).first();
 if(!intent||intent.pricing_model!=='subscription'||!intent.subscription_id)throw new ApiError('This purchase has no recurring subscription.',404);
 const subscription=await commerceStripe().subscriptions.retrieve(String(intent.subscription_id),{expand:['latest_invoice']}, {stripeAccount:String(order.account_id)});
 if(subscription.metadata.fivegen_order!==id||subscription.livemode!==(order.mode==='live'))throw new ApiError('Membership identity mismatch.',409);
 if(manage){const customer=objectId(subscription.customer);if(!customer)throw new ApiError('The billing customer is unavailable.',409);const portal=await commerceStripe().billingPortal.sessions.create({customer,return_url:`${new URL(req.url).origin}/customer?order=${id}`},{stripeAccount:String(order.account_id)});return {url:portal.url};}
 return providerSubscriptionState(subscription);
}
