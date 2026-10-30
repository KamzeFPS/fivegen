import {communityTierAllows} from './product-community-tier-contract';
import type {BuilderDeliverySnapshot} from './builder-publication-contract';
import {assertServiceIntegrationReady} from './service-integrations-server';
import Stripe from 'stripe';
import { z } from 'zod';
import { env } from 'cloudflare:workers';
import { ApiError, binding, database, identity, ownedProduct } from './server';
import { commerceOfferSchema, isConsulting } from './commerce-v2';
import type { CommerceOffer } from './commerce-v2';
import { contentSchema, publishContentError } from './product';
import { enrollAutomationPurchase } from './automation-server';
import {builderPublishedDelivery,builderOrderDelivery,builderBuyerDelivery,verifyBuilderDelivery,builderDownloadMetadata,builderPrivateDownload,builderBuyerCover,builderPrivateCover} from './builder-delivery-server';
import {builderDeliverySnapshotSchema,builderPublishedPresentation,builderBuyerPresentation} from './builder-publication-contract';
import {commerceCommission,commerceFeeSnapshot} from './commerce-fees';
import { creatorPlan } from './creator-plan-server';
import { freeCreatorPlan } from './creator-plans';
import {commercePurchaseEmailStatement,purchaseEmailState} from './purchase-email';
import {fulfillStudioSession,studioSubscriptionEvent,assertStudioSubscriptionAccess,revokeStudioEntitlements} from './product-studio-commerce';
import {teamSeatAllows,teamSeatOrderIds} from './product-team-server';
import {designHasFinishedPages,sectionHasContent} from './product-readiness';
import {learningDeliverySections,learnerSectionAccess} from './product-learning-server';

