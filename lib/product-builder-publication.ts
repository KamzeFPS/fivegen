import {z} from 'zod';
import {ApiError,database,ownedProduct} from './server';
import {getBuilderWorkspace,builderReadiness} from './product-builder-server';
import {builderPublicSnapshotSchema,builderDeliverySnapshotSchema} from './builder-publication-contract';
import {builderPdfUpdateGrantStatement} from './builder-delivery-server';
import {getCommerceOffer,saveCommerceOffer,publicCommerceOffer,commerceSlots,commerceMode} from './commerce-v2-server';
import {builderFamily} from './builder-contract';
import {publicStudio,studioPricing} from './product-studio-contract';
import {publicFreeStudioOffer} from './product-studio-commerce';
import {curriculumOrder} from './product-curriculum';
import {assertServiceIntegrationReady} from './service-integrations-server';

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
 const pricing=studioPricing(draft.studio);
 if(pricing.bundleProductIds.includes(productId))throw new ApiError('A bundle cannot contain itself.');
 for(const includedId of pricing.bundleProductIds){await ownedProduct(includedId,owner);const included=await database().prepare('SELECT product_id FROM product_builder_publications WHERE product_id=? AND owner=?').bind(includedId,owner).first();if(!included)throw new ApiError('Publish each included product before adding it to a bundle.');}
 const orderedSections=draft.studio?.course?.modules?curriculumOrder(draft.sections,draft.studio.course.modules):draft.sections;
 const displayPriceCents=draft.studio?.community?.tiers?.length?Math.min(...draft.studio.community.tiers.map(tier=>tier.priceCents)):draft.priceCents;
 const snapshot=builderPublicSnapshotSchema.parse({title:draft.title,description:draft.description,audience:draft.audience,format:product.format,benefits:product.content.benefits,outline:orderedSections.map(section=>section.title),priceCents:displayPriceCents,currency:draft.currency,hasCover:!!draft.coverUploadId,studio:publicStudio(draft.studio),preview:draft.sections.filter(section=>section.id&&draft.studio?.sales?.previewSectionIds?.includes(section.id)).slice(0,5).map(section=>({title:section.title,body:section.body}))});
 const family=builderFamily(draft);
 const sections=family==='community'&&!draft.sections.length?[{title:'Welcome to the community',body:draft.fields.welcome||''},{title:'Our community guidelines',body:draft.fields.rules||''}]:orderedSections;
 const delivery=builderDeliverySnapshotSchema.parse({studio:draft.studio,title:draft.title,format:product.format,sections,files:draft.files,uploadIds:draft.uploadIds,meetingUrl:draft.fields.meetingUrl||'',intakePrompt:draft.fields.intakePrompt||'What would you like help with?',deliveryFamily:family,communityUrl:draft.fields.communityUrl||'',serviceScope:draft.fields.serviceScope||'',preparation:draft.fields.preparation||'',builderType:draft.type,description:draft.description,coverUploadId:draft.coverUploadId,welcome:draft.fields.welcome||'',rules:draft.fields.rules||'',usageInstructions:draft.fields.usageInstructions||'',compatibleTools:draft.fields.compatibleTools||'',dailyTime:draft.fields.dailyTime||'',completionCriteria:draft.fields.completionCriteria||''});
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
  const pricing=studioPricing(workspace.draft.studio);
  if(pricing.model!=='free'&&!workspace.draft.studio?.community?.tiers?.some(tier=>tier.billing==='free')&&publication.snapshot.priceCents<50)throw new ApiError('Set a price of at least 0.50, or choose free access, then publish the update.',409);
  if(publication.version!==workspace.version)throw new ApiError('Publish your latest changes before starting sales.',409);
  if(value.amount!==publication.snapshot.priceCents||value.currency!==publication.snapshot.currency)throw new ApiError('Publish your updated price before starting sales.',409);
  const family=builderFamily(workspace.draft);
  const custom=workspace.draft.studio?.custom,mixedSessions=(custom?.deliveryKinds as string[]|undefined)?.includes('sessions')||(custom?.blocks as {kind?:string}[]|undefined)?.some(block=>block.kind==='session'),mixedCommunity=(custom?.deliveryKinds as string[]|undefined)?.includes('community');
  if((family==='community'||mixedCommunity)&&!workspace.draft.studio?.community?.enabled&&!validPrivateUrl(workspace.draft.fields.communityUrl||''))throw new ApiError('Set up your community space or add a private HTTPS invitation link.',409);
  if(family==='service'||mixedSessions){await assertServiceIntegrationReady(owner,workspace.draft.studio?.service||{});if(!['jitsi','google-meet','zoom'].includes(workspace.draft.studio?.service?.meetingProvider||'manual')&&!validPrivateUrl(workspace.draft.studio?.service?.meetingUrl||workspace.draft.fields.meetingUrl||''))throw new ApiError('Add a private meeting link or choose automatic meeting links before enabling access.',409);if(!(await commerceSlots(productId,owner)).some(slot=>!slot.booked&&slot.startsAt>Date.now()))throw new ApiError('Add at least one available session time before selling this service.',409);}
 }
 if(studioPricing(workspace.draft.studio).model==='free'||workspace.draft.studio?.community?.tiers?.some(tier=>tier.billing==='free')){
  if(request.enabled&&publication?.snapshot.priceCents!==0)throw new ApiError('Set the price to zero and publish before offering free access.',409);
  const mode=commerceMode(),now=Math.max(Date.now(),currentOffer.updatedAt+1),guard='(?=0 OR EXISTS(SELECT 1 FROM product_builder_workspaces w JOIN product_builder_publications p ON p.product_id=w.product_id AND p.owner=w.owner WHERE w.product_id=? AND w.owner=? AND w.version=? AND p.version=w.version))',db=database();
  const result=currentOffer.updatedAt===0?
   await db.prepare(`INSERT OR IGNORE INTO commerce_offers(product_id,owner,enabled,enabled_mode,amount,currency,intake_prompt,meeting_url,updated_at) SELECT ?,?,?,?,0,?,?,?,? WHERE ${guard}`).bind(productId,owner,+request.enabled,mode,workspace.draft.currency,value.intakePrompt,value.meetingUrl,now,+request.enabled,productId,owner,request.expectedVersion).run():
   await db.prepare(`UPDATE commerce_offers SET enabled=?,enabled_mode=?,amount=0,currency=?,intake_prompt=?,meeting_url=?,updated_at=? WHERE product_id=? AND owner=? AND updated_at=? AND ${guard}`).bind(+request.enabled,mode,workspace.draft.currency,value.intakePrompt,value.meetingUrl,now,productId,owner,currentOffer.updatedAt,+request.enabled,productId,owner,request.expectedVersion).run();
  if(!result.meta.changes)throw new ApiError('The product or access settings changed. Reload before enabling access.',409);
  return getBuilderWorkspace(productId,owner);
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
 const offer=await publicFreeStudioOffer(slug)||await publicCommerceOffer(slug);
 return {snapshot:builderPublicSnapshotSchema.parse(JSON.parse(String(row.public_snapshot))),productId:String(row.product_id),owner:String(row.owner),version:Number(row.version),slug:String(row.slug),publishedAt:Number(row.published_at),selling:!!offer,offer};
}
