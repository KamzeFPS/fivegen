import {z} from 'zod';
import {ApiError,binding,database} from './server';
import {getBuilderWorkspace} from './product-builder-server';
import {getEditorialReview} from './product-editorial-review-server';
import {isUnfinishedPlaceholder} from './product-readiness';
import {studioPricing} from './product-studio-contract';
import {creatorLaunchPublicUrl,type CreatorLaunchAction,type CreatorLaunchFeedback,type CreatorLaunchState,type CreatorLaunchStep} from './creator-launch';

const feedbackSchema=z.object({id:z.string().uuid(),source:z.enum(['conversation','email','survey','other']),audience:z.enum(['potential-buyer','customer']),summary:z.string().trim().min(20).max(1200),recordedAt:z.number().int().nonnegative(),provenance:z.literal('creator-entered')}).strict();
const feedbackList=z.array(feedbackSchema).max(20);
const updateBase={expectedUpdatedAt:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)};
const launchActionSchema=z.discriminatedUnion('action',[
 z.object({...updateBase,action:z.literal('add-feedback'),id:z.string().uuid(),source:feedbackSchema.shape.source,audience:feedbackSchema.shape.audience,summary:feedbackSchema.shape.summary}).strict(),
 z.object({...updateBase,action:z.literal('remove-feedback'),id:z.string().uuid()}).strict(),
 z.object({...updateBase,action:z.literal('mark-shared'),expectedPublicationVersion:z.number().int().positive(),channel:z.enum(['direct','social','newsletter','other'])}).strict(),
 z.object({...updateBase,action:z.literal('clear-shared')}).strict(),
]);
const navigate=(navigate:Extract<CreatorLaunchAction,{kind:'navigate'}>['navigate'],label:string):CreatorLaunchAction=>({kind:'navigate',navigate,label});
function readFeedback(value:unknown){try{return feedbackList.parse(JSON.parse(String(value||'[]')));}catch{throw new ApiError('Your saved launch notes could not be read. Contact support before changing them.',503);}}
async function launchRow(productId:string,owner:string){return database().prepare('SELECT * FROM creator_launch_journeys WHERE product_id=? AND owner=?').bind(productId,owner).first();}
// A paid ledger row is written only by verified fulfillment. Free access and
// bundle delivery rows are not additional payments. Refund/dispute records can
// arrive before the order status update, so check those records as well.
const eligible=`o.owner=? AND o.product_id=? AND o.status='paid' AND o.paid_at>0
 AND NOT EXISTS(SELECT 1 FROM product_bundle_entitlements b WHERE b.order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM commerce_revocations r WHERE r.mode=o.mode AND r.account_id=o.account_id AND r.payment_intent=o.payment_intent)
 AND NOT EXISTS(SELECT 1 FROM commerce_earnings e WHERE e.order_id=o.id AND (e.refunded_amount>0 OR e.disputed=1))`;
async function launchSales(productId:string,owner:string){
 const row=await database().prepare(`SELECT
  SUM(CASE WHEN o.mode='live' AND o.amount>0 THEN 1 ELSE 0 END) live_paid,
  MIN(CASE WHEN o.mode='live' AND o.amount>0 THEN o.paid_at END) first_live_paid,
  SUM(CASE WHEN o.mode='test' AND o.amount>0 THEN 1 ELSE 0 END) test_paid,
  SUM(CASE WHEN o.mode='live' AND o.amount=0 THEN 1 ELSE 0 END) free_access
  FROM commerce_orders o WHERE ${eligible}`).bind(owner,productId).first();
 return {livePaidCount:Number(row?.live_paid||0),firstLivePaidAt:row?.first_live_paid==null?null:Number(row.first_live_paid),testPaidCount:Number(row?.test_paid||0),freeAccessCount:Number(row?.free_access||0)};
}

