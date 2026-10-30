import {createHash} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {ApiError,database,ownedProduct} from './server';
import {reserveCredits,refundCredits} from './credits';
import {hasUnlimitedGeneration} from './generation-access';
import {storageLimit} from './experience';
import {verifyStoredUpload,UploadValidationError} from './upload-validation';
import {recoverBuilderDesignRuns} from './builder-design-server';
import {generateOpenAIImage,imageGenerationReadiness} from './openai-image';
import {DESIGN_IMAGE_MODEL,designImageGenerateSchema,designImageResultSchema,designImageCredits,designImageCreditCosts,designImageQualities,designImageSizes,designImageBackgrounds,type DesignImageReadiness,type DesignImageResult} from './design-image';

const leaseDuration=180000;
// Shared recovery already owns this ledger namespace for every design run.
const creditId=(id:string)=>'builder-design:'+id;
const bucket=()=>((env as unknown as {BUCKET?:R2Bucket}).BUCKET);
export class DesignImageError extends ApiError{
 constructor(message:string,status=400,public retryable=false,public reservedCreditsRefunded=false){super(message,status);}
}
const inactive=(product:Record<string,unknown>)=>product.archived_at!=null;
function assertActive(product:Record<string,unknown>){if(inactive(product))throw new DesignImageError('Restore this product before generating artwork.',409);}
function replay(row:Record<string,unknown>,owner:string,productId:string,version:number,intent:string):DesignImageResult{
 if(row.owner!==owner||row.product_id!==productId||Number(row.expected_version)!==version||row.request_intent!==intent)throw new DesignImageError('This request reference was already used for different work.',409);
 if(row.state==='completed')return designImageResultSchema.parse(JSON.parse(String(row.response)));
 if(row.state==='failed')throw new DesignImageError('This attempt failed or expired. Start a new attempt to retry.',409,false,true);
 throw new DesignImageError('This artwork request is still running. Retry to recover the same request.',409,true,false);
}
async function discardUpload(uploadId:string,owner:string,productId:string){
 const db=database(),upload=await db.prepare("SELECT object_key FROM uploads WHERE id=? AND owner=? AND product_id=? AND status!='completed' AND object_key LIKE 'design-images/%'").bind(uploadId,owner,productId).first();
 if(!upload)return;
 await db.prepare("UPDATE uploads SET status='failed',validation_error='Image generation did not complete. Any reserved credits were returned.',updated_at=? WHERE id=? AND owner=? AND product_id=? AND status!='completed'").bind(Date.now(),uploadId,owner,productId).run();
 await bucket()?.delete(String(upload.object_key)).catch(()=>{});
}
/** Repair interrupted image uploads after shared lease/credit recovery. */
export async function recoverDesignImageRuns(productId:string,owner:string){
 await recoverBuilderDesignRuns(productId,owner);
 const rows=await database().prepare("SELECT id,request_intent,response FROM builder_design_generation_runs WHERE product_id=? AND owner=? AND state='failed' AND response IS NOT NULL LIMIT 50").bind(productId,owner).all();
 for(const row of rows.results){
  let pending:{id?:unknown}|undefined;
  try{if(JSON.parse(String(row.request_intent)).operation!=='image-layer')continue;pending=JSON.parse(String(row.response))?.pendingUpload;}catch{continue;}
  if(typeof pending?.id!=='string')continue;
  await discardUpload(pending.id,owner,productId);
  await database().prepare("UPDATE builder_design_generation_runs SET response=NULL WHERE id=? AND owner=? AND state='failed'").bind(row.id,owner).run();
 }
}
export async function designImageReadiness(productId:string,owner:string):Promise<DesignImageReadiness>{
 const product=await ownedProduct(productId,owner);await recoverDesignImageRuns(productId,owner);
 const capability=await imageGenerationReadiness(owner),ready=capability.ready&&Boolean(bucket())&&!inactive(product);
 return {...capability,ready,message:inactive(product)?'Restore this product before generating artwork.':!bucket()?'Image storage is temporarily unavailable. Your current pages are safe.':capability.message,costs:{...designImageCreditCosts},unlimited:await hasUnlimitedGeneration(owner),qualities:designImageQualities,sizes:designImageSizes,backgrounds:designImageBackgrounds,defaultQuality:'medium'};
}

