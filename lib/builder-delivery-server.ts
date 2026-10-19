import {env} from 'cloudflare:workers';
import {ApiError,database} from './server';
import {builderDeliverySnapshotSchema,type BuilderDeliverySnapshot} from './builder-publication-contract';
import {verifyStoredUpload} from './upload-validation';

export async function builderPublishedDelivery(productId:string){
 const row=await database().prepare('SELECT * FROM product_builder_publications WHERE product_id=?').bind(productId).first();
 return row?{row,snapshot:builderDeliverySnapshotSchema.parse(JSON.parse(String(row.content_snapshot)))}:null;
}
export async function builderOrderDelivery(orderId:string){
 const row=await database().prepare('SELECT snapshot FROM product_builder_order_snapshots WHERE order_id=?').bind(orderId).first();
 return row?builderDeliverySnapshotSchema.parse(JSON.parse(String(row.snapshot))):null;
}
export async function verifyBuilderDelivery(product:{id:unknown;owner:unknown},snapshot:BuilderDeliverySnapshot,integrity=false){
 const ids=[...new Set([...snapshot.uploadIds,...snapshot.sections.map(section=>section.videoId).filter((id):id is string=>!!id)])];
 for(const id of ids){
  const upload=await database().prepare("SELECT * FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(id,product.id,product.owner).first();
  if(!upload||!/^[a-f0-9]{64}$/.test(String(upload.sha256||'')))throw new ApiError('A product file is unavailable or unverified. Upload it again before publishing or selling.',409);
  if(snapshot.sections.some(section=>section.videoId===id)&&!['video/mp4','video/webm'].includes(String(upload.mime)))throw new ApiError('Choose a completed MP4 or WebM recording for every video lesson.',409);
  const object=await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.get(String(upload.object_key));
  if(!object)throw new ApiError('A product file is unavailable. Upload it again before publishing or selling.',409);
  if(integrity){try{await verifyStoredUpload(object.body,Number(upload.size),String(upload.sha256));}catch{throw new ApiError('A product file failed its integrity check. Upload the original file again.',409);}}
  else {const correct=object.size===Number(upload.size);await object.body.cancel().catch(()=>{});if(!correct)throw new ApiError('A product file is incomplete. Upload the original file again.',409);}
 }
}
export async function builderDownloadMetadata(orderId:string,productId:string,owner:string){
 const snapshot=await builderOrderDelivery(orderId);if(!snapshot)return [];
 const grants=await database().prepare('SELECT upload_id FROM product_builder_upload_grants WHERE order_id=?').bind(orderId).all(),ids=[...new Set([...snapshot.uploadIds,...grants.results.map(row=>String(row.upload_id))])];
 if(!ids.length)return [];
 const result=await database().prepare(`SELECT id,name,mime,size FROM uploads WHERE id IN (${ids.map(()=>'?').join(',')}) AND product_id=? AND owner=? AND status='completed' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id) ORDER BY created_at,id`).bind(...ids,productId,owner).all();
 return result.results.map(row=>({id:String(row.id),name:String(row.name),mime:String(row.mime),size:Number(row.size)}));
}
export async function builderPrivateDownload(req:Request,order:Record<string,unknown>,uploadId:string){
 const snapshot=await builderOrderDelivery(String(order.id)),grant=await database().prepare('SELECT upload_id FROM product_builder_upload_grants WHERE order_id=? AND upload_id=?').bind(order.id,uploadId).first();if(!snapshot||!snapshot.uploadIds.includes(uploadId)&&!grant)throw new ApiError('File not found in this purchase.',404);
 const upload=await database().prepare("SELECT * FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(uploadId,order.product_id,order.owner).first();
 if(!upload)throw new ApiError('File unavailable. Contact your creator.',404);
 const object=await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.get(String(upload.object_key));if(!object||object.size!==Number(upload.size))throw new ApiError('File unavailable. Contact your creator.',404);
 return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(upload.size),'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(String(upload.name))}`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}
// The publication batch executes this statement after saving the public
// revision. Updates are additive, PDF-only, and require PDF access in the
// original purchased snapshot. New lesson modules and delivery families are
// never silently granted. Only paid customers at publication receive updates;
// a pending checkout keeps the exact offer originally reviewed by its buyer.
export function builderPdfUpdateGrantStatement(productId:string,owner:string,version:number,uploadIds:string[],family:string,createdAt:number){
 return database().prepare(`INSERT OR IGNORE INTO product_builder_upload_grants (order_id,upload_id,publication_version,created_at)
 SELECT s.order_id,u.id,?,? FROM product_builder_order_snapshots s JOIN commerce_orders o ON o.id=s.order_id
 JOIN uploads u ON u.product_id=s.product_id AND u.owner=o.owner
 WHERE s.product_id=? AND o.owner=? AND o.status='paid' AND json_extract(s.snapshot,'$.deliveryFamily')=?
 AND u.id IN (SELECT value FROM json_each(?)) AND u.mime='application/pdf' AND u.status='completed' AND u.sha256 IS NOT NULL AND u.object_key NOT LIKE 'voice/%'
 AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=u.id)
 AND EXISTS(SELECT 1 FROM json_each(s.snapshot,'$.uploadIds') original JOIN uploads original_file ON original_file.id=original.value WHERE original_file.product_id=s.product_id AND original_file.owner=o.owner AND original_file.mime='application/pdf' AND original_file.object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=original_file.id))
 AND EXISTS(SELECT 1 FROM product_builder_publications p WHERE p.product_id=s.product_id AND p.owner=o.owner AND p.version=? AND json_extract(p.content_snapshot,'$.deliveryFamily')=? AND u.id IN(SELECT value FROM json_each(p.upload_ids)))`).bind(version,createdAt,productId,owner,family,JSON.stringify(uploadIds),version,family);
}