export async function creatorLaunchState(productId:string,owner:string):Promise<CreatorLaunchState>{
 z.string().uuid().parse(productId);
 // Ownership is checked before reading notes, reviews, or payment facts.
 const workspace=await getBuilderWorkspace(productId,owner),[row,review,sales,page]=await Promise.all([launchRow(productId,owner),getEditorialReview(productId,owner),launchSales(productId,owner),database().prepare('SELECT published_at,published,public_product FROM product_pages WHERE product_id=? AND owner=?').bind(productId,owner).first()]);
 const {draft,payments,publication}=workspace,feedback=readFeedback(row?.feedback),pricing=studioPricing(draft.studio),tiers=draft.studio?.community?.tiers||[];
 const hasFree=tiers.length?tiers.some(tier=>tier.billing==='free'):pricing.model==='free'||pricing.model==='pwyw'&&pricing.minimumCents===0;
 const hasPaid=tiers.length?tiers.some(tier=>tier.billing!=='free'):pricing.model!=='free';
 const path:CreatorLaunchState['path']=hasFree?(hasPaid?'mixed':'free'):'paid';
 const priceReady=tiers.length?tiers.every(tier=>tier.billing==='free'?tier.priceCents===0:tier.priceCents>=50):pricing.model==='free'?draft.priceCents===0:pricing.model==='pwyw'?Math.max(pricing.suggestedCents,draft.priceCents)>=Math.max(50,pricing.minimumCents):draft.priceCents>=50;
 const liveMode=payments.mode==='live',paymentReady=priceReady&&liveMode&&(!hasPaid||payments.configured&&payments.enabled&&payments.connected&&!!payments.ready);
 const problem=draft.studio?.basics?.problem?.trim()||draft.fields.outcome?.trim()||'',defined=draft.audience.trim().length>=3&&!isUnfinishedPlaceholder(draft.audience)&&problem.length>=10&&!isUnfinishedPlaceholder(problem);
 const salesPagePublic=page?.published_at!=null&&!!page.published&&!!page.public_product;
 const publicUrl=salesPagePublic?creatorLaunchPublicUrl(binding('APP_ORIGIN'),workspace.product.slug):null;
 const sharedCurrent=!!publication&&Number(row?.shared_publication_version)===publication.version&&Number(row?.shared_at)>0&&salesPagePublic&&Number(row?.shared_at)>=Number(page?.published_at||0);
 const approved=review.approved&&review.version===workspace.version;
 const publicationCurrent=!!publication&&publication.version===workspace.version;
 const selling=publicationCurrent&&workspace.selling;
 const contentReady=workspace.readiness.publishReady;
 const firstSale=sales.livePaidCount>0,firstAccess=sales.freeAccessCount>0;
 const phase:CreatorLaunchState['phase']=firstSale||path==='free'&&firstAccess?'improve':path==='free'?'free-access':'first-sale';
 const steps:{id:string;title:string;complete:boolean;detail:string;action?:CreatorLaunchAction}[]=[
  {id:'buyer',title:'Define your buyer and problem',complete:defined,detail:defined?'Your saved draft names an audience and the problem or outcome.':'Name the intended buyer and the specific problem or outcome in Product details.',action:navigate('details','Define the buyer and problem')},
  {id:'feedback',title:'Record real buyer feedback (recommended)',complete:feedback.length>0,detail:feedback.length?`${feedback.length} private ${feedback.length===1?'note':'notes'} recorded by you. These notes are not independently verified market validation.`:'Talk with a potential buyer. Record what they struggle with and what you learned; AI suggestions do not count as customer evidence.',action:{kind:'feedback',label:'Record feedback'}},
  {id:'content',title:'Finish the product',complete:contentReady,detail:contentReady?'The saved product passes its content, settings and file-readiness checks.':workspace.readiness.checks.find(check=>!check.ready)?.message||'Finish the content and attached resources before publishing.',action:navigate('content','Finish your content')},
  {id:'review',title:'Review and approve this version',complete:approved,detail:approved?'You approved the current saved product version.':'Read the preview, resolve review blockers and approve the current saved version. Approval expires when the reviewed content changes.',action:navigate('review','Review this version')},
  {id:'publish',title:'Publish your reviewed delivery',complete:publicationCurrent,detail:publicationCurrent?'The current saved delivery version is published. Buyer access and selling remain separate.':publication?'Your delivery has an earlier version. Publish the reviewed update before opening access.':'Publish the reviewed delivery version. You can prepare your public page before payment setup is complete.',action:navigate('review','Review & publish delivery')},
  {id:'sales-page',title:'Publish your sales page',complete:salesPagePublic,detail:salesPagePublic?'Your canonical sales page is public. Paid resources retain their access checks.':'Your sales page is separate from delivery publication. Choose a template, review it and publish the page you will share.',action:navigate('sales-page','Open Sales page')},
  {id:'payments',title:path==='free'?'Prepare free access':'Prepare your price and payments',complete:paymentReady,detail:!priceReady?'Set a usable paid price, or explicitly choose free access.':!liveMode?'The current payment environment is not live. Test payments never count as a first sale.':!hasPaid?'This is free access. A Stripe seller account is not required, and free access is not sales revenue.':payments.configured&&payments.enabled&&payments.connected&&payments.ready?'A paid price and a ready live payment account are saved.':'Complete live seller payment setup and verification before taking real payments.',action:!priceReady?navigate('price','Set your product price'):!hasPaid?navigate('price','Review free access'):navigate('payments','Prepare payments')},
  {id:'access',title:path==='free'?'Enable buyer access':'Enable selling',complete:selling,detail:selling?'The current saved delivery version is published and access is enabled.':'Open Price & access, review the remaining checkout requirements and explicitly enable access. Publishing your sales page does not start sales.',action:navigate('publish','Enable access in Price & access')},
  {id:'share',title:'Share your public product link',complete:sharedCurrent,detail:sharedCurrent?'You marked this published version as shared. This is a creator confirmation, not a measured visit or conversion.':publicUrl?'Copy the public link, share it yourself, then record where you shared it.':'A public link appears after publication. Your draft and private resources stay private.',action:publicUrl?{kind:'share',label:'Share your public link'}:navigate('sales-page','Publish Sales page to get your link')},
  {id:'first-sale',title:path==='free'?'First free access':'First verified live paid sale',complete:path==='free'?firstAccess:firstSale,detail:path==='free'?(firstAccess?'A live free-access order was recorded. This is access, not a paid sale.':'Your first live free-access order will appear here. A free download is not revenue.'):(firstSale?'A verified live paid order is recorded. Refunded, disputed, sandbox and free orders are excluded.':'A verified live paid order will complete this step automatically. You cannot mark a sale manually.'),action:{kind:'refresh',label:'Check for an order'}},
 ];
 if(phase==='improve')steps.push({id:'improve',title:'Learn from your first customers',complete:false,detail:feedback.some(note=>note.audience==='customer')?'Use the customer feedback you recorded to improve your next product version.':'Ask a customer what helped and what was unclear. Record their feedback before deciding what to improve.',action:feedback.some(note=>note.audience==='customer')?navigate('content','Improve the next version'):{kind:'feedback',label:'Record customer feedback'}});
 const unmetSetup=steps.findIndex(step=>!step.complete&&!['feedback','share','first-sale','improve'].includes(step.id));
 const current=phase==='improve'?(unmetSetup>=0?unmetSetup:steps.length-1):Math.max(0,steps.findIndex(step=>!step.complete&&step.id!=='feedback'));
 const currentStep=steps[current],nextAction=currentStep.action||{kind:'refresh' as const,label:'Refresh journey'};
 const blockerOwner=priceReady&&(!payments.configured||!payments.enabled||!liveMode)?'platform' as const:'creator' as const;
 const blocker=!priceReady?'Set a price or explicitly choose free access.':!liveMode?'Platform setup: live payments are not enabled. Test mode cannot accept live purchases.':hasPaid&&(!payments.configured||!payments.enabled)?'Platform setup: seller payments are not available yet. Your page can still be published.':hasPaid&&(!payments.connected||!payments.ready)?'Creator setup: finish your Get paid account verification.':!publicationCurrent?'Publish and approve the current delivery version.':!workspace.selling?'Start selling explicitly in Price & access.':undefined;
 return {summary:{title:draft.title||workspace.product.title,format:workspace.product.format,contentSaved:contentReady,salesPagePublic,deliveryPublished:!!publication,checkoutEnabled:workspace.selling,draftChanges:!publicationCurrent,buyerCheck:sales.testPaidCount?'provider-test':'not-checked',blocker,blockerOwner,canonicalPath:salesPagePublic?'/product/'+encodeURIComponent(workspace.product.slug):null,coverUrl:salesPagePublic?'/api/product-pages/'+encodeURIComponent(workspace.product.slug)+'/image/banner':null,pagePublishedAt:page?.published_at==null?null:Number(page.published_at),lastSavedAt:workspace.product.updatedAt},productId,checkoutAction:!priceReady?navigate('price','Set your product price'):hasPaid&&(!payments.configured||!payments.enabled||!liveMode||!payments.connected||!payments.ready)?navigate('payments','Complete payment setup'):!approved||!publicationCurrent?navigate('review','Review & publish delivery'):navigate('publish','Open Price & access'),updatedAt:Number(row?.updated_at||0),draftVersion:workspace.version,path,phase,steps:steps.map((step,index)=>({id:step.id,title:step.title,status:step.complete?'complete':index===current?'current':'upcoming',detail:step.detail,action:step.action})) as CreatorLaunchStep[],nextAction,nextTitle:currentStep.title,nextDetail:currentStep.detail,feedback,
  sharing:publication?{publicationVersion:publication.version,sharedAt:row?.shared_at?Number(row.shared_at):null,channel:String(row?.shared_channel||''),publicUrl,current:sharedCurrent}:null,sales,
  testPurchase:{complete:sales.testPaidCount>0,detail:sales.testPaidCount?`${sales.testPaidCount} verified test ${sales.testPaidCount===1?'payment':'payments'} recorded. Sandbox orders do not count as real sales.`:'Optional: review the buyer preview or make a sandbox test purchase before taking live payments. A preview is not a completed test payment.',action:navigate('preview','Preview the buyer experience')},
 };
}

