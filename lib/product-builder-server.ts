import {communityTierResourceIssues} from './product-community-tier-contract';
import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {ApiError,database,ownedProduct,productFromRow} from './server';
import {slugify,type ProductContent} from './product';
import {builderDraftSchema,builderFamily,builderTypeDetails,builderTypeForFormat,builderTypes,defaultBuilderDraft,type BuilderDraft,type BuilderWorkspace,type BuilderCheck} from './builder-contract';
import {commerceAccount,getCommerceOffer} from './commerce-v2-server';
import {verifyStoredUpload} from './upload-validation';
import {evaluateProductReadiness,isUnfinishedPlaceholder,sectionHasContent} from './product-readiness';
import {builderRevisionKinds,builderRevisionLabels,builderRevisionRestoreSchema,builderRevisionSnapshot,restoreBuilderEditorialRevision,type BuilderRevisionHistory,type BuilderRevisionKind} from './builder-revision-contract';
import {validateCurriculum} from './product-curriculum';
import {productStudioSchema,productStudioPublicationSchema,publishedSectionStudioSchema,safeStudioUrl} from './product-studio-contract';
import {assertCreatorContextRefs,creatorContextGuard} from './creator-context-server';

export const builderHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
const fileTypes=['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/epub+zip','application/zip','application/octet-stream','application/json','text/html','text/css','text/javascript','application/javascript','text/x-python','audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/flac'];
async function verifiedAsset(owner:string,productId:string,id:string,kind:'resource'|'video'|'audio'|'cover',integrity=false){
 if(typeof id!=='string')return false;
 const row=await database().prepare("SELECT * FROM uploads WHERE id=? AND owner=? AND product_id=? AND status='completed' AND sha256 IS NOT NULL AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(id,owner,productId).first();
 if(!row||!/^[a-f0-9]{64}$/.test(String(row.sha256)))return false;
 const mime=String(row.mime);if(kind==='resource'&&!fileTypes.includes(mime)||kind==='video'&&!['video/mp4','video/webm'].includes(mime)||kind==='audio'&&!mime.startsWith('audio/')||kind==='cover'&&!['image/png','image/jpeg','image/webp'].includes(mime))return false;
 const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;if(!bucket)return false;
 try{const object=await bucket.get(String(row.object_key));if(!object)return false;if(integrity){await verifyStoredUpload(object.body,Number(row.size),String(row.sha256));return true;}const valid=object.size===Number(row.size);await object.body.cancel().catch(()=>{});return valid;}catch{return false;}
}
export async function builderReadiness(productId:string,owner:string,draft:BuilderDraft,integrity=false){
 const checks:BuilderCheck[]=[];
 const check=(key:string,ready:boolean,message:string)=>checks.push({key,ready,message});
 check('details',draft.title.trim().length>=3&&draft.description.trim().length>=12&&draft.audience.trim().length>=3,'Add a title, a description of at least 12 characters, and the intended audience.');
 const config=productStudioPublicationSchema.safeParse(draft.studio||{});check('settings',config.success,config.success?'Product settings are ready.':`Finish your product settings: ${config.error.issues[0]?.path.join(' › ')} — ${config.error.issues[0]?.message}`);
 if(!config.success)return {publishReady:false,checks};
 const tierIssues=communityTierResourceIssues(draft);check('membership-resources',!tierIssues.length,tierIssues[0]?.message||'Membership resources are ready.');
 const pricing=config.data.pricing;if(pricing?.model==='pwyw')check('pricing',Math.max(pricing.suggestedCents||draft.priceCents,0)>=pricing.minimumCents,'Set a suggested price at or above the minimum contribution.');
 if(pricing?.model==='subscription')check('subscription-coupons',!pricing.coupons.some(coupon=>coupon.percentOff===100),'Recurring subscriptions need a paid price. Use discounts below 100%.');
 const sectionIds=draft.sections.map((section,index)=>section.id||`section-${index}`),edges=new Map(draft.sections.map((section,index)=>[sectionIds[index],Array.isArray(section.studio?.prerequisiteIds)?section.studio.prerequisiteIds.filter(id=>typeof id==='string'):[]])),visited=new Set<string>(),active=new Set<string>();
 const validPrerequisites=(id:string):boolean=>{if(active.has(id)||!edges.has(id))return false;if(visited.has(id))return true;active.add(id);if(!edges.get(id)!.every(validPrerequisites))return false;active.delete(id);visited.add(id);return true;};
 check('prerequisites',sectionIds.every(validPrerequisites),'Choose existing prerequisite lessons and remove any circular dependencies.');
 if(draft.studio?.course?.modules){const issue=validateCurriculum(draft.studio.course.modules,draft.sections);check('curriculum',!issue,issue||'Course modules are ready.');}
 const family=builderFamily(draft),written=draft.sections.length>0&&draft.sections.every(section=>!!section.title.trim()&&!!section.body.trim());
 const validFiles=await Promise.all(draft.uploadIds.map(id=>verifiedAsset(owner,productId,id,'resource',integrity)));
 if(draft.sections.length){const complete=await Promise.all(draft.sections.map(async section=>!!section.title.trim()&&sectionHasContent(section)&&(!section.videoId||await verifiedAsset(owner,productId,section.videoId,'video',integrity))&&(!section.studio?.audioId||await verifiedAsset(owner,productId,section.studio.audioId,'audio',integrity))&&(!section.studio||publishedSectionStudioSchema.safeParse(section.studio).success)));check('sections',complete.every(Boolean),'Finish each added section or remove unused sections. Recordings must be available and validated.');}
 const generated=draft.files.length>0&&draft.files.every(file=>!!file.content.trim());
 check('files',validFiles.every(Boolean)&&(!draft.files.length||generated),'Every attached file must be available and validated; generated files must contain usable content.');
 const templates=Array.isArray(draft.studio?.templates?.items)?draft.studio.templates.items as {duplicateUrl?:string;blankUploadId?:string;exampleUploadId?:string}[]:[],cloudTemplates=templates.some(item=>safeStudioUrl(item.duplicateUrl||''));
 const custom=Array.isArray(draft.studio?.custom?.blocks)?draft.studio.custom.blocks as {kind?:string;body?:string;url?:string}[]:[],customContent=draft.type==='custom'&&(custom.some(item=>item.body?.trim()||safeStudioUrl(item.url)||['session','physical'].includes(item.kind||''))||(draft.studio?.custom?.deliveryKinds as string[]|undefined)?.includes('community')===true);
 check('template-files',templates.every(item=>[item.blankUploadId,item.exampleUploadId].every(id=>!id||draft.uploadIds.includes(id))),'Attach each selected template file to this product.');
 if(['document','custom'].includes(family))check('content',written||draft.uploadIds.length>0||generated||customContent,'Write finished sections, generate usable content, or attach your original finished file.');
 if(family==='templates'){
  check('templates',draft.uploadIds.length>0||generated||cloudTemplates,'Attach the actual reusable files or create editable templates. A description alone is not a template.');
  check('instructions',!!draft.fields.usageInstructions?.trim()||written,'Add instructions explaining how to use your templates.');
 }
 if(family==='course'||family==='challenge'){
  const lessons=await Promise.all(draft.sections.map(async section=>!!section.title.trim()&&sectionHasContent(section)&&(!section.videoId||await verifiedAsset(owner,productId,section.videoId,'video',integrity))&&(!section.studio?.audioId||await verifiedAsset(owner,productId,section.studio.audioId,'audio',integrity))&&(!section.studio||publishedSectionStudioSchema.safeParse(section.studio).success)));
  check('lessons',lessons.length>0&&lessons.every(Boolean),family==='challenge'?'Finish each activity with usable instructions. Challenges are delivered at the learner’s own pace.':'Add finished lesson notes or attach validated recordings to every lesson.');
 }
 if(family==='service'){
  check('scope',!!draft.fields.serviceScope?.trim()&&!!draft.fields.outcome?.trim(),'Describe your service scope and the outcome of the session.');
  check('session',Number(draft.fields.durationMinutes)>=15&&Number(draft.fields.durationMinutes)<=180&&!!draft.fields.preparation?.trim(),'Set a session duration from 15 to 180 minutes and customer preparation instructions.');
 }
 if(family==='community'||draft.type==='custom'&&(draft.studio?.custom?.deliveryKinds as string[]|undefined)?.includes('community'))check('membership',!!draft.fields.memberPromise?.trim()&&!!draft.fields.welcome?.trim()&&!!draft.fields.rules?.trim(),'Add the member promise, welcome and community rules. Your external member-space link stays private.');
 if(draft.coverUploadId)check('cover',await verifiedAsset(owner,productId,draft.coverUploadId,'cover',integrity),'Choose an available image or remove the cover.');
 const editorial=evaluateProductReadiness(draft),unfinished=editorial.checks.find(item=>item.status==='blocker'&&(
  /^(?:section-stub-|file-stub-)/.test(item.key)||item.key.startsWith('section-title-')||item.location.field&&isUnfinishedPlaceholder(item.location.field in draft?String(draft[item.location.field as keyof BuilderDraft]):draft.fields[item.location.field]||'')
 ));
 check('quality',!unfinished,unfinished?`${unfinished.title}. ${unfinished.message}`:'No unfinished drafting placeholders were found.');
 return {publishReady:checks.every(item=>item.ready),checks:checks.map(item=>({...item,message:item.ready?({details:'Product details are ready.',sections:'Added sections are ready.',files:'Private files are validated.',content:'Your content is ready.',templates:'Reusable files are included.',instructions:'Usage instructions are ready.',lessons:family==='challenge'?'Your self-paced activities are ready.':'Your lessons are ready.',scope:'Your service scope is clear.',session:'Session details are ready.',membership:'Member onboarding is ready.',cover:'Your cover is ready.'} as Record<string,string>)[item.key]||item.message:item.message}))};
}
export async function getBuilderWorkspace(productId:string,owner:string):Promise<BuilderWorkspace>{
 const product=productFromRow(await ownedProduct(productId,owner));
 const row=await database().prepare('SELECT * FROM product_builder_workspaces WHERE product_id=? AND owner=?').bind(productId,owner).first();
 if(!row)throw new ApiError('This product uses its existing editor. Open it from My products.',404);
 const draft=builderDraftSchema.parse(JSON.parse(String(row.data)));
 const [uploads,readiness,payments,offer,publication]=await Promise.all([
  database().prepare("SELECT id,name,mime,size,status,sha256,validation_error FROM uploads WHERE product_id=? AND owner=? AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id) ORDER BY created_at DESC").bind(productId,owner).all(),
  builderReadiness(productId,owner,draft),commerceAccount(owner),getCommerceOffer(productId,owner),
  database().prepare('SELECT version,slug,published_at FROM product_builder_publications WHERE product_id=? AND owner=?').bind(productId,owner).first(),
 ]);
 return {product,draft,version:Number(row.version),uploads:uploads.results as unknown as BuilderWorkspace['uploads'],readiness,payments,selling:offer.enabled,publication:publication&&Number(publication.published_at)>0?{version:Number(publication.version),slug:String(publication.slug),publishedAt:Number(publication.published_at)}:null};
}
export async function createBuilderWorkspace(owner:string,input:unknown){
 const value=z.object({type:z.enum(builderTypes),source:z.enum(['ai','upload','manual']),requestId:z.string().uuid()}).parse(input);
 const id=value.requestId,existing=await database().prepare('SELECT owner FROM products WHERE id=?').bind(id).first();
 if(existing){if(existing.owner!==owner)throw new ApiError('Product not found.',404);return getBuilderWorkspace(id,owner);}
 const draft=defaultBuilderDraft(value.type,value.source),info=builderTypeDetails[value.type],now=Date.now(),slug=`${slugify(info.name)}-${id.slice(0,8)}`;
 await database().batch([
  database().prepare("INSERT OR IGNORE INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'draft',?,?)").bind(id,owner,slug,`Untitled ${info.name}`,'','',info.format,0,'orange',JSON.stringify({sections:[],benefits:[],launch:'',files:[]}),now,now),
  database().prepare('INSERT OR IGNORE INTO product_builder_workspaces (product_id,owner,version,data,updated_at) SELECT ?,?,1,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?)').bind(id,owner,JSON.stringify(draft),now,id,owner),
 ]);
 return getBuilderWorkspace(id,owner);
}
export async function saveBuilderWorkspace(productId:string,owner:string,input:unknown,allowTypeChange=false,guard?:{sql:string;values:(string|number)[]}){
 const value=z.object({expectedVersion:z.number().int().min(1),draft:builderDraftSchema,revisionKind:z.enum(builderRevisionKinds).default('manual')}).parse(input);
 if(value.revisionKind.startsWith('ai-')&&!guard)throw new ApiError('Apply Gen’s saved proposal or generated result through its review action.',409);
 if(value.draft.studio)productStudioSchema.parse(value.draft.studio);
 await ownedProduct(productId,owner);
 const current=await database().prepare('SELECT * FROM product_builder_workspaces WHERE product_id=? AND owner=?').bind(productId,owner).first();if(!current)throw new ApiError('Product workspace not found.',404);
 const old=builderDraftSchema.parse(JSON.parse(String(current.data))),encoded=JSON.stringify(value.draft);
 if(Number(current.version)!==value.expectedVersion){if(encoded===String(current.data))return getBuilderWorkspace(productId,owner);throw new ApiError('This product changed in another tab. Reload the saved version before continuing.',409);}
 if(value.draft.type!==old.type&&!allowTypeChange)throw new ApiError('Use Change product type to review and convert this product.',409);
 const job=await database().prepare('SELECT status,lease FROM generation WHERE product_id=? AND owner=?').bind(productId,owner).first();
 if(job&&job.status!=='completed')throw new ApiError('Finish or stop AI generation before saving this draft.',409);
 // A completed generator writes products.content. Capture that result before a
 // subsequent manual save updates the working product; Apply remains explicit.
 if(job?.status==='completed')await captureGeneratedBuilderResult(productId,owner);
 const ids=[...value.draft.uploadIds,...value.draft.sections.flatMap(section=>[...(section.videoId?[section.videoId]:[]),...(section.studio?.audioId?[section.studio.audioId]:[])]),...(value.draft.coverUploadId?[value.draft.coverUploadId]:[])];
 for(const id of new Set(ids)){const upload=await database().prepare("SELECT id FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(id,productId,owner).first();if(!upload)throw new ApiError('Choose a completed upload belonging to this product. Private voice sources cannot be attached.',403);}
 if(encoded===String(current.data))return getBuilderWorkspace(productId,owner);
 const info=builderTypeDetails[value.draft.type],now=Math.max(Date.now(),Number(current.updated_at)+1),content:ProductContent={sections:value.draft.sections,files:value.draft.files,benefits:value.draft.fields.outcome?[value.draft.fields.outcome]:[],launch:''};
 const results=await database().batch([
  database().prepare('UPDATE product_builder_workspaces SET version=version+1,data=?,updated_at=? WHERE product_id=? AND owner=? AND version=?'+(guard?.sql||'')).bind(encoded,now,productId,owner,value.expectedVersion,...(guard?.values||[])),
  database().prepare(`INSERT OR IGNORE INTO product_builder_revisions (product_id,owner,version,kind,label,data,created_at) SELECT ?,?,?,'manual',?,?,? WHERE EXISTS(SELECT 1 FROM product_builder_workspaces WHERE product_id=? AND owner=? AND version=? AND updated_at=? AND data=?)`).bind(productId,owner,value.expectedVersion,builderRevisionLabels.manual,JSON.stringify(builderRevisionSnapshot(old)),Number(current.updated_at),productId,owner,value.expectedVersion+1,now,encoded),
  database().prepare(`INSERT OR IGNORE INTO product_builder_revisions (product_id,owner,version,kind,label,data,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM product_builder_workspaces WHERE product_id=? AND owner=? AND version=? AND updated_at=? AND data=?)`).bind(productId,owner,value.expectedVersion+1,value.revisionKind,builderRevisionLabels[value.revisionKind],JSON.stringify(builderRevisionSnapshot(value.draft)),now,productId,owner,value.expectedVersion+1,now,encoded),
  database().prepare('UPDATE products SET title=?,description=?,audience=?,format=?,price=?,content=?,updated_at=? WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM product_builder_workspaces WHERE product_id=? AND owner=? AND version=? AND updated_at=? AND data=?)').bind(value.draft.title||`Untitled ${info.name}`,value.draft.description,value.draft.audience,info.format,value.draft.priceCents,JSON.stringify(content),now,productId,owner,productId,owner,value.expectedVersion+1,now,encoded),
 ]);
 if(!results[0].meta.changes)throw new ApiError('This product changed while saving. Reload your saved draft.',409);
 return getBuilderWorkspace(productId,owner);
}
export async function convertBuilderWorkspace(productId:string,owner:string,input:unknown){
 const value=z.object({type:z.enum(builderTypes),expectedVersion:z.number().int().min(1)}).strict().parse(input),current=await getBuilderWorkspace(productId,owner);
 if(current.version!==value.expectedVersion)throw new ApiError('Save and reload the latest product before changing its type.',409);
 if(current.draft.type===value.type)return current;
 const defaults=defaultBuilderDraft(value.type,current.draft.source),draft=builderDraftSchema.parse({...current.draft,type:value.type,fields:{...defaults.fields,...current.draft.fields}});
 await saveBuilderWorkspace(productId,owner,{expectedVersion:value.expectedVersion,draft},true);
 await database().prepare('UPDATE commerce_offers SET enabled=0,updated_at=MAX(updated_at+1,?) WHERE product_id=? AND owner=?').bind(Date.now(),productId,owner).run();
 return getBuilderWorkspace(productId,owner);
}
export async function getBuilderRevisionHistory(productId:string,owner:string,beforeVersion?:number):Promise<BuilderRevisionHistory>{
 await ownedProduct(productId,owner);
 const current=await database().prepare('SELECT version FROM product_builder_workspaces WHERE product_id=? AND owner=?').bind(productId,owner).first();if(!current)throw new ApiError('Product workspace not found.',404);
 const before=beforeVersion===undefined?Number(current.version)+1:z.number().int().min(1).parse(beforeVersion);
 const rows=await database().prepare('SELECT version,kind,label,data,created_at FROM product_builder_revisions WHERE product_id=? AND owner=? AND version<? ORDER BY version DESC LIMIT 51').bind(productId,owner,before).all();
 return {currentVersion:Number(current.version),hasMore:rows.results.length>50,revisions:rows.results.slice(0,50).map(row=>{const draft=builderDraftSchema.parse(JSON.parse(String(row.data)));return {version:Number(row.version),kind:row.kind as BuilderRevisionKind,label:String(row.label),createdAt:Number(row.created_at),title:draft.title,sectionCount:draft.sections.length};})};
}
export async function restoreBuilderRevision(productId:string,owner:string,input:unknown){
 const value=builderRevisionRestoreSchema.parse(input),workspace=await getBuilderWorkspace(productId,owner);
 if(workspace.version!==value.expectedVersion)throw new ApiError('Your draft changed after this history was opened. Reopen revision history to review the latest saved draft.',409);
 const revision=await database().prepare('SELECT data FROM product_builder_revisions WHERE product_id=? AND owner=? AND version=?').bind(productId,owner,value.revisionVersion).first();if(!revision)throw new ApiError('Revision not found.',404);
 const previous=builderDraftSchema.parse(JSON.parse(String(revision.data)));
 let draft:BuilderDraft;try{draft=restoreBuilderEditorialRevision(workspace.draft,previous);}catch(error){throw new ApiError(error instanceof Error?error.message:'This revision cannot be restored safely.',409);}
 return saveBuilderWorkspace(productId,owner,{expectedVersion:value.expectedVersion,draft,revisionKind:'restore'});
}
export async function adoptBuilderWorkspace(productId:string,owner:string){
 const existing=await database().prepare('SELECT product_id FROM product_builder_workspaces WHERE product_id=? AND owner=?').bind(productId,owner).first();if(existing)return getBuilderWorkspace(productId,owner);
 const product=productFromRow(await ownedProduct(productId,owner));
 if(await database().prepare('SELECT product_id FROM file_sale_drafts WHERE product_id=?').bind(productId).first())throw new ApiError('This file offer keeps its protected editor and purchase revisions. Open it from My products.',409);
 if(await database().prepare("SELECT id FROM orders WHERE owner=? AND (product_id=? OR EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(items) THEN items ELSE '[]' END) item WHERE json_extract(item.value,'$.id')=?)) LIMIT 1").bind(owner,productId,productId).first()||await database().prepare('SELECT id FROM commerce_orders WHERE product_id=? LIMIT 1').bind(productId).first())throw new ApiError('This product has existing purchases and keeps its original protected editor. Open it from My products.',409);
 const draft=defaultBuilderDraft(builderTypeForFormat(product.format),'manual');
 Object.assign(draft,{title:product.title,description:product.description,audience:product.audience,priceCents:Math.round(product.price*100),sections:product.content.sections,files:product.content.files||[]});
 await database().prepare('INSERT OR IGNORE INTO product_builder_workspaces (product_id,owner,version,data,updated_at) VALUES (?,?,1,?,?)').bind(productId,owner,JSON.stringify(builderDraftSchema.parse(draft)),Date.now()).run();
 return getBuilderWorkspace(productId,owner);
}
export async function syncGeneratedBuilderContent(productId:string,owner:string,expectedVersion:number){
 const workspace=await getBuilderWorkspace(productId,owner),job=await database().prepare('SELECT status,brief FROM generation WHERE product_id=? AND owner=?').bind(productId,owner).first();
 if(!job||job.status!=='completed')throw new ApiError('Wait for all generation steps to finish before applying the result.',409);
 if(workspace.version!==expectedVersion)throw new ApiError('Your draft changed while AI worked. Reload and review the result before applying it.',409);
 const refs=JSON.parse(String(job.brief)).creatorContextRefs;await assertCreatorContextRefs(owner,productId,refs);
 const generated=await captureGeneratedBuilderResult(productId,owner);
 if(!generated)throw new ApiError('The generated result is not ready. Resume generation and try again.',409);
 const saved=await saveBuilderWorkspace(productId,owner,{expectedVersion,draft:{...workspace.draft,sections:generated.sections,files:generated.files||[]},revisionKind:'ai-generation'},false,creatorContextGuard(owner,productId,refs));
 const finished=await database().prepare("SELECT brief FROM generation WHERE product_id=? AND owner=? AND status='completed'").bind(productId,owner).first();
 if(finished)await database().prepare("UPDATE generation SET brief=? WHERE product_id=? AND owner=? AND status='completed' AND brief=?").bind(JSON.stringify({...JSON.parse(String(finished.brief)),builderAppliedVersion:saved.version}),productId,owner,finished.brief).run();
 return saved;
}
export async function captureGeneratedBuilderResult(productId:string,owner:string):Promise<ProductContent|null>{
 const job=await database().prepare("SELECT brief FROM generation WHERE product_id=? AND owner=? AND status='completed'").bind(productId,owner).first();if(!job)return null;
 const brief=JSON.parse(String(job.brief));if(brief.builderResult)return brief.builderResult as ProductContent;
 const product=productFromRow(await ownedProduct(productId,owner));
 await database().prepare("UPDATE generation SET brief=? WHERE product_id=? AND owner=? AND status='completed' AND brief=?").bind(JSON.stringify({...brief,builderResult:product.content}),productId,owner,job.brief).run();
 const saved=await database().prepare("SELECT brief FROM generation WHERE product_id=? AND owner=? AND status='completed'").bind(productId,owner).first();
 return saved?(JSON.parse(String(saved.brief)).builderResult||null) as ProductContent|null:null;
}
