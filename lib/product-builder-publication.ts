import {z} from 'zod';
import {ApiError,database,ownedProduct} from './server';
import {getBuilderWorkspace,builderReadiness} from './product-builder-server';
import {builderPublicSnapshotSchema,builderDeliverySnapshotSchema} from './builder-publication-contract';
import {builderPdfUpdateGrantStatement} from './builder-delivery-server';
import {getCommerceOffer,saveCommerceOffer,publicCommerceOffer,commerceSlots} from './commerce-v2-server';
import {builderFamily} from './builder-contract';

export async function getBuilderPublication(productId:string,owner:string){
 await ownedProduct(productId,owner);
 const row=await database().prepare('SELECT * FROM product_builder_publications WHERE product_id=? AND owner=?').bind(productId,owner).first();
 return row?{version:Number(row.version),slug:String(row.slug),publishedAt:Number(row.published_at),snapshot:builderPublicSnapshotSchema.parse(JSON.parse(String(row.public_snapshot)))}:null;
}
export async function publishBuilderProduct(productId:string,owner:string,input:unknown){
 const {expectedVersion}=z.object({expectedVersion:z.number().int().min(1)}).parse(input),workspace=await getBuilderWorkspace(productId,owner);
 if(workspace.version!==expectedVersion)throw new ApiError('This product changed. Reload and review it before publishing.',409);
 if(!workspace.readiness.publishReady)throw new ApiError(workspace.readiness.checks.find(check=>!check.ready)?.message||'Finish the product before publishing.',409);
 const {draft,product}=workspace;
 const verified=await builderReadiness(productId,owner,draft,true);
 if(!verified.publishReady)throw new ApiError(verified.checks.find(check=>!check.ready)?.message||'A product file could not be verified. Upload it again before publishing.',409);
 const snapshot=builderPublicSnapshotSchema.parse({title:draft.title,description:draft.description,audience:draft.audience,format:product.format,benefits:product.content.benefits,outline:draft.sections.map(section=>section.title),priceCents:draft.priceCents,currency:draft.currency,hasCover:!!draft.coverUploadId});
 const family=builderFamily(draft);
 const sections=family==='community'&&!draft.sections.length?[{title:'Welcome to the community',body:draft.fields.welcome||''},{title:'Our community guidelines',body:draft.fields.rules||''}]:draft.sections;
 const delivery=builderDeliverySnapshotSchema.parse({title:draft.title,format:product.format,sections,files:draft.files,uploadIds:draft.uploadIds,meetingUrl:draft.fields.meetingUrl||'',intakePrompt:draft.fields.intakePrompt||'What would you like help with?',deliveryFamily:family,communityUrl:draft.fields.communityUrl||'',serviceScope:draft.fields.serviceScope||'',preparation:draft.fields.preparation||'',builderType:draft.type,description:draft.description,coverUploadId:draft.coverUploadId,welcome:draft.fields.welcome||'',rules:draft.fields.rules||'',usageInstructions:draft.fields.usageInstructions||'',compatibleTools:draft.fields.compatibleTools||'',dailyTime:draft.fields.dailyTime||'',completionCriteria:draft.fields.completionCriteria||''});
 const now=Date.now(),db=database(),previous=await getBuilderPublication(productId,owner);
 if(previous?.version===expectedVersion)return getBuilderWorkspace(productId,owner);
 const results=await db.batch([
  db.prepare(`INSERT INTO product_builder_publications (product_id,owner,version,slug,public_snapshot,content_snapshot,upload_ids,published_at,updated_at)
   SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM product_builder_workspaces WHERE product_id=? AND owner=? AND version=?)
   ON CONFLICT(product_id) DO UPDATE SET version=excluded.version,public_snapshot=excluded.public_snapshot,content_snapshot=excluded.content_snapshot,upload_ids=excluded.upload_ids,published_at=excluded.published_at,updated_at=excluded.updated_at WHERE product_builder_publications.owner=excluded.owner AND product_builder_publications.version<excluded.version`)
   .bind(productId,owner,expectedVersion,product.slug,JSON.stringify(snapshot),JSON.stringify({...delivery,draft,product}),JSON.stringify(draft.uploadIds),now,now,productId,owner,expectedVersion),
  // Republishing never silently resumes selling, changes a live purchase price
  // or grants new modules to a previous buyer. A creator explicitly starts sales.
  db.prepare('UPDATE commerce_offers SET enabled=0,updated_at=MAX(updated_at+1,?) WHERE product_id=? AND owner=? AND EXISTS(SELECT 1 FROM product_builder_publications WHERE product_id=? AND version=?)').bind(now,productId,owner,productId,expectedVersion),
  db.prepare("UPDATE products SET status='published' WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM product_builder_publications WHERE product_id=? AND version=?)").bind(productId,owner,productId,expectedVersion),
  builderPdfUpdateGrantStatement(productId,owner,expectedVersion,draft.uploadIds,family,now),
 ]);
 if(!results[0].meta.changes)throw new ApiError('The draft changed while publishing. Review the latest version and try again.',409);
 return getBuilderWorkspace(productId,owner);
}
export async function setBuilderSelling(productId:string,owner:string,input:unknown){
 const workspace=await getBuilderWorkspace(productId,owner),publication=await getBuilderPublication(productId,owner);
 const request=z.object({enabled:z.boolean(),expectedVersion:z.number().int().min(1)}).parse(input);
 if(request.expectedVersion!==workspace.version)throw new ApiError('This product changed. Reload it before changing sales.',409);
 const currentOffer=await getCommerceOffer(productId,owner);
 const published=publication?await database().prepare('SELECT content_snapshot FROM product_builder_publications WHERE product_id=? AND owner=?').bind(productId,owner).first():null;
 const delivery=published?builderDeliverySnapshotSchema.parse(JSON.parse(String(published.content_snapshot))):null;
 const value={enabled:request.enabled,expectedUpdatedAt:currentOffer.updatedAt,amount:request.enabled?publication?.snapshot.priceCents||0:currentOffer.amount,currency:publication?.snapshot.currency??workspace.draft.currency,intakePrompt:delivery?.intakePrompt||'',meetingUrl:delivery?.meetingUrl||''};
 if(value.enabled){
  if(!publication)throw new ApiError('Publish your product page before starting sales.',409);
  if(publication.snapshot.priceCents<50)throw new ApiError('Set a price of at least 0.50 in your selected currency, then publish the update before starting sales.',409);
  if(publication.version!==workspace.version)throw new ApiError('Publish your latest changes before starting sales.',409);
  if(value.amount!==publication.snapshot.priceCents||value.currency!==publication.snapshot.currency)throw new ApiError('Publish your updated price before starting sales.',409);
  const family=builderFamily(workspace.draft);
  if(family==='community'&&!validPrivateUrl(workspace.draft.fields.communityUrl||''))throw new ApiError('Add an HTTPS community invitation URL before selling membership access. It will be delivered privately after payment.',409);
  if(family==='service'&&!(await commerceSlots(productId,owner)).some(slot=>!slot.booked&&slot.startsAt>Date.now()))throw new ApiError('Add at least one available session time before selling this service.',409);
 }
 // The existing server path verifies explicit platform enablement, the current
 // Stripe mode, refreshed merchant capabilities, published content and delivery.
 await saveCommerceOffer(productId,owner,value);
 return getBuilderWorkspace(productId,owner);
}
function validPrivateUrl(value:string){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}
export async function getPublicBuilderProduct(slug:string){
 const row=await database().prepare('SELECT product_id,owner,version,slug,public_snapshot,published_at FROM product_builder_publications WHERE slug=?').bind(slug).first();
 if(!row)throw new ApiError('This product page is unavailable.',404);
 const offer=await publicCommerceOffer(slug);
 return {snapshot:builderPublicSnapshotSchema.parse(JSON.parse(String(row.public_snapshot))),productId:String(row.product_id),owner:String(row.owner),version:Number(row.version),slug:String(row.slug),publishedAt:Number(row.published_at),selling:!!offer,offer};
}