export async function updateCreatorLaunch(productId:string,owner:string,input:unknown){
 z.string().uuid().parse(productId);const value=launchActionSchema.parse(input),workspace=await getBuilderWorkspace(productId,owner),db=database(),row=await launchRow(productId,owner);
 if(Number(row?.updated_at||0)!==value.expectedUpdatedAt)throw new ApiError('Your launch notes changed in another tab. Refresh before saving.',409);
 let feedback:CreatorLaunchFeedback[]=readFeedback(row?.feedback),sharedAt=row?.shared_at==null?null:Number(row.shared_at),sharedVersion=row?.shared_publication_version==null?null:Number(row.shared_publication_version),channel=String(row?.shared_channel||'');
 const now=Math.max(Date.now(),value.expectedUpdatedAt+1);
 if(value.action==='add-feedback'){
  if(feedback.length>=20)throw new ApiError('Keep up to 20 feedback notes. Remove an older note before adding another.');
  if(feedback.some(note=>note.id===value.id))throw new ApiError('This feedback note is already saved. Refresh your journey.',409);
  feedback=[...feedback,{id:value.id,source:value.source,audience:value.audience,summary:value.summary,recordedAt:now,provenance:'creator-entered'}];
 }else if(value.action==='remove-feedback'){if(!feedback.some(note=>note.id===value.id))throw new ApiError('This feedback note no longer exists. Refresh your journey.',409);feedback=feedback.filter(note=>note.id!==value.id);
 }else if(value.action==='mark-shared'){
  const page=await db.prepare('SELECT published_at FROM product_pages WHERE product_id=? AND owner=? AND published_at IS NOT NULL AND published IS NOT NULL AND public_product IS NOT NULL').bind(productId,owner).first();
  if(!page||!workspace.publication||workspace.publication.version!==value.expectedPublicationVersion||!creatorLaunchPublicUrl(binding('APP_ORIGIN'),workspace.product.slug))throw new ApiError('Refresh and use the current published product link before marking it shared.',409);
  sharedAt=now;sharedVersion=value.expectedPublicationVersion;channel=value.channel;
 }else{sharedAt=null;sharedVersion=null;channel='';}
 const publicationGuard=value.action==='mark-shared'?' AND EXISTS(SELECT 1 FROM product_builder_publications p WHERE p.product_id=? AND p.owner=? AND p.version=?) AND EXISTS(SELECT 1 FROM product_pages pp WHERE pp.product_id=? AND pp.owner=? AND pp.published_at IS NOT NULL AND pp.published IS NOT NULL AND pp.public_product IS NOT NULL AND pp.published_at<=?)':'';
 const guardValues=value.action==='mark-shared'?[productId,owner,value.expectedPublicationVersion,productId,owner,now]:[];
 const result=row?await db.prepare(`UPDATE creator_launch_journeys SET feedback=?,shared_at=?,shared_publication_version=?,shared_channel=?,updated_at=? WHERE product_id=? AND owner=? AND updated_at=?${publicationGuard}`).bind(JSON.stringify(feedback),sharedAt,sharedVersion,channel,now,productId,owner,value.expectedUpdatedAt,...guardValues).run():await db.prepare(`INSERT OR IGNORE INTO creator_launch_journeys(product_id,owner,feedback,shared_at,shared_publication_version,shared_channel,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?)${publicationGuard}`).bind(productId,owner,JSON.stringify(feedback),sharedAt,sharedVersion,channel,now,productId,owner,...guardValues).run();
 if(!result.meta.changes)throw new ApiError('Your product or launch notes changed while saving. Refresh and try again.',409);
 return creatorLaunchState(productId,owner);
}

/** Bound the streaming body too; Content-Length alone is not trustworthy. */
export async function creatorLaunchInput(req:Request){
 if(Number(req.headers.get('Content-Length'))>8192)throw new ApiError('This launch note is too large.',413);
 const reader=req.body?.getReader();if(!reader)throw new ApiError('A launch action is required.');let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>8192){await reader.cancel();throw new ApiError('This launch note is too large.',413);}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes)) as unknown;}catch{throw new ApiError('Use a valid launch action.');}
}