export function commerceMode(): 'live'|'test' {
  const mode=binding('STRIPE_MODE');
  if(mode!=='live'&&mode!=='test')throw new ApiError('Set an explicit Stripe test or live mode before connecting payments.',503);
  return mode;
}
// A dedicated seller key isolates Connect permissions from platform billing.
// A configured but invalid dedicated key must never fall back to another key.
export function commerceKey(){return binding('STRIPE_COMMERCE_SECRET_KEY')||binding('STRIPE_SECRET_KEY');}
export function commerceStripe() {
  const mode=commerceMode(),key=commerceKey();
  if(!new RegExp(`^(sk|rk)_${mode}_`).test(key))throw new ApiError('The Stripe key does not match the selected payment mode.',503);
  return new Stripe(key,{maxNetworkRetries:2,timeout:20000});
}
function assertEnabled(){commerceStripe();if(binding('STRIPE_COMMERCE_ENABLED')!=='true'||!binding('STRIPE_CONNECT_WEBHOOK_SECRET').startsWith('whsec_'))throw new ApiError('Creator payments need a connected-account webhook and explicit enablement by the administrator.',503);}
// Provider messages can contain request data. Return only our reviewed messages.
async function commerceProvider<T>(operation:string,work:()=>Promise<T>):Promise<T>{
  try{return await work();}catch(error){
    if(error instanceof ApiError)throw error;
    const value=error&&typeof error==='object'?error as {code?:string;statusCode?:number;type?:string;rawType?:string;requestId?:string;raw?:{code?:string;type?:string;requestId?:string}}:{};
    const code=value.code||value.raw?.code||'',providerType=value.rawType||value.raw?.type||value.type||'';
    const safe=(field:unknown)=>typeof field==='string'&&/^[a-zA-Z0-9_.-]{1,120}$/.test(field)?field:undefined;
    console.warn('Stripe commerce request rejected',{operation,status:value.statusCode,code:safe(code),type:safe(providerType),requestId:safe(value.requestId||value.raw?.requestId)});
    if(code==='platform_registration_required'||code==='non_connect_platform_accounts_v2_access_blocked')throw new ApiError('Enable Stripe Connect for this platform in the Stripe Dashboard before connecting creators.',503);
    if(/country|capability_not_supported|configuration_not_supported/.test(code))throw new ApiError('Stripe cannot support this payment configuration in the selected business country. Check your legal business country and Stripe availability.',400);
    if(code==='email_invalid')throw new ApiError('Stripe could not accept the account email address. Check your profile email before connecting.',400);
    if(value.statusCode===429||value.type==='StripeRateLimitError')throw new ApiError('Stripe is busy. Wait a moment and try again.',429);
    if(value.statusCode===401)throw new ApiError('Stripe rejected the platform server key. The administrator must correct its credentials before sellers can connect.',503);
    if(value.statusCode===403)throw new ApiError(`Stripe denied permission to ${operation}. The platform administrator must enable the required Connect permissions on its server key. Your products are unchanged.`,503);
    if(code==='idempotency_error'||value.statusCode===409)throw new ApiError('A previous Stripe request used different settings. Restore your previous settings or contact the administrator before retrying.',409);
    throw new ApiError(`Stripe could not ${operation}. Check your Connect setup and try again.`,value.statusCode===400?400:502);
  }
}
async function refreshCommerceAccount(accountId:string,mode:'test'|'live'){
  const account=await commerceProvider('check the payment account',()=>commerceStripe().v2.core.accounts.retrieve(accountId,{include:['configuration.merchant','defaults']}));
  if(account.id!==accountId||account.livemode!==(mode==='live'))throw new ApiError('The connected account does not match the selected Stripe mode.',409);
  if(account.defaults?.responsibilities?.fees_collector!=='stripe'){
    await database().prepare("UPDATE commerce_accounts SET status='pending',updated_at=? WHERE account_id=? AND mode=?").bind(Date.now(),accountId,mode).run();
    throw new ApiError('FiveGen’s administrator must correct this seller account’s Stripe fee responsibility before new sales can start. Stripe processing fees must be paid by the connected account. Existing purchases remain available.',503);
  }
  const capabilities=account.configuration?.merchant?.capabilities;
  const ready=!account.closed&&capabilities?.card_payments?.status==='active'&&capabilities?.stripe_balance?.payouts?.status==='active';
  await database().prepare('UPDATE commerce_accounts SET status=?,updated_at=? WHERE account_id=? AND mode=?').bind(ready?'ready':'pending',Date.now(),accountId,mode).run();
  return ready;
}
export async function commerceAccount(owner:string,refresh=false) {
  let mode:'live'|'test'|null=null;try{mode=commerceMode();commerceStripe();}catch{return {configured:false,enabled:false,mode,connected:false,ready:false,accountId:null,creatorPlan:freeCreatorPlan()};}
  const plan=await creatorPlan(owner,mode);
  const row=await database().prepare('SELECT * FROM commerce_accounts WHERE owner=? AND mode=?').bind(owner,mode).first();
  const ready=row&&refresh?await refreshCommerceAccount(String(row.account_id),mode):row?.status==='ready';
  return {configured:true,enabled:binding('STRIPE_COMMERCE_ENABLED')==='true'&&binding('STRIPE_CONNECT_WEBHOOK_SECRET').startsWith('whsec_'),mode,connected:!!row,ready,accountId:row?String(row.account_id):null,creatorPlan:plan};
}
export async function connectCommerce(owner:string,email:string,origin:string,country?:string,productId?:string) {
  assertEnabled();if(productId)await ownedProduct(productId,owner);const mode=commerceMode(),client=commerceStripe();let row=await database().prepare('SELECT * FROM commerce_accounts WHERE owner=? AND mode=?').bind(owner,mode).first();
  if(!row){
    const selectedCountry=z.string().regex(/^[A-Z]{2}$/).safeParse(country);
    if(!selectedCountry.success)throw new ApiError('Choose your registered business country in account payment settings before connecting Stripe.',400);
    const account=await commerceProvider('create the connected account',()=>client.v2.core.accounts.create({
      contact_email:email,dashboard:'full',identity:{country:selectedCountry.data},
      configuration:{merchant:{capabilities:{card_payments:{requested:true}}}},
      defaults:{responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},
      metadata:{fivegen_owner:owner,fivegen_mode:mode},include:['configuration.merchant'],
    },{idempotencyKey:`fivegen-connect-v2-${mode}-${owner}`}));
    if(account.livemode!==(mode==='live'))throw new ApiError('The new Stripe account does not match the selected payment mode.',409);
    await database().prepare('INSERT OR IGNORE INTO commerce_accounts (key,owner,mode,account_id,status,updated_at) VALUES (?,?,?,?,?,?)').bind(`${mode}:${owner}`,owner,mode,account.id,'pending',Date.now()).run();
    row=await database().prepare('SELECT * FROM commerce_accounts WHERE owner=? AND mode=?').bind(owner,mode).first();
  }
  const builder=productId?await database().prepare('SELECT product_id FROM product_builder_workspaces WHERE product_id=? AND owner=?').bind(productId,owner).first():null;
  const profile=!productId,path=builder?`/build/${encodeURIComponent(productId!)}`:productId?`/?project=${encodeURIComponent(productId)}&area=commerce`:'/account/payments';
  const separator=builder||profile?'?':'&';
  const link=await commerceProvider('start Stripe onboarding',()=>client.v2.core.accountLinks.create({account:String(row!.account_id),use_case:{type:'account_onboarding',account_onboarding:{configurations:['merchant'],refresh_url:origin+path+(builder||profile?'?connect=refresh':''),return_url:origin+path+separator+'connect=returned'}}}));
  if(link.livemode!==(mode==='live'))throw new ApiError('The Stripe onboarding link does not match this payment environment.',409);
  return {url:link.url};
}
export async function getCommerceOffer(productId:string,owner:string):Promise<CommerceOffer> {
  const product=await ownedProduct(productId,owner),row=await database().prepare('SELECT * FROM commerce_offers WHERE product_id=? AND owner=?').bind(productId,owner).first();
  return row?{enabled:!!row.enabled&&row.enabled_mode===(binding('STRIPE_MODE')==='live'?'live':'test'),amount:Number(row.amount),currency:String(row.currency) as CommerceOffer['currency'],intakePrompt:String(row.intake_prompt),meetingUrl:String(row.meeting_url),updatedAt:Number(row.updated_at)}:{enabled:false,amount:Math.max(50,Number(product.price)),currency:'usd',intakePrompt:'What would you like help with during our session?',meetingUrl:'',updatedAt:0};
}
export async function assertCommerceContent(product:Record<string,unknown>,selectedSnapshot?:BuilderDeliverySnapshot){
  const builder=await builderPublishedDelivery(String(product.id));
  if(builder){
    const snapshot=selectedSnapshot||builder.snapshot;
    const mixedSessions=(snapshot.studio?.custom?.deliveryKinds as string[]|undefined)?.includes('sessions')||(snapshot.studio?.custom?.blocks as {kind?:string}[]|undefined)?.some(block=>block.kind==='session');
    const mixedCommunity=(snapshot.studio?.custom?.deliveryKinds as string[]|undefined)?.includes('community');
    if(snapshot.deliveryFamily==='service'||mixedSessions){
      if(snapshot.deliveryFamily==='service'&&(!snapshot.serviceScope.trim()||!snapshot.preparation.trim()))throw new ApiError('Add clear service scope and customer preparation before selling this service.',409);
      await assertServiceIntegrationReady(String(product.owner),snapshot.studio?.service||{});
      if(!['jitsi','google-meet','zoom'].includes(snapshot.studio?.service?.meetingProvider||'manual')&&!safeDeliveryUrl(snapshot.studio?.service?.meetingUrl||snapshot.meetingUrl))throw new ApiError('Add a private HTTPS meeting link or choose automatic meeting links.',409);
      const slot=await database().prepare("SELECT s.id FROM commerce_slots s WHERE s.product_id=? AND s.owner=? AND s.starts_at>? AND NOT EXISTS(SELECT 1 FROM commerce_bookings b WHERE b.slot_id=s.id AND b.status='confirmed' AND b.mode=?) AND NOT EXISTS(SELECT 1 FROM product_service_sessions ps WHERE ps.slot_id=s.id AND ps.status='confirmed' AND ps.mode=?) LIMIT 1").bind(product.id,product.owner,Date.now(),commerceMode(),commerceMode()).first();
      if(!slot)throw new ApiError('This service needs an available session time before accepting a new purchase.',409);
    }
    if(snapshot.deliveryFamily==='community'||mixedCommunity){
      if(!snapshot.studio?.community?.enabled&&!safeDeliveryUrl(snapshot.communityUrl))throw new ApiError('Set up your community or add a private HTTPS invitation link.',409);
    }
    if(!['service','community'].includes(snapshot.deliveryFamily)&&!mixedSessions&&!mixedCommunity&&!snapshot.uploadIds.length&&!snapshot.files.length&&!snapshot.sections.length&&!(snapshot.studio?.design&&designHasFinishedPages(snapshot.studio.design))&&!(snapshot.studio?.templates?.items as {duplicateUrl?:string}[]|undefined)?.some(item=>safeDeliveryUrl(item.duplicateUrl||''))&&!(snapshot.studio?.custom?.blocks as {kind?:string;body?:string;url?:string}[]|undefined)?.some(item=>item.body?.trim()||safeDeliveryUrl(item.url||'')||item.kind==='physical'))throw new ApiError('Add content or original files before selling this product.',409);
    if(snapshot.studio?.design&&!designHasFinishedPages(snapshot.studio.design))throw new ApiError('Finish every included design page before selling this product.',409);
    if(snapshot.sections.some(section=>!section.title.trim()||!sectionHasContent(section))||snapshot.files.some(file=>!file.content.trim()))throw new ApiError('Finish every included section and resource before selling this product.',409);
    await verifyBuilderDelivery({id:product.id,owner:product.owner},snapshot,true);return;
  }
  if(isConsulting(String(product.format)))return;
  const content=contentSchema.parse(JSON.parse(String(product.content))),error=publishContentError(content);if(error)throw new ApiError(error,409);
  const videos=Array.from(new Set(content.sections.map(section=>section.videoId).filter((id):id is string=>!!id)));
  if(videos.length){const found=await database().prepare(`SELECT COUNT(*) AS count FROM uploads WHERE id IN (${videos.map(()=>'?').join(',')}) AND product_id=? AND owner=? AND status='completed' AND mime LIKE 'video/%' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)`).bind(...videos,product.id,product.owner).first();if(Number(found?.count)!==videos.length)throw new ApiError('Finish uploading each lesson recording before selling this product.',409);}
}
function safeDeliveryUrl(value:string){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}
export async function saveCommerceOffer(productId:string,owner:string,input:unknown) {
  const value=commerceOfferSchema.parse(input),product=await ownedProduct(productId,owner),mode=binding('STRIPE_MODE')==='live'?'live':'test';
  let builderVersion:number|null=null;
  if(value.enabled){if(product.archived_at!=null)throw new ApiError('Restore this product before enabling sales.',409);assertEnabled();const account=await commerceAccount(owner,true);if(!account.ready)throw new ApiError('Finish Stripe onboarding before enabling sales.',409);const builder=await builderPublishedDelivery(productId),page=Number(builder?.row.published_at)>0?builder!.row:await database().prepare('SELECT product_id FROM growth_funnels WHERE product_id=? AND owner=? AND published_at IS NOT NULL').bind(productId,owner).first();if(!page)throw new ApiError('Publish the product page before enabling sales.',409);if(builder){const workspace=await database().prepare('SELECT version FROM product_builder_workspaces WHERE product_id=? AND owner=?').bind(productId,owner).first();if(Number(workspace?.version)!==Number(builder.row.version))throw new ApiError('Publish your latest changes before starting sales.',409);builderVersion=Number(builder.row.version);const shown=JSON.parse(String(builder.row.public_snapshot));if(value.amount!==shown.priceCents||value.currency!==shown.currency)throw new ApiError('Publish this price before starting sales.',409);}await assertCommerceContent(product);if(!builder&&isConsulting(String(product.format))&&!value.meetingUrl)throw new ApiError('Add the private meeting link for consulting customers.',409);}
  const now=Math.max(Date.now(),value.expectedUpdatedAt+1);
  const guard='(?=0 OR EXISTS(SELECT 1 FROM products WHERE id=? AND owner=? AND archived_at IS NULL AND updated_at=?)) AND (? IS NULL OR EXISTS(SELECT 1 FROM product_builder_publications b JOIN product_builder_workspaces w ON w.product_id=b.product_id AND w.owner=b.owner WHERE b.product_id=? AND b.owner=? AND b.version=? AND b.published_at>0 AND w.version=b.version))',guardValues=[+value.enabled,productId,owner,product.updated_at,builderVersion,productId,owner,builderVersion];
  const result=value.expectedUpdatedAt===0?await database().prepare(`INSERT OR IGNORE INTO commerce_offers (product_id,owner,enabled,enabled_mode,amount,currency,intake_prompt,meeting_url,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(productId,owner,+value.enabled,mode,value.amount,value.currency,value.intakePrompt,value.meetingUrl,now,...guardValues).run():await database().prepare(`UPDATE commerce_offers SET enabled=?,enabled_mode=?,amount=?,currency=?,intake_prompt=?,meeting_url=?,updated_at=? WHERE product_id=? AND owner=? AND updated_at=? AND ${guard}`).bind(+value.enabled,mode,value.amount,value.currency,value.intakePrompt,value.meetingUrl,now,productId,owner,value.expectedUpdatedAt,...guardValues).run();
  if(!result.meta.changes)throw new ApiError('Checkout settings changed in another tab. Reload before saving.',409);return getCommerceOffer(productId,owner);
}
export async function publicCommerceOffer(slug:string) {
  let mode;try{assertEnabled();mode=commerceMode();}catch{return null;}
  const row=await publicCommerceRow(slug,mode);
  return row?{amount:Number(row.amount),currency:String(row.currency),title:String(row.title),mode,...(row.publication_version?{publicationVersion:Number(row.publication_version)}:{})}:null;
}
async function publicCommerceRow(slug:string,mode:'live'|'test'):Promise<(Record<string,unknown>&{title:string})|null>{
 const row=await database().prepare(`SELECT o.*,f.title AS funnel_title,b.version AS publication_version,b.public_snapshot,b.content_snapshot,a.account_id FROM commerce_offers o
 JOIN products p ON p.id=o.product_id AND p.owner=o.owner AND p.archived_at IS NULL
 JOIN commerce_accounts a ON a.owner=o.owner AND a.mode=? AND a.status='ready'
 LEFT JOIN product_builder_publications b ON b.product_id=o.product_id AND b.owner=o.owner
 LEFT JOIN growth_funnels f ON f.product_id=o.product_id AND f.owner=o.owner
 WHERE ((b.slug=? AND b.published_at>0 AND json_extract(b.public_snapshot,'$.priceCents')=o.amount AND json_extract(b.public_snapshot,'$.currency')=o.currency) OR (b.product_id IS NULL AND f.slug=? AND f.published_at IS NOT NULL)) AND o.enabled=1 AND o.enabled_mode=?`).bind(mode,slug,slug,mode).first();
 if(!row)return null;
 return {...row,title:row.public_snapshot?String(JSON.parse(String(row.public_snapshot)).title):String(row.funnel_title)};
}
export async function commerceHash(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
function cookieValue(req:Request,name:string){return req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
export function commerceCookie(orderId:string,token:string,origin:string){return `fivegen_purchase_${orderId.replaceAll('-','')}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${origin.startsWith('https://')?'; Secure':''}`;}
async function cookieOwns(req:Request,order:Record<string,unknown>){const value=cookieValue(req,`fivegen_purchase_${String(order.id).replaceAll('-','')}`);return !!value&&Number(order.created_at)>Date.now()-30*86400000&&await commerceHash(value)===order.access_hash;}
export async function createCommerceCheckout(req:Request,input:unknown) {
  assertEnabled();const value=z.object({slug:z.string().min(1).max(100),email:z.string().trim().email().max(254),requestId:z.string().uuid(),expectedPublicationVersion:z.number().int().min(1).optional(),campaign:z.string().transform(value=>/^[a-zA-Z0-9_-]{1,80}$/.test(value)?value:'').default('')}).parse(input),email=value.email.toLowerCase(),mode=commerceMode(),client=commerceStripe(),db=database();
  const row=await publicCommerceRow(value.slug,mode);if(!row)throw new ApiError('This offer is not available for purchase.',404);
  if(row.publication_version&&value.expectedPublicationVersion!==Number(row.publication_version))throw new ApiError('This product changed. Reload its page to review the current offer before paying.',409);
  await assertCommerceContent(await ownedProduct(String(row.product_id),String(row.owner)));
  const account=await commerceAccount(String(row.owner),true);if(!account.ready)throw new ApiError('This creator cannot accept payments yet.',409);
  const existing=await db.prepare('SELECT * FROM commerce_orders WHERE id=?').bind(value.requestId).first();let token='';
  if(existing){if(existing.email!==email||existing.product_id!==row.product_id||existing.account_id!==row.account_id||existing.mode!==mode||!await cookieOwns(req,existing))throw new ApiError('Start a new checkout attempt.',409);if(existing.status!=='pending')throw new ApiError('This checkout is already complete. Open your customer portal.',409);}
  else {const recent=await db.prepare('SELECT COUNT(*) AS count FROM commerce_orders WHERE product_id=? AND created_at>?').bind(row.product_id,Date.now()-3600000).first();if(Number(recent?.count)>300)throw new ApiError('Too many checkout attempts. Try again later.',429);token=crypto.randomUUID()+crypto.randomUUID();const now=Date.now(),hash=await commerceHash(token),plan=await creatorPlan(String(row.owner),mode,now);
   if(row.publication_version){
    const reviewed=JSON.parse(String(row.content_snapshot));
    const snapshot=builderDeliverySnapshotSchema.parse({...reviewed,...builderPublishedPresentation(reviewed,JSON.parse(String(row.public_snapshot)))});
    const results=await db.batch([
     db.prepare(`INSERT INTO commerce_orders (id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at,campaign,expected_fee_bps,expected_fee_amount,fee_plan_id) SELECT ?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM product_builder_publications b JOIN commerce_offers o ON o.product_id=b.product_id WHERE b.product_id=? AND b.version=? AND o.enabled=1 AND o.enabled_mode=? AND o.updated_at=?)`).bind(value.requestId,row.owner,row.product_id,row.account_id,mode,email,row.amount,row.currency,row.title,hash,now,value.campaign,plan.commissionBps,commerceCommission(Number(row.amount),plan.commissionBps),plan.id,row.product_id,row.publication_version,mode,row.updated_at),
     db.prepare('INSERT INTO product_builder_order_snapshots (order_id,product_id,publication_version,snapshot,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM commerce_orders WHERE id=? AND access_hash=?)').bind(value.requestId,row.product_id,row.publication_version,JSON.stringify(snapshot),now,value.requestId,hash),
    ]);if(!results[0].meta.changes)throw new ApiError('This product changed. Reload the page before paying.',409);
   }else {
    const reserved=await db.prepare(`INSERT INTO commerce_orders (id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at,campaign,expected_fee_bps,expected_fee_amount,fee_plan_id)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM products p
      JOIN commerce_offers o ON o.product_id=p.id AND o.owner=p.owner
      JOIN growth_funnels f ON f.product_id=p.id AND f.owner=p.owner
      JOIN commerce_accounts a ON a.owner=p.owner AND a.mode=o.enabled_mode
      WHERE p.id=? AND p.owner=? AND f.slug=? AND f.published_at IS NOT NULL
      AND o.enabled=1 AND o.enabled_mode=? AND o.updated_at=? AND a.account_id=? AND a.status='ready'
      AND NOT EXISTS(SELECT 1 FROM product_builder_publications WHERE product_id=p.id))`)
      .bind(value.requestId,row.owner,row.product_id,row.account_id,mode,email,row.amount,row.currency,row.title,'pending',hash,now,value.campaign,plan.commissionBps,commerceCommission(Number(row.amount),plan.commissionBps),plan.id,row.product_id,row.owner,value.slug,mode,row.updated_at,row.account_id).run();
    if(!reserved.meta.changes)throw new ApiError('This product changed or was removed. Reload the page before paying.',409);
   }
  }
  if(row.publication_version){const frozen=await db.prepare('SELECT publication_version FROM product_builder_order_snapshots WHERE order_id=?').bind(value.requestId).first();if(Number(frozen?.publication_version)!==Number(row.publication_version))throw new ApiError('This checkout belongs to an earlier offer. Start a new checkout from the product page.',409);}
  const order=existing||await db.prepare('SELECT * FROM commerce_orders WHERE id=?').bind(value.requestId).first();const origin=new URL(req.url).origin;
  const session=await commerceProvider('open secure checkout',()=>client.checkout.sessions.create({mode:'payment',payment_method_types:['card'],customer_email:email,client_reference_id:value.requestId,metadata:{fivegen_order:value.requestId,fivegen_product:String(row.product_id)},payment_intent_data:{metadata:{fivegen_order:value.requestId},...(Number(order!.expected_fee_bps)>0?{application_fee_amount:Number(order!.expected_fee_amount)}:{})},line_items:[{quantity:1,price_data:{currency:String(order!.currency),unit_amount:Number(order!.amount),product_data:{name:String(order!.title).slice(0,120)}}}],success_url:`${origin}/customer?order=${value.requestId}`,cancel_url:`${origin}/${row.publication_version?'b':'g'}/${encodeURIComponent(value.slug)}`},{stripeAccount:String(row.account_id),idempotencyKey:`fivegen-order-${mode}-${value.requestId}`}));
  await db.prepare('UPDATE commerce_orders SET session_id=? WHERE id=? AND session_id IS NULL').bind(session.id,value.requestId).run();
  if(!session.url)throw new ApiError('Stripe did not return a checkout page.',502);
  return {url:session.url,orderId:value.requestId,cookie:token?commerceCookie(value.requestId,token,origin):null};
}
function objectId(value:string|{id:string}|null|undefined){return typeof value==='string'?value:value?.id||null;}
export async function recordCommerceEarnings(order:Record<string,unknown>,payment:Stripe.PaymentIntent,charge:Stripe.Charge){
  const fee=payment.application_fee_amount||0;
  if(fee!==Number(order.expected_fee_amount)||charge.application_fee_amount!=null&&charge.application_fee_amount!==fee)throw new ApiError('Payment commission does not match the checkout intent.',400);
  const value=commerceFeeSnapshot(charge,fee),db=database();
  await db.prepare(`INSERT INTO commerce_earnings (order_id,charge_id,charge_application_fee_amount,refunded_amount,disputed,balance_transaction_id,settlement_amount,settlement_currency,stripe_fee_amount,platform_fee_amount,creator_net_amount,availability,available_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(order_id) DO UPDATE SET charge_id=excluded.charge_id,charge_application_fee_amount=excluded.charge_application_fee_amount,refunded_amount=MAX(commerce_earnings.refunded_amount,excluded.refunded_amount),disputed=MAX(commerce_earnings.disputed,excluded.disputed),balance_transaction_id=COALESCE(excluded.balance_transaction_id,commerce_earnings.balance_transaction_id),settlement_amount=COALESCE(excluded.settlement_amount,commerce_earnings.settlement_amount),settlement_currency=COALESCE(excluded.settlement_currency,commerce_earnings.settlement_currency),stripe_fee_amount=COALESCE(excluded.stripe_fee_amount,commerce_earnings.stripe_fee_amount),platform_fee_amount=COALESCE(excluded.platform_fee_amount,commerce_earnings.platform_fee_amount),creator_net_amount=COALESCE(excluded.creator_net_amount,commerce_earnings.creator_net_amount),availability=CASE WHEN excluded.balance_transaction_id IS NULL THEN commerce_earnings.availability ELSE excluded.availability END,available_at=COALESCE(excluded.available_at,commerce_earnings.available_at),updated_at=excluded.updated_at`).bind(order.id,value.chargeId,value.chargeApplicationFeeAmount,value.refundedAmount,+value.disputed,value.balanceTransactionId,value.settlementAmount,value.settlementCurrency,value.stripeFeeAmount,value.platformFeeAmount,value.creatorNetAmount,value.availability,value.availableAt,Date.now()).run();
  return value.balanceTransactionId!==null;
}
// Owner and environment are always resolved server-side before any provider read.
// This function performs no charge, transfer, payout or refund operations.
export async function refreshCommerceOrderEarnings(orderId:string,owner:string):Promise<boolean>{
 const mode=commerceMode(),db=database(),order=await db.prepare('SELECT * FROM commerce_orders WHERE id=? AND owner=? AND mode=?').bind(orderId,owner,mode).first();
 if(!order)throw new ApiError('Sale not found.',404);
 if(!['paid','revoked'].includes(String(order.status))||!order.payment_intent)return false;
 const known=await db.prepare('SELECT key FROM commerce_accounts WHERE owner=? AND account_id=? AND mode=?').bind(owner,order.account_id,mode).first();
 if(!known)throw new ApiError('The sale does not belong to this connected account.',409);
 const payment=await commerceProvider('refresh sale earnings',()=>commerceStripe().paymentIntents.retrieve(String(order.payment_intent),{expand:['latest_charge.balance_transaction']},{stripeAccount:String(order.account_id),timeout:5000,maxNetworkRetries:0}));
 const recurring=await db.prepare('SELECT invoice_id FROM product_subscription_renewals WHERE order_id=?').bind(orderId).first();
 if(payment.id!==order.payment_intent||payment.status!=='succeeded'||payment.amount_received!==order.amount||payment.currency!==order.currency||payment.livemode!==(mode==='live')||!recurring&&payment.metadata?.fivegen_order!==orderId)throw new ApiError('The sale does not match the verified payment.',409);
 const charge=payment.latest_charge;
 if(!charge||typeof charge==='string'||objectId(charge.payment_intent)!==payment.id||charge.amount!==order.amount||charge.currency!==order.currency||charge.livemode!==(mode==='live'))throw new ApiError('Sale charge verification is incomplete.',502);
 if(charge.amount_refunded>0||charge.disputed)await revokeCommercePayment(String(order.account_id),mode,payment.id,charge.disputed?'disputed':'refunded');
 return recordCommerceEarnings(order,payment,charge);
}
export async function revokeCommercePayment(account:string,mode:string,paymentIntent:string,reason:string) {
  const db=database(),now=Date.now();await db.batch([
    db.prepare('INSERT OR IGNORE INTO commerce_revocations (key,account_id,mode,payment_intent,reason,created_at) VALUES (?,?,?,?,?,?)').bind(`${mode}:${account}:${paymentIntent}`,account,mode,paymentIntent,reason,now),
    db.prepare("UPDATE commerce_orders SET status='revoked' WHERE account_id=? AND mode=? AND payment_intent=?").bind(account,mode,paymentIntent),
    db.prepare("UPDATE commerce_bookings SET status='cancelled' WHERE order_id IN (SELECT id FROM commerce_orders WHERE account_id=? AND mode=? AND payment_intent=?)").bind(account,mode,paymentIntent),
  ]);
  const revoked=await db.prepare('SELECT id FROM commerce_orders WHERE account_id=? AND mode=? AND payment_intent=?').bind(account,mode,paymentIntent).all();for(const order of revoked.results)await revokeStudioEntitlements(String(order.id));
}
export async function fulfillCommerceSession(sessionId:string,account:string) {
  const advanced=await database().prepare('SELECT i.order_id FROM product_commerce_intents i JOIN commerce_orders o ON o.id=i.order_id WHERE o.session_id=? AND o.account_id=?').bind(sessionId,account).first();
  if(advanced){await fulfillStudioSession(sessionId,account);return;}
  const client=commerceStripe(),mode=commerceMode(),db=database(),session=await commerceProvider('verify the payment',()=>client.checkout.sessions.retrieve(sessionId,{expand:['payment_intent.latest_charge']},{stripeAccount:account}));
  const id=session.metadata?.fivegen_order;if(!id)return;
  const order=await db.prepare('SELECT * FROM commerce_orders WHERE id=? AND account_id=? AND mode=?').bind(id,account,mode).first();if(!order)throw new ApiError('Unknown checkout intent.',400);
  if(session.livemode!==(mode==='live')||session.mode!=='payment'||session.client_reference_id!==id||session.metadata?.fivegen_product!==order.product_id||session.amount_total!==order.amount||session.currency!==order.currency||order.session_id&&order.session_id!==session.id)throw new ApiError('Payment does not match the checkout intent.',400);
  // Stripe may not populate customer_details until checkout completes. An
  // abandoned checkout stays pending; it must not break the buyer's library.
  if(session.payment_status!=='paid'||session.status!=='complete')return;
  if(session.customer_details?.email?.trim().toLowerCase()!==order.email)throw new ApiError('Payment does not match the checkout intent.',400);
  const payment=session.payment_intent;if(!payment||typeof payment==='string')throw new ApiError('Payment verification is incomplete.',502);
  if(payment.status!=='succeeded'||payment.amount_received!==order.amount||payment.currency!==order.currency||payment.livemode!==(mode==='live')||payment.metadata?.fivegen_order!==id||(payment.application_fee_amount||0)!==Number(order.expected_fee_amount))throw new ApiError('Payment verification failed.',400);
  const charge=payment.latest_charge;if(!charge||typeof charge==='string')throw new ApiError('Payment charge verification is incomplete.',502);
  if(objectId(charge.payment_intent)!==payment.id||charge.amount!==order.amount||charge.currency!==order.currency||charge.livemode!==(mode==='live'))throw new ApiError('Payment charge verification failed.',400);
  if(charge.application_fee_amount!=null&&charge.application_fee_amount!==Number(order.expected_fee_amount))throw new ApiError('Payment commission verification failed.',400);
  if(charge.amount_refunded>0||charge.disputed)await revokeCommercePayment(account,mode,payment.id,charge.disputed?'disputed':'refunded');
  const now=Date.now();await db.batch([
    db.prepare("UPDATE commerce_orders SET session_id=?,payment_intent=?,status=CASE WHEN status='revoked' OR EXISTS(SELECT 1 FROM commerce_revocations WHERE account_id=? AND mode=? AND payment_intent=?) THEN 'revoked' ELSE 'paid' END,paid_at=COALESCE(paid_at,?) WHERE id=? AND account_id=? AND mode=?").bind(session.id,payment.id,account,mode,payment.id,now,id,account,mode),
    ...(order.status==='pending'?[commercePurchaseEmailStatement(id,now)]:[]),
  ]);
  // A sale advances an existing lead; purchase alone never grants marketing consent.
  await db.prepare("UPDATE growth_leads SET status='won',updated_at=? WHERE product_id=? AND owner=? AND email=? AND EXISTS(SELECT 1 FROM commerce_orders WHERE id=? AND status='paid' AND mode='live')").bind(now,order.product_id,order.owner,order.email,id).run();
  await enrollAutomationPurchase(id).catch(()=>{console.error('Purchase automation will retry during reconciliation.');});
  // Fee publication and restricted balance-read permissions must never block
  // delivery of a fully verified paid product. Owners can refresh the ledger.
  await recordCommerceEarnings(order,payment,charge).catch(()=>{console.warn('Sale earnings will retry during reconciliation.');});
  await refreshCommerceOrderEarnings(String(order.id),String(order.owner)).catch(()=>{console.warn('Detailed Stripe fees are not available yet.');});
}
export async function processCommerceEvent(event:Stripe.Event) {
  const mode=commerceMode(),db=database();if(event.livemode!==(mode==='live'))throw new ApiError('Wrong Stripe payment mode.',400);
  const account=event.account;if(!account)return;const known=await db.prepare('SELECT key FROM commerce_accounts WHERE account_id=? AND mode=?').bind(account,mode).first();if(!known)return;
  if(await db.prepare('SELECT id FROM commerce_events WHERE id=?').bind(event.id).first())return;
  if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded')await fulfillCommerceSession((event.data.object as Stripe.Checkout.Session).id,account);
  else if(event.type==='charge.refunded'){const charge=event.data.object as Stripe.Charge,pi=objectId(charge.payment_intent);if(pi&&charge.amount_refunded>0)await revokeCommercePayment(account,mode,pi,'refunded');}
  else if(event.type==='charge.dispute.created'||event.type==='charge.dispute.closed'){const dispute=event.data.object as Stripe.Dispute,pi=objectId(dispute.payment_intent);if(pi)await revokeCommercePayment(account,mode,pi,'disputed');}
  else if(event.type==='account.updated')await refreshCommerceAccount(account,mode);
  else if(event.type.startsWith('customer.subscription.')||event.type==='invoice.paid'||event.type==='invoice.payment_failed')await studioSubscriptionEvent(event,account);
  await db.prepare('INSERT OR IGNORE INTO commerce_events (id,type,created_at) VALUES (?,?,?)').bind(event.id,event.type,Date.now()).run();
}
export async function verifyCommerceWebhook(req:Request) {
  const secret=binding('STRIPE_CONNECT_WEBHOOK_SECRET');if(!secret.startsWith('whsec_'))throw new ApiError('Creator payment webhooks are not configured.',503);
  const raw=await req.text();let event:Stripe.Event;try{event=await commerceStripe().webhooks.constructEventAsync(raw,req.headers.get('stripe-signature')||'',secret);}catch{throw new ApiError('Invalid Stripe signature.',400);}await processCommerceEvent(event);
}
export async function customerOrder(req:Request,id:string,paid=true,options:{purchaserOnly?:boolean}={}):Promise<Record<string,unknown>&{accessRole:'purchaser'|'team'}> {
  const order=await database().prepare('SELECT * FROM commerce_orders WHERE id=? AND mode=?').bind(id,commerceMode()).first();if(!order)throw new ApiError('Purchase not found.',404);
  const user=await identity({allowUnaccepted:true}).catch(()=>null);
  let allowed=await cookieOwns(req,order)||!!user?.email&&user.email.toLowerCase()===order.email;
  let accessRole:'purchaser'|'team'='purchaser';
  if(!allowed){const parent=await database().prepare('SELECT parent_order_id FROM product_bundle_entitlements WHERE order_id=? UNION SELECT parent_order_id FROM product_subscription_renewals WHERE order_id=? AND parent_order_id!=order_id LIMIT 1').bind(id,id).first();if(parent){const access=await customerOrder(req,String(parent.parent_order_id),paid,options).catch(()=>null);allowed=!!access;if(access)accessRole=access.accessRole;}}
  if(!allowed&&!options.purchaserOnly&&user?.email&&await teamSeatAllows(order,user.email)){allowed=true;accessRole='team';}
  if(!allowed)throw new ApiError('Open this page in the browser you purchased with, or sign in using your purchase email.',403);
  if(paid&&order.status!=='paid')throw new ApiError(order.status==='revoked'?'Access was revoked after a refund or dispute.':'Payment has not been confirmed yet.',403);
  if(paid&&await database().prepare('SELECT order_id FROM product_commerce_intents WHERE order_id=?').bind(id).first())await assertStudioSubscriptionAccess(id);
  if(paid){const parent=await database().prepare('SELECT parent_order_id FROM product_bundle_entitlements WHERE order_id=? UNION SELECT parent_order_id FROM product_subscription_renewals WHERE order_id=? AND parent_order_id!=order_id LIMIT 1').bind(id,id).first();if(parent){const payment=await database().prepare('SELECT status FROM commerce_orders WHERE id=? AND mode=?').bind(parent.parent_order_id,commerceMode()).first();if(payment?.status!=='paid')throw new ApiError('The purchase that includes this product is no longer active.',403);await assertStudioSubscriptionAccess(String(parent.parent_order_id));}}
  return {...order,accessRole};
}
export async function customerLibraryStatus(req:Request,id?:string) {
  let paymentStatusError:string|undefined;
  if(id){
    // Ownership is checked before querying Stripe, even if another purchase in
    // this browser is already paid. Identifiers alone never authorize recovery.
    const order=await customerOrder(req,id,false);
    if(order.status==='pending'&&order.session_id){
      try{await fulfillCommerceSession(String(order.session_id),String(order.account_id));}
      catch(error){
        if(!(error instanceof ApiError))throw error;
        paymentStatusError='We could not refresh this checkout’s payment status. Your other paid purchases are still available. Please try again shortly.';
      }
    }
  }
  const mode=commerceMode(),user=await identity({allowUnaccepted:true}).catch(()=>null);
  const cookieIds=(req.headers.get('cookie')||'').split(';').map(c=>/^fivegen_purchase_([a-f0-9]{8})([a-f0-9]{4})([a-f0-9]{4})([a-f0-9]{4})([a-f0-9]{12})=/.exec(c.trim())).filter(Boolean).slice(0,20).map(m=>m!.slice(1).join('-'));
  const teamIds=user?.email?await teamSeatOrderIds(user.email,mode):[];
  const ids=Array.from(new Set([id||'',...cookieIds,...teamIds]));
  const rows=await database().prepare(`SELECT o.*,EXISTS(SELECT 1 FROM product_commerce_intents i WHERE i.order_id=o.id AND i.pricing_model='subscription') subscription FROM commerce_orders o WHERE mode=? AND (email=? OR id IN (${ids.map(()=>'?').join(',')}) OR id IN(SELECT order_id FROM product_bundle_entitlements WHERE parent_order_id IN(${ids.map(()=>'?').join(',')}))) AND NOT EXISTS(SELECT 1 FROM product_subscription_renewals r WHERE r.order_id=o.id AND r.parent_order_id!=r.order_id) ORDER BY created_at DESC LIMIT 100`).bind(mode,user?.email?.toLowerCase()||'',...ids,...ids).all();
  const orders=[];for(const order of rows.results){if(!await customerOrder(req,String(order.id),false).catch(()=>null))continue;orders.push({id:order.id,title:order.title,status:order.status,amount:order.amount,currency:order.currency,mode:order.mode,createdAt:order.created_at,subscription:!!order.subscription});}return {orders,...(paymentStatusError?{paymentStatusError}:{})};
}
export async function customerLibrary(req:Request,id?:string){return (await customerLibraryStatus(req,id)).orders;}
export async function customerProduct(req:Request,id:string) {
  const order=await customerOrder(req,id),product=await database().prepare('SELECT * FROM products WHERE id=? AND owner=?').bind(order.product_id,order.owner).first();if(!product)throw new ApiError('Product unavailable. Contact your creator.',404);
  const raw=await builderOrderDelivery(id),frozen=await builderBuyerDelivery(id),content=frozen||contentSchema.parse(JSON.parse(String(product.content))),offer=frozen||await getCommerceOffer(String(order.product_id),String(order.owner));
  const format=frozen?.format||String(product.format),presentation=builderBuyerPresentation(frozen,format);
  const custom=frozen?.studio?.custom;
  const service=(!raw||communityTierAllows(raw,'service','sessions'))&&(presentation.deliveryFamily==='service'||!!((custom?.deliveryKinds as string[]|undefined)?.includes('sessions')||(custom?.blocks as {kind?:string}[]|undefined)?.some(block=>block.kind==='session')));
  const booking=await database().prepare("SELECT b.id,b.intake,b.status,s.starts_at,s.ends_at FROM commerce_bookings b JOIN commerce_slots s ON s.id=b.slot_id WHERE b.order_id=? AND b.status='confirmed'").bind(id).first();
  const slots=service?(await database().prepare("SELECT s.id,s.starts_at,s.ends_at FROM commerce_slots s WHERE s.product_id=? AND s.starts_at>? AND NOT EXISTS(SELECT 1 FROM commerce_bookings b WHERE b.slot_id=s.id AND b.status='confirmed' AND b.mode=?) AND NOT EXISTS(SELECT 1 FROM product_service_sessions ps WHERE ps.slot_id=s.id AND ps.status='confirmed' AND ps.mode=?) ORDER BY s.starts_at LIMIT 100").bind(order.product_id,Date.now(),order.mode,order.mode).all()).results:[];
  const cover=await builderBuyerCover(order,frozen);
  const advancedLearning=['course','challenge'].includes(presentation.deliveryFamily)&&!!(frozen?.studio?.course||frozen?.studio?.challenge||content.sections.some(section=>section.studio));
  const sections=advancedLearning?await learningDeliverySections(req,id):content.sections;
  const studio=frozen?.studio?{...frozen.studio,pricing:frozen.studio.pricing?{model:frozen.studio.pricing.model,interval:frozen.studio.pricing.interval}:undefined}:undefined;
  return {id,slug:String(product.slug),accessRole:order.accessRole,title:frozen?.title||String(product.title),format,...presentation,studio,coverUrl:cover?`/api/commerce/customer/${encodeURIComponent(id)}/cover`:null,deliveryEmail:await purchaseEmailState(id),sections,files:(content.files||[]).map(f=>({name:f.name,description:f.description})),downloads:await builderDownloadMetadata(id,String(order.product_id),String(order.owner)),service,serviceScope:frozen?.serviceScope||'',preparation:frozen?.preparation||'',communityUrl:(presentation.deliveryFamily==='community'||(custom?.deliveryKinds as string[]|undefined)?.includes('community'))&&safeDeliveryUrl(frozen?.communityUrl||'')?frozen!.communityUrl:'',intakePrompt:offer.intakePrompt,meetingUrl:booking?offer.meetingUrl:'',booking,slots};
}
export async function customerCover(req:Request,id:string){const order=await customerOrder(req,id);return builderPrivateCover(order);}
export async function customerFile(req:Request,id:string,name:string) {
  const order=await customerOrder(req,id),frozen=await builderBuyerDelivery(id),product=frozen?null:await database().prepare('SELECT content FROM products WHERE id=? AND owner=?').bind(order.product_id,order.owner).first();if(!frozen&&!product)throw new ApiError('File not found.',404);const file=(frozen||contentSchema.parse(JSON.parse(String(product!.content)))).files?.find(f=>f.name===name);if(!file)throw new ApiError('File not found.',404);
  return new Response(file.content,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export async function customerVideo(req:Request,id:string,uploadId:string) {
  const order=await customerOrder(req,id),frozen=await builderBuyerDelivery(id),product=frozen?null:await database().prepare('SELECT content FROM products WHERE id=? AND owner=?').bind(order.product_id,order.owner).first();if(!frozen&&!product||!(frozen||contentSchema.parse(JSON.parse(String(product!.content)))).sections.some(s=>s.videoId===uploadId||s.studio?.audioId===uploadId))throw new ApiError('Recording not found.',404);
  const section=(frozen||contentSchema.parse(JSON.parse(String(product!.content)))).sections.find(section=>section.videoId===uploadId||section.studio?.audioId===uploadId);
  if(section&&['course','challenge'].includes(frozen?.deliveryFamily||'')&&(frozen?.studio?.course||frozen?.studio?.challenge||section.studio))await learnerSectionAccess(req,id,section.id||`section-${(frozen?.sections||[]).indexOf(section)}`);
  const file=await database().prepare("SELECT * FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND (mime LIKE 'video/%' OR mime LIKE 'audio/%')").bind(uploadId,order.product_id,order.owner).first();if(!file||String(file.object_key).startsWith('voice/')||await database().prepare('SELECT id FROM creator_voice_sources WHERE upload_id=? LIMIT 1').bind(uploadId).first())throw new ApiError('Recording not found.',404);
  const size=Number(file.size);let range:{offset:number;length:number}|undefined;
  if(req.headers.has('range')){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range')!);if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]?(match[2]?Number(match[2]):size-1):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});range={offset:start,length:Math.min(end,size-1)-start+1};}
  const obj=await (env as unknown as {BUCKET:R2Bucket}).BUCKET.get(String(file.object_key),range?{range}:undefined);if(!obj)throw new ApiError('Recording unavailable.',404);
  return new Response(obj.body,{status:range?206:200,headers:{'Content-Type':String(file.mime),'Content-Length':String(range?.length||size),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${range.offset}-${range.offset+range.length-1}/${size}`}:{})}});
}
export async function customerUpload(req:Request,id:string,uploadId:string){const order=await customerOrder(req,id);return builderPrivateDownload(req,order,uploadId);}
export async function commerceSlots(productId:string,owner:string){await ownedProduct(productId,owner);const rows=await database().prepare("SELECT s.*,EXISTS(SELECT 1 FROM commerce_bookings b WHERE b.slot_id=s.id AND b.status='confirmed' AND b.mode=?) OR EXISTS(SELECT 1 FROM product_service_sessions ps WHERE ps.slot_id=s.id AND ps.status='confirmed' AND ps.mode=?) AS booked FROM commerce_slots s WHERE s.product_id=? AND s.owner=? AND s.starts_at>? ORDER BY s.starts_at LIMIT 100").bind(commerceMode(),commerceMode(),productId,owner,Date.now()-86400000).all();return rows.results.map(r=>({id:String(r.id),startsAt:Number(r.starts_at),endsAt:Number(r.ends_at),booked:!!r.booked}));}
export async function addCommerceSlot(productId:string,owner:string,input:unknown){await ownedProduct(productId,owner);const value=z.object({startsAt:z.number().int().min(Date.now()+60000).max(Date.now()+366*86400000),durationMinutes:z.number().int().min(15).max(240)}).parse(input),end=value.startsAt+value.durationMinutes*60000;const result=await database().prepare('INSERT INTO commerce_slots (id,owner,product_id,starts_at,ends_at) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM commerce_slots WHERE owner=? AND starts_at<? AND ends_at>?)').bind(crypto.randomUUID(),owner,productId,value.startsAt,end,owner,end,value.startsAt).run();if(!result.meta.changes)throw new ApiError('This time overlaps another session slot.',409);return commerceSlots(productId,owner);}
export async function removeCommerceSlot(productId:string,owner:string,id:string){await ownedProduct(productId,owner);const result=await database().prepare("DELETE FROM commerce_slots WHERE id=? AND owner=? AND product_id=? AND NOT EXISTS(SELECT 1 FROM commerce_bookings WHERE slot_id=? AND status='confirmed') AND NOT EXISTS(SELECT 1 FROM product_service_sessions WHERE slot_id=? AND status='confirmed')").bind(id,owner,productId,id,id).run();if(!result.meta.changes)throw new ApiError('Cancel confirmed bookings for this slot in both test and live mode before removing it.',409);return commerceSlots(productId,owner);}
export async function bookCommerceSlot(req:Request,orderId:string,input:unknown){const order=await customerOrder(req,orderId,true,{purchaserOnly:true}),value=z.object({slotId:z.string().uuid(),intake:z.string().trim().min(5).max(5000)}).parse(input),frozen=await builderBuyerDelivery(orderId),product=await database().prepare('SELECT format FROM products WHERE id=? AND owner=?').bind(order.product_id,order.owner).first();const raw=await builderOrderDelivery(orderId);if(raw&&!communityTierAllows(raw,'service','sessions'))throw new ApiError('Your membership plan does not include sessions.',403);if(frozen?.studio?.service)throw new ApiError('Use the booking form in your client space so preparation and session limits are checked.',409);if(!product||!(frozen?frozen.deliveryFamily==='service':isConsulting(String(product.format))))throw new ApiError('This purchase does not include a session.',400);const id=crypto.randomUUID();try{const result=await database().prepare("INSERT INTO commerce_bookings (id,slot_id,order_id,owner,product_id,email,intake,mode,status,created_at) SELECT ?,s.id,?,?,?,?,?,?,'confirmed',? FROM commerce_slots s WHERE s.id=? AND s.product_id=? AND s.owner=? AND s.starts_at>? AND NOT EXISTS(SELECT 1 FROM product_service_sessions ps WHERE ps.slot_id=s.id AND ps.status='confirmed' AND ps.mode=?) AND EXISTS(SELECT 1 FROM commerce_orders WHERE id=? AND status='paid')").bind(id,orderId,order.owner,order.product_id,order.email,value.intake,order.mode,Date.now(),value.slotId,order.product_id,order.owner,Date.now(),order.mode,orderId).run();if(!result.meta.changes)throw new ApiError('That time is no longer available.',409);}catch(error){if(error instanceof ApiError)throw error;throw new ApiError('That slot or purchase already has a booking. Refresh the available times.',409);}return customerProduct(req,orderId);}
export async function cancelCommerceBooking(req:Request,orderId:string){await customerOrder(req,orderId,true,{purchaserOnly:true});await database().prepare("UPDATE commerce_bookings SET status='cancelled' WHERE order_id=? AND status='confirmed'").bind(orderId).run();return customerProduct(req,orderId);}
export async function cancelCreatorBooking(owner:string,productId:string,bookingId:string){await ownedProduct(productId,owner);const result=await database().prepare("UPDATE commerce_bookings SET status='cancelled' WHERE id=? AND owner=? AND product_id=? AND status='confirmed'").bind(bookingId,owner,productId).run();if(!result.meta.changes)throw new ApiError('Active booking not found.',404);return {cancelled:true};}