/** Produces one private, verified upload candidate; never edits a design or publication. */
export async function generateDesignImage(productId:string,owner:string,value:unknown):Promise<DesignImageResult>{
 const input=designImageGenerateSchema.parse(value),product=await ownedProduct(productId,owner);assertActive(product);
 const db=database(),intent=JSON.stringify({operation:'image-layer',model:DESIGN_IMAGE_MODEL,prompt:input.prompt,quality:input.quality,size:input.size,background:input.background});
 await recoverDesignImageRuns(productId,owner);
 const existing=await db.prepare('SELECT * FROM builder_design_generation_runs WHERE id=?').bind(input.requestId).first();
 if(existing)return replay(existing,owner,productId,input.expectedVersion,intent);
 const saved=await db.prepare('SELECT version,data FROM product_builder_workspaces WHERE product_id=? AND owner=?').bind(productId,owner).first();
 if(!saved)throw new DesignImageError('Save this product before generating artwork.',409);
 if(Number(saved.version)!==input.expectedVersion)throw new DesignImageError('Your product changed. Save its latest version before generating artwork.',409);
 const capability=await imageGenerationReadiness(owner);if(!capability.ready)throw new DesignImageError(capability.message,503);
 const store=bucket();if(!store)throw new DesignImageError('Image storage is temporarily unavailable. No credits were charged.',503);
 const quota=await db.prepare("SELECT COALESCE(SUM(size),0) AS size FROM uploads WHERE owner=? AND status!='failed'").bind(owner).first();
 if(Number(quota?.size)>=storageLimit)throw new DesignImageError('Your 2 GB upload allowance is full. Remove unused files before generating artwork.',403);
 let cost=await hasUnlimitedGeneration(owner)?0:designImageCredits(input.quality,input.size);
 if(cost>input.maxCredits)throw new DesignImageError(`This artwork needs ${cost} credits. Review its quality and price before continuing.`,402);
 const now=Date.now(),claim=await db.prepare(`INSERT OR IGNORE INTO builder_design_generation_runs(id,product_id,owner,expected_version,product_updated_at,draft_snapshot,request_intent,state,cost,lease_expires_at,created_at)
 SELECT ?,?,?,?,?,?,?,'pending',?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=? AND archived_at IS NULL AND updated_at=?) AND EXISTS(SELECT 1 FROM product_builder_workspaces WHERE product_id=? AND owner=? AND version=? AND data=?) AND (SELECT COUNT(*) FROM builder_design_generation_runs WHERE owner=? AND state='pending')<4`).bind(input.requestId,productId,owner,input.expectedVersion,product.updated_at,String(saved.data),intent,cost,now+leaseDuration,now,productId,owner,product.updated_at,productId,owner,input.expectedVersion,String(saved.data),owner).run();
 if(!claim.meta.changes){
  const concurrent=await db.prepare('SELECT * FROM builder_design_generation_runs WHERE id=?').bind(input.requestId).first();
  if(concurrent)return replay(concurrent,owner,productId,input.expectedVersion,intent);
  throw new DesignImageError('Your product changed or another design is generating. Wait for it to finish, then retry.',409);
 }
 let uploadId='';
 try{
  if(cost){
   await reserveCredits(owner,creditId(input.requestId),'image',cost);
   const usage=await db.prepare('SELECT cost FROM credit_usage WHERE id=? AND owner=?').bind(creditId(input.requestId),owner).first();
   if(usage&&Number(usage.cost)===0){cost=0;await db.prepare("UPDATE builder_design_generation_runs SET cost=0 WHERE id=? AND owner=? AND state='pending'").bind(input.requestId,owner).run();}
  }
  const activeSQL=`SELECT r.id FROM builder_design_generation_runs r JOIN products p ON p.id=r.product_id AND p.owner=r.owner JOIN product_builder_workspaces w ON w.product_id=r.product_id AND w.owner=r.owner WHERE r.id=? AND r.owner=? AND r.state='pending' AND r.lease_expires_at>? AND p.archived_at IS NULL AND p.updated_at=r.product_updated_at AND w.version=r.expected_version AND w.data=r.draft_snapshot AND (?=0 OR EXISTS(SELECT 1 FROM credit_usage WHERE id=? AND owner=? AND state='reserved' AND cost=?))`;
  const active=()=>db.prepare(activeSQL).bind(input.requestId,owner,Date.now(),cost,creditId(input.requestId),owner,cost).first();
  if(!await active())throw new DesignImageError('Your product changed before generation. Your saved design is unchanged.',409);
  const image=await generateOpenAIImage({owner,prompt:input.prompt,quality:input.quality,size:input.size,background:input.background,outputFormat:'png'});
  if(image.mime!=='image/png'||image.bytes.length>8_000_000)throw new DesignImageError('The generated image could not be verified.',502);
  if(!await active())throw new DesignImageError('Your product changed or this generation expired. Your saved design is unchanged.',409);
  uploadId=crypto.randomUUID();const objectKey=`design-images/${owner}/${productId}/${input.requestId}/${uploadId}.png`,name='Generated artwork.png',checksum=createHash('sha256').update(image.bytes).digest('hex'),created=Date.now();
  const pending=JSON.stringify({pendingUpload:{id:uploadId}}),reserved=await db.batch([
   db.prepare(`INSERT INTO uploads(id,owner,product_id,name,mime,size,object_key,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,'processing',?,? WHERE EXISTS(${activeSQL}) AND (SELECT COALESCE(SUM(size),0) FROM uploads WHERE owner=? AND status!='failed')+?<=?`).bind(uploadId,owner,productId,name,image.mime,image.bytes.length,objectKey,created,created,input.requestId,owner,Date.now(),cost,creditId(input.requestId),owner,cost,owner,image.bytes.length,storageLimit),
   db.prepare("UPDATE builder_design_generation_runs SET response=? WHERE id=? AND owner=? AND state='pending' AND EXISTS(SELECT 1 FROM uploads WHERE id=? AND owner=? AND product_id=? AND status='processing')").bind(pending,input.requestId,owner,uploadId,owner,productId),
  ]);
  if(!reserved[0].meta.changes){if(!await active())throw new DesignImageError('Your product changed or this generation expired. Your saved design is unchanged.',409);throw new DesignImageError('The image exceeds your remaining upload allowance. Free some space and retry.',403);}
  await store.put(objectKey,image.bytes,{httpMetadata:{contentType:image.mime}});
  const stored=await store.get(objectKey);
  if(!stored||stored.size!==image.bytes.length){await stored?.body.cancel().catch(()=>{});throw new DesignImageError('The generated image could not be saved completely. Please retry.',503);}
  await verifyStoredUpload(stored.body,image.bytes.length,checksum);
  const result:DesignImageResult={upload:{id:uploadId,name,mime:'image/png',size:image.bytes.length,status:'completed',sha256:checksum,width:image.width,height:image.height},spent:cost,requestId:input.requestId,quality:input.quality,size:input.size,background:input.background,model:DESIGN_IMAGE_MODEL},encoded=JSON.stringify(result);
  const completed=await db.batch([
   db.prepare(`UPDATE builder_design_generation_runs SET state='completed',response=? WHERE id=? AND owner=? AND state='pending' AND lease_expires_at>? AND EXISTS(SELECT 1 FROM products p JOIN product_builder_workspaces w ON w.product_id=p.id AND w.owner=p.owner WHERE p.id=builder_design_generation_runs.product_id AND p.owner=builder_design_generation_runs.owner AND p.archived_at IS NULL AND p.updated_at=builder_design_generation_runs.product_updated_at AND w.version=builder_design_generation_runs.expected_version AND w.data=builder_design_generation_runs.draft_snapshot) AND (?=0 OR EXISTS(SELECT 1 FROM credit_usage WHERE id=? AND owner=? AND state='reserved' AND cost=?)) AND EXISTS(SELECT 1 FROM uploads WHERE id=? AND owner=? AND product_id=? AND status='processing' AND object_key=? AND size=?)`).bind(encoded,input.requestId,owner,Date.now(),cost,creditId(input.requestId),owner,cost,uploadId,owner,productId,objectKey,image.bytes.length),
   db.prepare("UPDATE uploads SET status='completed',sha256=?,validation_error=NULL,updated_at=? WHERE id=? AND owner=? AND product_id=? AND status='processing' AND EXISTS(SELECT 1 FROM builder_design_generation_runs WHERE id=? AND owner=? AND state='completed' AND response=?)").bind(checksum,Date.now(),uploadId,owner,productId,input.requestId,owner,encoded),
   db.prepare("UPDATE credit_usage SET state='completed' WHERE id=? AND owner=? AND state='reserved' AND EXISTS(SELECT 1 FROM builder_design_generation_runs WHERE id=? AND owner=? AND state='completed' AND response=?)").bind(creditId(input.requestId),owner,input.requestId,owner,encoded),
  ]);
  if(!completed[0].meta.changes)throw new DesignImageError('Your product changed or this generation expired. Your saved design is unchanged.',409);
  return result;
 }catch(error){
  // A committed response survives a transport error from the database batch.
  const persisted=await db.prepare('SELECT * FROM builder_design_generation_runs WHERE id=? AND owner=?').bind(input.requestId,owner).first();
  if(persisted?.state==='completed')return replay(persisted,owner,productId,input.expectedVersion,intent);
  await db.prepare("UPDATE builder_design_generation_runs SET state='failed' WHERE id=? AND owner=? AND state='pending'").bind(input.requestId,owner).run();
  if(uploadId)await discardUpload(uploadId,owner,productId);
  try{await refundCredits(creditId(input.requestId));}catch{throw new DesignImageError('The artwork result could not be confirmed yet. Retry to recover this request.',503,true,false);}
  const safe=error instanceof ApiError||error instanceof UploadValidationError?error:new ApiError('GPT Image 2 could not finish this artwork. Please retry.',502);
  throw new DesignImageError(safe.message+' Your current pages are unchanged. Any reserved credits were refunded.',safe.status,false,true);
 }
}
