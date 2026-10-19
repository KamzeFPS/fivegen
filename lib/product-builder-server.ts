import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {ApiError,database,ownedProduct,productFromRow} from './server';
import {slugify,type ProductContent} from './product';
import {builderDraftSchema,builderFamily,builderTypeDetails,builderTypeForFormat,builderTypes,defaultBuilderDraft,type BuilderDraft,type BuilderWorkspace,type BuilderCheck} from './builder-contract';
import {commerceAccount,getCommerceOffer} from './commerce-v2-server';
import {verifyStoredUpload} from './upload-validation';

export const builderHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
const fileTypes=['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv'];
async function verifiedAsset(owner:string,productId:string,id:string,kind:'resource'|'video'|'cover',integrity=false){
 const row=await database().prepare("SELECT * FROM uploads WHERE id=? AND owner=? AND product_id=? AND status='completed' AND sha256 IS NOT NULL AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(id,owner,productId).first();
 if(!row||!/^[a-f0-9]{64}$/.test(String(row.sha256)))return false;
 const mime=String(row.mime);if(kind==='resource'&&!fileTypes.includes(mime)||kind==='video'&&!['video/mp4','video/webm'].includes(mime)||kind==='cover'&&!['image/png','image/jpeg','image/webp'].includes(mime))return false;
 const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;if(!bucket)return false;
 try{const object=await bucket.get(String(row.object_key));if(!object)return false;if(integrity){await verifyStoredUpload(object.body,Number(row.size),String(row.sha256));return true;}const valid=object.size===Number(row.size);await object.body.cancel().catch(()=>{});return valid;}catch{return false;}
}
export async function builderReadiness(productId:string,owner:string,draft:BuilderDraft,integrity=false){
 const checks:BuilderCheck[]=[];
 const check=(key:string,ready:boolean,message:string)=>checks.push({key,ready,message});
 check('details',draft.title.trim().length>=3&&draft.description.trim().length>=12&&draft.audience.trim().length>=3,'Add a title, a description of at least 12 characters, and the intended audience.');
 const family=builderFamily(draft),written=draft.sections.length>0&&draft.sections.every(section=>!!section.title.trim()&&!!section.body.trim());
 const validFiles=await Promise.all(draft.uploadIds.map(id=>verifiedAsset(owner,productId,id,'resource',integrity)));
 if(draft.sections.length){const complete=await Promise.all(draft.sections.map(async section=>!!section.title.trim()&&(!!section.body.trim()||!!section.videoId)&&(!section.videoId||await verifiedAsset(owner,productId,section.videoId,'video',integrity))));check('sections',complete.every(Boolean),'Finish each added section or remove unused sections. Recordings must be available and validated.');}
 const generated=draft.files.length>0&&draft.files.every(file=>!!file.content.trim());
 check('files',validFiles.every(Boolean)&&(!draft.files.length||generated),'Every attached file must be available and validated; generated files must contain usable content.');
 if(['document','custom'].includes(family))check('content',written||draft.uploadIds.length>0||generated,'Write finished sections, generate usable content, or attach your original finished file.');
 if(family==='templates'){
  check('templates',draft.uploadIds.length>0||generated,'Attach the actual reusable files or create editable templates. A description alone is not a template.');
  check('instructions',!!draft.fields.usageInstructions?.trim()||written,'Add instructions explaining how to use your templates.');
 }
 if(family==='course'||family==='challenge'){
  const lessons=await Promise.all(draft.sections.map(async section=>!!section.title.trim()&&(!!section.body.trim()||!!section.videoId)&&(!section.videoId||await verifiedAsset(owner,productId,section.videoId,'video',integrity))));
  check('lessons',lessons.length>0&&lessons.every(Boolean),family==='challenge'?'Finish each activity with usable instructions. Challenges are delivered at the learner’s own pace.':'Add finished lesson notes or attach validated recordings to every lesson.');
 }
 if(family==='service'){
  check('scope',!!draft.fields.serviceScope?.trim()&&!!draft.fields.outcome?.trim(),'Describe your service scope and the outcome of the session.');
  check('session',Number(draft.fields.durationMinutes)>=15&&Number(draft.fields.durationMinutes)<=180&&!!draft.fields.preparation?.trim(),'Set a session duration from 15 to 180 minutes and customer preparation instructions.');
 }
 if(family==='community')check('membership',!!draft.fields.memberPromise?.trim()&&!!draft.fields.welcome?.trim()&&!!draft.fields.rules?.trim(),'Add the member promise, welcome and community rules. Your external member-space link stays private.');
 if(draft.coverUploadId)check('cover',await verifiedAsset(owner,productId,draft.coverUploadId,'cover',integrity),'Choose an available image or remove the cover.');
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
 return {product,draft,version:Number(row.version),uploads:uploads.results as unknown as BuilderWorkspace['uploads'],readiness,payments,selling:offer.enabled,publication:publication?{version:Number(publication.version),slug:String(publication.slug),publishedAt:Number(publication.published_at)}:null};
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
export async function saveBuilderWorkspace(productId:string,owner:string,input:unknown){
 const value=z.object({expectedVersion:z.number().int().min(1),draft:builderDraftSchema}).parse(input);
 await ownedProduct(productId,owner);
 const current=await database().prepare('SELECT * FROM product_builder_workspaces WHERE product_id=? AND owner=?').bind(productId,owner).first();if(!current)throw new ApiError('Product workspace not found.',404);
 const old=builderDraftSchema.parse(JSON.parse(String(current.data))),encoded=JSON.stringify(value.draft);
 if(Number(current.version)!==value.expectedVersion){if(encoded===String(current.data))return getBuilderWorkspace(productId,owner);throw new ApiError('This product changed in another tab. Reload the saved version before continuing.',409);}
 if(value.draft.type!==old.type)throw new ApiError('A product keeps its original type. Create a new product to use a different builder.',409);
 const job=await database().prepare('SELECT status,lease FROM generation WHERE product_id=? AND owner=?').bind(productId,owner).first();
 if(job&&job.status!=='completed')throw new ApiError('Finish or stop AI generation before saving this draft.',409);
 // A completed generator writes products.content. Capture that result before a
 // subsequent manual save updates the working product; Apply remains explicit.
 if(job?.status==='completed')await captureGeneratedBuilderResult(productId,owner);
 const ids=[...value.draft.uploadIds,...value.draft.sections.flatMap(section=>section.videoId?[section.videoId]:[]),...(value.draft.coverUploadId?[value.draft.coverUploadId]:[])];
 for(const id of new Set(ids)){const upload=await database().prepare("SELECT id FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(id,productId,owner).first();if(!upload)throw new ApiError('Choose a completed upload belonging to this product. Private voice sources cannot be attached.',403);}
 if(encoded===String(current.data))return getBuilderWorkspace(productId,owner);
 const info=builderTypeDetails[value.draft.type],now=Math.max(Date.now(),Number(current.updated_at)+1),content:ProductContent={sections:value.draft.sections,files:value.draft.files,benefits:value.draft.fields.outcome?[value.draft.fields.outcome]:[],launch:''};
 const results=await database().batch([
  database().prepare('UPDATE product_builder_workspaces SET version=version+1,data=?,updated_at=? WHERE product_id=? AND owner=? AND version=?').bind(encoded,now,productId,owner,value.expectedVersion),
  database().prepare('UPDATE products SET title=?,description=?,audience=?,format=?,price=?,content=?,updated_at=? WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM product_builder_workspaces WHERE product_id=? AND owner=? AND version=? AND updated_at=?)').bind(value.draft.title||`Untitled ${info.name}`,value.draft.description,value.draft.audience,info.format,value.draft.priceCents,JSON.stringify(content),now,productId,owner,productId,owner,value.expectedVersion+1,now),
 ]);
 if(!results[0].meta.changes)throw new ApiError('This product changed while saving. Reload your saved draft.',409);
 return getBuilderWorkspace(productId,owner);
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
 const workspace=await getBuilderWorkspace(productId,owner),job=await database().prepare('SELECT status FROM generation WHERE product_id=? AND owner=?').bind(productId,owner).first();
 if(!job||job.status!=='completed')throw new ApiError('Wait for all generation steps to finish before applying the result.',409);
 if(workspace.version!==expectedVersion)throw new ApiError('Your draft changed while AI worked. Reload and review the result before applying it.',409);
 const generated=await captureGeneratedBuilderResult(productId,owner);
 if(!generated)throw new ApiError('The generated result is not ready. Resume generation and try again.',409);
 const saved=await saveBuilderWorkspace(productId,owner,{expectedVersion,draft:{...workspace.draft,sections:generated.sections,files:generated.files||[]}});
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
