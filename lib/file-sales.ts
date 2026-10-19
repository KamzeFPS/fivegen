import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {ApiError,binding,database,identity,ownedProduct,stripe,stripeConfigured,stripeMode} from './server';
import {slugify} from './product';
import {productPreset} from './product-presets';
import {saleDraftSchema,saleUploadIds,type SaleDraft,type SaleModule,type SaleModuleKind,type SaleReadiness,type FileSaleWorkspace} from './file-sale-contract';
import {commissionAmount} from './credit-policy';
import {verifyStoredUpload} from './upload-validation';

type Row=Record<string,unknown>;
type Buyer={userId:string;email:string;displayName?:string};
const noStore={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
export const fileSaleHeaders=noStore;
export function fileSalesEnabled(){return binding('FIVEGEN_FILE_SALES_ENABLED')==='true'&&binding('STRIPE_MODE')==='test';}
function requireFileSales(){if(!fileSalesEnabled())throw new ApiError('File selling is available only in the enabled Stripe test environment. Existing buyer access remains available.',503);}

export const fileSaleEventNames=new Set(['product_flow_started','upload_started','upload_completed','upload_failed','product_details_saved','price_saved','draft_resumed','payment_setup_started','payment_setup_returned','payment_readiness_changed','preview_opened','publish_attempted','publish_blocked','publish_succeeded','publish_failed','sales_link_copied','checkout_completed','entitlement_available','delivery_notification_failed']);
export async function fileSaleEvent(productId:string,owner:string,event:string,detail:Record<string,unknown>={},eventId=crypto.randomUUID()){
  if(!fileSaleEventNames.has(event))return false;
  // IDs and small enumerated categories only. Never persist access links, tokens,
  // file names/bodies, emails, bank details or provider error payloads.
  const safe:Record<string,string|number|boolean>={};
  for(const key of ['version','stage','state','reason','device','mode','module','paid','purpose']){
    const value=detail[key];
    if(typeof value==='boolean'||(typeof value==='number'&&Number.isSafeInteger(value)))safe[key]=value;
    else if(typeof value==='string'&&/^[a-z0-9_-]{1,40}$/i.test(value))safe[key]=value;
  }
  try{
    if(event==='payment_readiness_changed'){
      if(typeof safe.state!=='string')return false;
      // Owner workspace reads observe transitions; public page reads never write
      // this event. The condition runs with the insert so concurrent refreshes
      // cannot duplicate one observed state, including the initial observation.
      await database().prepare("INSERT OR IGNORE INTO file_sale_events (id,product_id,owner,event,detail,created_at) SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT json_extract(detail,'$.state') FROM file_sale_events WHERE product_id=? AND owner=? AND event='payment_readiness_changed' ORDER BY rowid DESC LIMIT 1),'')<>?")
        .bind(eventId,productId,owner,event,JSON.stringify(safe),Date.now(),productId,owner,safe.state).run();
    }else await database().prepare('INSERT OR IGNORE INTO file_sale_events (id,product_id,owner,event,detail,created_at) VALUES (?,?,?,?,?,?)').bind(eventId,productId,owner,event,JSON.stringify(safe),Date.now()).run();
    return true;
  }catch{
    // Analytics must never turn a saved draft, committed publication or granted
    // purchase into an apparent failure. No raw DB/provider payload is logged.
    return false;
  }
}

async function saleRow(productId:string,owner?:string){
  const product=owner?await ownedProduct(productId,owner):await database().prepare('SELECT * FROM products WHERE id=?').bind(productId).first();
  if(!product)throw new ApiError('Product not found.',404);
  const row=await database().prepare('SELECT * FROM file_sale_drafts WHERE product_id=?').bind(productId).first();
  if(!row)throw new ApiError('This product uses its existing editor. It has not been converted to a file sale.',404);
  return {product,row,draft:saleDraftSchema.parse(JSON.parse(String(row.data)))};
}
export async function fileSalePaymentReadiness(owner:string):Promise<SaleReadiness['payments']>{
  const result=(state:SaleReadiness['payments']['state'],message:string,recovery:SaleReadiness['payments']['recovery']=null):SaleReadiness['payments']=>({state,message,recovery,environment:'test'});
  if(!fileSalesEnabled())return result('disabled','New sales are disabled. An administrator must enable the isolated test environment.','admin');
  if(!stripeConfigured()||stripeMode()!=='test'||!binding('STRIPE_WEBHOOK_SECRET'))return result('unconfigured','The administrator must configure test payments and verified webhook delivery.','admin');
  const seller=await database().prepare('SELECT stripe_account FROM sellers WHERE owner=?').bind(owner).first();
  if(!seller?.stripe_account)return result('not_connected','No existing connected test seller account is linked. Ask the platform administrator to finish authorized payment setup.','admin');
  try{
    const account=await stripe(`accounts/${seller.stripe_account}`);
    if(account.charges_enabled===true&&account.payouts_enabled===true&&account.capabilities?.card_payments==='active')return result('eligible','Test payments are ready. Buyers receive only the modules included in the published offer.');
    const reason=String(account.requirements?.disabled_reason||'');
    if(reason.startsWith('rejected')||reason==='listed'||reason==='platform_paused')return result('restricted','The payment provider has restricted this seller account. Resolve the restriction in its dashboard.','admin');
    if(reason.includes('pending')||(account.requirements?.pending_verification?.length??0)>0)return result('pending','Payment information is under provider review. You can keep editing; new purchases remain unavailable.','refresh');
    return result('incomplete','Complete the existing seller account’s payment requirements in the provider dashboard, then refresh this status.','refresh');
  }catch{return result('unavailable','Payment status could not be verified. Keep editing and retry the check.','refresh');}
}

async function validAsset(product:Row,id:string,kind:'download'|'video'|'cover',verifyIntegrity=false){
  const row=await database().prepare("SELECT * FROM uploads WHERE id=? AND owner=? AND product_id=? AND status='completed'").bind(id,product.owner,product.id).first();
  if(!row||!row.sha256||!/^[a-f0-9]{64}$/.test(String(row.sha256)))return false;
  const mime=String(row.mime);
  if(kind==='download'&&!['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv'].includes(mime))return false;
  if(kind==='video'&&!['video/mp4','video/webm'].includes(mime))return false;
  if(kind==='cover'&&!['image/png','image/jpeg','image/webp'].includes(mime))return false;
  const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;
  if(!bucket)return false;
  try{const obj=await bucket.get(String(row.object_key));if(!obj)return false;if(verifyIntegrity){await verifyStoredUpload(obj.body,Number(row.size),String(row.sha256));return true;}const valid=obj.size===Number(row.size);await obj.body.cancel().catch(()=>{});return valid;}catch{return false;}
}
async function readinessFor(product:Row,draft:SaleDraft,verifyIntegrity=false):Promise<SaleReadiness>{
  const checks:SaleReadiness['checks']=[];
  const detailsReady=draft.title.trim().length>=3&&draft.description.trim().length>=12;
  checks.push({key:'details',ready:detailsReady,message:detailsReady?'Your product title and description are ready.':'Add a title of at least 3 characters and a description of at least 12 characters.',stage:'product'});
  let included=0;
  for(const module of draft.modules){
    if(!module.included)continue;included++;
    const ready=module.kind==='downloads'
      ?module.uploadIds.length>0&&(await Promise.all(module.uploadIds.map(id=>validAsset(product,id,'download',verifyIntegrity)))).every(Boolean)
      :module.sections.length>0&&(await Promise.all(module.sections.map(async s=>!!s.title.trim()&&(!!s.body.trim()||!!s.videoId)&&(!s.videoId||await validAsset(product,s.videoId,'video',verifyIntegrity))))).every(Boolean);
    checks.push({key:module.kind,ready,message:module.kind==='downloads'
      ?ready?`${module.uploadIds.length} original file${module.uploadIds.length===1?' is':'s are'} ready for private delivery.`:'Include at least one validated, available original file. Re-upload older unvalidated files.'
      :ready?`${module.sections.length} lesson${module.sections.length===1?' has':'s have'} content ready for the buyer.`:'Finish each included lesson with text or a validated recording. Remove unused lessons.',stage:'product'});
  }
  const coverReady=!draft.coverUploadId||await validAsset(product,draft.coverUploadId,'cover',verifyIntegrity);
  checks.push({key:'delivery',ready:included>0&&coverReady,message:!included?'Explicitly include at least one ready feature in this offer.':!coverReady?'Replace or remove the unavailable cover image.':'Private files and lessons are delivered through the buyer’s access page; email is not required.',stage:'product'});
  const priceReady=draft.currency==='usd'&&Number.isSafeInteger(draft.priceCents)&&draft.priceCents>=50&&draft.priceCents<=999900;
  checks.push({key:'price',ready:priceReady,message:priceReady?'Your one-time USD price is set.':'Set a one-time USD price from $0.50 to $9,999. Free delivery is not enabled in this preview.',stage:'sell'});
  const payments=await fileSalePaymentReadiness(String(product.owner));
  checks.push({key:'payments',ready:payments.state==='eligible',message:payments.message,stage:'sell'});
  const count=await database().prepare('SELECT COUNT(*) n FROM orders WHERE product_id=? AND sale_revision_id IS NOT NULL').bind(product.id).first();
  return {ready:checks.every(c=>c.ready),checks,payments,existingBuyerCount:Number(count?.n||0)};
}
export async function getFileSale(productId:string,owner:string):Promise<FileSaleWorkspace>{
  const {product,row,draft}=await saleRow(productId,owner);
  const [readiness,uploads,published]=await Promise.all([
    readinessFor(product,draft),database().prepare('SELECT id,name,mime,size,status,sha256,validation_error FROM uploads WHERE product_id=? AND owner=? ORDER BY created_at').bind(productId,owner).all(),
    row.published_revision_id?database().prepare('SELECT snapshot FROM file_sale_revisions WHERE id=? AND product_id=?').bind(row.published_revision_id,productId).first():Promise.resolve(null),
  ]);
  await fileSaleEvent(productId,owner,'payment_readiness_changed',{state:readiness.payments.state});
  return {product:{id:productId,slug:String(product.slug),format:String(product.format)},draft,version:Number(row.version),publishedRevisionId:row.published_revision_id?String(row.published_revision_id):null,readiness,uploads:uploads.results as unknown as FileSaleWorkspace['uploads'],publishedSnapshot:published?saleDraftSchema.parse(JSON.parse(String(published.snapshot))):null};
}
export async function createFileSale(owner:string,input:unknown){
  requireFileSales();
  const {preset,requestId}=z.object({preset:z.string().default('playbook'),requestId:z.string().uuid().optional()}).parse(input),template=productPreset(preset);
  if(!template?.available||!['downloads','course'].includes(template.family))throw new ApiError('Choose an available Downloads or Course starter.');
  const id=requestId||crypto.randomUUID(),slug=`${slugify(template.label)}-${id.slice(0,8)}`,now=Date.now();
  if(requestId&&await database().prepare('SELECT id FROM products WHERE id=?').bind(id).first())return getFileSale(id,owner);
  const draft:SaleDraft={title:'',description:'',currency:'usd',priceCents:0,modules:[{kind:template.family as SaleModuleKind,name:template.family==='downloads'?'Downloads':'Course',included:false,uploadIds:[],sections:[]}]};
  await database().batch([
    database().prepare('INSERT OR IGNORE INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,owner,slug,`Untitled ${template.label}`,'','',template.format,0,'orange',JSON.stringify({sections:[],benefits:[],files:[],launch:''}),'draft',now,now),
    database().prepare('INSERT OR IGNORE INTO file_sale_drafts (product_id,version,data) SELECT ?,1,? WHERE EXISTS (SELECT 1 FROM products WHERE id=? AND owner=? AND format=?)').bind(id,JSON.stringify(draft),id,owner,template.format),
  ]);
  await fileSaleEvent(id,owner,'product_flow_started',{mode:template.family,purpose:'direct-sale'},`started:${id}`);
  return getFileSale(id,owner);
}
export async function saveFileSale(productId:string,owner:string,input:unknown){
  requireFileSales();const data=z.object({expectedVersion:z.number().int().min(1),draft:saleDraftSchema}).parse(input),{row,draft:previous}=await saleRow(productId,owner);
  const encoded=JSON.stringify(data.draft);
  if(Number(row.version)!==data.expectedVersion){if(encoded===String(row.data))return getFileSale(productId,owner);throw new ApiError('This draft changed in another tab. Reload before saving.',409);}
  const ids=[...saleUploadIds(data.draft),...(data.draft.coverUploadId?[data.draft.coverUploadId]:[])];
  for(const id of ids)if(!await database().prepare('SELECT id FROM uploads WHERE id=? AND product_id=? AND owner=?').bind(id,productId,owner).first())throw new ApiError('A file does not belong to this product.',403);
  if(encoded!==String(row.data)){
    const saved=await database().prepare('UPDATE file_sale_drafts SET data=?,version=version+1 WHERE product_id=? AND version=?').bind(encoded,productId,data.expectedVersion).run();
    if(!saved.meta.changes)throw new ApiError('This draft changed in another tab. Reload before saving.',409);
    await fileSaleEvent(productId,owner,'product_details_saved',{version:data.expectedVersion+1},`details:${productId}:${data.expectedVersion+1}`);
    if(data.draft.priceCents!==previous.priceCents)await fileSaleEvent(productId,owner,'price_saved',{version:data.expectedVersion+1},`price:${productId}:${data.expectedVersion+1}`);
  }
  return getFileSale(productId,owner);
}

export async function publishFileSale(productId:string,owner:string,input:unknown){
  requireFileSales();const {expectedVersion,grantModulesToExisting}=z.object({expectedVersion:z.number().int().min(1),grantModulesToExisting:z.array(z.enum(['downloads','course'])).max(2).default([])}).parse(input);
  const {product,row,draft}=await saleRow(productId,owner);
  if(Number(row.version)!==expectedVersion)throw new ApiError('This draft changed. Review the latest version before publishing.',409);
  const existing=await database().prepare('SELECT id FROM file_sale_revisions WHERE product_id=? AND version=?').bind(productId,expectedVersion).first();
  if(existing&&row.published_revision_id===existing.id)return getFileSale(productId,owner);
  await fileSaleEvent(productId,owner,'publish_attempted',{version:expectedVersion},`publish-attempt:${productId}:${expectedVersion}`);
  const readiness=await readinessFor(product,draft,true);
  if(!readiness.ready){await fileSaleEvent(productId,owner,'publish_blocked',{version:expectedVersion,state:readiness.payments.state});throw new ApiError(readiness.checks.find(c=>!c.ready)!.message,409);}
  const snapshot:SaleDraft={...draft,modules:draft.modules.filter(m=>m.included)};
  if(grantModulesToExisting.some(kind=>!snapshot.modules.some(m=>m.kind===kind)))throw new ApiError('Only included, ready modules can be offered to existing buyers.');
  const revisionId=crypto.randomUUID(),now=Date.now(),db=database();
  const statements=[
    db.prepare('INSERT OR IGNORE INTO file_sale_revisions (id,product_id,version,snapshot,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM file_sale_drafts WHERE product_id=? AND version=?)').bind(revisionId,productId,expectedVersion,JSON.stringify(snapshot),now,productId,expectedVersion),
    db.prepare('UPDATE file_sale_drafts SET published_revision_id=? WHERE product_id=? AND version=? AND EXISTS (SELECT 1 FROM file_sale_revisions WHERE id=? AND product_id=? AND version=?)').bind(revisionId,productId,expectedVersion,revisionId,productId,expectedVersion),
    db.prepare("UPDATE products SET title=?,description=?,price=?,status='published',updated_at=? WHERE id=? AND owner=? AND EXISTS (SELECT 1 FROM file_sale_drafts WHERE product_id=? AND version=? AND published_revision_id=?)").bind(draft.title,draft.description,draft.priceCents,now,productId,owner,productId,expectedVersion,revisionId),
  ];
  for(const module of snapshot.modules){
    // Existing Downloads buyers receive future file revisions. Course is granted
    // only when the seller explicitly chooses it. Checkout intents are not orders:
    // a still-pending checkout retains its original offer when it later completes.
    const grantAll=grantModulesToExisting.includes(module.kind);
    if(module.kind!=='downloads'&&!grantAll)continue;
    statements.push(db.prepare(`INSERT OR IGNORE INTO file_sale_grants (order_id,revision_id,module,created_at)
      SELECT o.id,r.id,?,? FROM orders o JOIN file_sale_revisions r ON r.product_id=o.product_id AND r.id=?
      WHERE o.product_id=? AND o.sale_revision_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM file_sale_drafts d WHERE d.product_id=? AND d.version=? AND d.published_revision_id=r.id)
        AND (?=1 OR EXISTS (SELECT 1 FROM file_sale_grants g WHERE g.order_id=o.id AND g.module=?)
          OR EXISTS (SELECT 1 FROM file_sale_revisions original,json_each(original.snapshot,'$.modules') m WHERE original.id=o.sale_revision_id AND json_extract(m.value,'$.kind')=?))`)
      .bind(module.kind,now,revisionId,productId,productId,expectedVersion,grantAll?1:0,module.kind,module.kind));
  }
  let results:Awaited<ReturnType<typeof db.batch>>;
  try{results=await db.batch(statements);}catch(error){
    // D1/Render batch operations are atomic: a thrown batch does not publish the
    // new revision. Do not label later response/telemetry failures as publication
    // failures after a successful commit.
    await fileSaleEvent(productId,owner,'publish_failed',{version:expectedVersion,reason:'storage'});
    throw error;
  }
  if(!results[1].meta.changes){const current=await saleRow(productId,owner);const committed=await database().prepare('SELECT id FROM file_sale_revisions WHERE product_id=? AND version=?').bind(productId,expectedVersion).first();if(committed&&current.row.published_revision_id===committed.id)return getFileSale(productId,owner);throw new ApiError('The draft changed during publication. Your previous live page is unchanged. Review and retry.',409);}
  await fileSaleEvent(productId,owner,'publish_succeeded',{version:expectedVersion},`published:${productId}:${expectedVersion}`);
  return getFileSale(productId,owner);
}

export async function getPublishedFileSale(slug:string,options:{verifyIntegrity?:boolean}={}){
  const product=await database().prepare("SELECT p.*,d.published_revision_id FROM products p JOIN file_sale_drafts d ON d.product_id=p.id WHERE p.slug=? AND p.status='published'").bind(slug).first();
  if(!product?.published_revision_id)return null;
  const revision=await database().prepare('SELECT * FROM file_sale_revisions WHERE id=? AND product_id=?').bind(product.published_revision_id,product.id).first();
  if(!revision)return null;
  const snapshot=saleDraftSchema.parse(JSON.parse(String(revision.snapshot)));
  return {product,revisionId:String(revision.id),snapshot,readiness:await readinessFor(product,snapshot,options.verifyIntegrity)};
}
export async function startFileSaleCheckout(request:Request,input:unknown){
  requireFileSales();
  const data=z.object({slug:z.string().min(1).max(100),expectedRevisionId:z.string().uuid(),requestId:z.string().uuid(),email:z.string().trim().email().max(200).optional()}).parse(input);
  const published=await getPublishedFileSale(data.slug,{verifyIntegrity:true});
  if(!published)throw new ApiError('This offer is not published.',404);
  const {product,snapshot,revisionId,readiness}=published;
  if(revisionId!==data.expectedRevisionId)throw new ApiError('This offer changed. Reload the sales page to review it before paying.',409);
  if(!readiness.ready)throw new ApiError('Purchases are temporarily unavailable. '+readiness.checks.find(c=>!c.ready)!.message,409);
  const seller=await database().prepare('SELECT stripe_account FROM sellers WHERE owner=?').bind(product.owner).first();
  const account=String(seller?.stripe_account||''),id=`file_${data.requestId}`,email=data.email?.toLowerCase()||'',amount=snapshot.priceCents,db=database();
  const items=JSON.stringify([{id:String(product.id),slug:String(product.slug),title:snapshot.title,price:amount/100,amount,saleRevisionId:revisionId}]);
  await db.prepare("INSERT OR IGNORE INTO checkout_intents (id,owner,product_id,account,amount,mode,items,quantity,platform_fee,email,created_at,sale_revision_id) VALUES (?,?,?,?,?,'payment',?,1,?,?,?,?)").bind(id,product.owner,product.id,account,amount,items,commissionAmount(amount),email,Date.now(),revisionId).run();
  const intent=(await db.prepare('SELECT * FROM checkout_intents WHERE id=?').bind(id).first())!;
  if(intent.product_id!==product.id||intent.sale_revision_id!==revisionId||intent.email!==email||intent.account!==account||Number(intent.amount)!==amount)throw new ApiError('This checkout request was already used for a different selection. Start again.',409);
  const origin=new URL(request.url).origin;
  const fields=new URLSearchParams({mode:'payment','line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(amount),'line_items[0][price_data][product_data][name]':snapshot.title,'line_items[0][quantity]':'1',success_url:`${origin}/access/${product.slug}?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/p/${product.slug}`,'metadata[product_id]':String(product.id),'metadata[owner]':String(product.owner),'metadata[order_ref]':id,'metadata[expected_amount]':String(amount),'metadata[sale_revision_id]':revisionId});
  if(Number(intent.platform_fee)>0)fields.set('payment_intent_data[application_fee_amount]',String(intent.platform_fee));
  if(email)fields.set('customer_email',email);
  let session:Record<string,any>;
  try{session=intent.session_id?await stripe(`checkout/sessions/${intent.session_id}`,undefined,account):await stripe('checkout/sessions',fields,account,`file-sale:${id}`);}catch{throw new ApiError('Checkout could not be opened. Your product and access are unchanged; retry this checkout.',502);}
  if(session.livemode!==false||session.metadata?.order_ref!==id)throw new ApiError('The provider checkout could not be verified in test mode.',502);
  await db.prepare('UPDATE checkout_intents SET session_id=? WHERE id=? AND (session_id IS NULL OR session_id=?)').bind(session.id,id,session.id).run();
  if(session.status==='expired')throw new ApiError('This checkout expired. Return to the product page and start a new checkout.',409);
  if(typeof session.url!=='string'||!session.url.startsWith('https://checkout.stripe.com/'))throw new ApiError('Checkout is no longer open. Use your access page if payment completed.',409);
  return {url:session.url};
}

export async function fulfillFileSaleOrder(order:Row){
  if(!order.sale_revision_id)return;
  const revision=await database().prepare('SELECT * FROM file_sale_revisions WHERE id=? AND product_id=?').bind(order.sale_revision_id,order.product_id).first();
  if(!revision)throw new ApiError('The purchased content revision is unavailable. Please contact support.',409);
  const snapshot=saleDraftSchema.parse(JSON.parse(String(revision.snapshot)));
  await database().batch(snapshot.modules.map(module=>database().prepare('INSERT OR IGNORE INTO file_sale_grants (order_id,revision_id,module,created_at) VALUES (?,?,?,?)').bind(order.id,revision.id,module.kind,Date.now())));
  await fileSaleEvent(String(order.product_id),String(order.owner),'checkout_completed',{paid:true,purpose:'direct-sale'},`checkout:${order.id}`);
  await fileSaleEvent(String(order.product_id),String(order.owner),'entitlement_available',{paid:true},`entitlement:${order.id}`);
}

export async function resolveFileSaleAccess(product:Row,token?:string,providedUser?:Buyer|null){
  const row=await database().prepare('SELECT * FROM file_sale_drafts WHERE product_id=?').bind(product.id).first();
  if(!row)return null;
  const user=providedUser===undefined?await identity().catch(()=>null):providedUser;
  let modules:SaleModule[]=[],title=String(product.title),description=String(product.description);const purchasedRevisionIds:string[]=[],entitledUploadIds=new Set<string>();
  if(user?.userId===product.owner){const draft=saleDraftSchema.parse(JSON.parse(String(row.data)));modules=draft.modules;title=draft.title;description=draft.description;}
  else{
    const orders=token?await database().prepare('SELECT * FROM orders WHERE token=? AND product_id=? AND owner=? AND sale_revision_id IS NOT NULL').bind(token,product.id,product.owner).all():user?await database().prepare('SELECT * FROM orders WHERE lower(email)=? AND product_id=? AND owner=? AND sale_revision_id IS NOT NULL').bind(user.email.toLowerCase(),product.id,product.owner).all():{results:[] as Row[]};
    if(!orders.results.length)throw new ApiError('Sign in with your purchase email or open your private access link to view this product.',403);
    const best=new Map<SaleModuleKind,{module:SaleModule;version:number}>();
    for(const order of orders.results){
      // Initial entitlements are recoverable directly from the paid order even
      // if a notification or follow-up grant write was interrupted.
      const revisions=await database().prepare('SELECT DISTINCT r.* FROM file_sale_revisions r WHERE r.product_id=? AND (r.id=? OR r.id IN (SELECT revision_id FROM file_sale_grants WHERE order_id=?)) ORDER BY r.version').bind(product.id,order.sale_revision_id,order.id).all();
      const grants=await database().prepare('SELECT revision_id,module FROM file_sale_grants WHERE order_id=?').bind(order.id).all();
      for(const revision of revisions.results){
        const snapshot=saleDraftSchema.parse(JSON.parse(String(revision.snapshot)));purchasedRevisionIds.push(String(revision.id));
        for(const module of snapshot.modules){
          const permitted=revision.id===order.sale_revision_id||grants.results.some(g=>g.revision_id===revision.id&&g.module===module.kind);
          if(permitted){for(const uploadId of saleUploadIds({...snapshot,modules:[module]}))entitledUploadIds.add(uploadId);if(Number(revision.version)>(best.get(module.kind)?.version??-1))best.set(module.kind,{module,version:Number(revision.version)});}
        }
      }
    }
    modules=[...best.values()].map(v=>v.module);
    if(!modules.length)throw new ApiError('Your purchase is saved, but content access needs support. Please keep your payment reference.',409);
  }
  const ids=[...new Set([...saleUploadIds({title,description,priceCents:0,currency:'usd',modules}),...entitledUploadIds])];
  const uploads=[];
  for(const id of ids){const upload=await database().prepare("SELECT id,name,mime,size,status,sha256 FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed'").bind(id,product.id,product.owner).first();if(upload)uploads.push(upload);}
  return {owner:user?.userId===product.owner,user,productId:String(product.id),slug:String(product.slug),title,description,modules,uploads,purchasedRevisionIds:[...new Set(purchasedRevisionIds)]};
}
export async function fileSaleUploadAllowed(product:Row,uploadId:string,token?:string,providedUser?:Buyer|null){
  const access=await resolveFileSaleAccess(product,token,providedUser);
  if(!access)return null;
  if(access.owner)return true;
  return access.uploads.some(upload=>upload.id===uploadId);
}
