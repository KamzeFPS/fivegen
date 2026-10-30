import {env} from 'cloudflare:workers';
import {ApiError,database} from './server';
import {builderDeliverySnapshotSchema,builderPublishedPresentation,type BuilderDeliverySnapshot} from './builder-publication-contract';
import {verifyStoredUpload} from './upload-validation';
import {assertCommunityTierEntitlement} from './product-community-tiers';
import {communityTierDelivery,communityTierAllows} from './product-community-tier-contract';
import {designImageIds} from './design-document';

export async function builderPublishedDelivery(productId:string){
 const row=await database().prepare('SELECT * FROM product_builder_publications WHERE product_id=?').bind(productId).first();
 if(!row)return null;
 const content=JSON.parse(String(row.content_snapshot));
 return {row,snapshot:builderDeliverySnapshotSchema.parse({...content,...builderPublishedPresentation(content,JSON.parse(String(row.public_snapshot)))})};
}
export async function builderOrderDelivery(orderId:string){
 const row=await database().prepare(`SELECT s.snapshot,p.content_snapshot,p.public_snapshot FROM product_builder_order_snapshots s
  JOIN commerce_orders o ON o.id=s.order_id AND o.product_id=s.product_id
  LEFT JOIN product_builder_publications p ON p.product_id=s.product_id AND p.owner=o.owner AND p.version=s.publication_version
  WHERE s.order_id=?`).bind(orderId).first();
 if(!row)return null;
 // Recover presentation stripped by older checkout code only from the exact
 // purchased publication version. Sections, files and grants remain frozen.
 const recovered=row.content_snapshot?builderPublishedPresentation(JSON.parse(String(row.content_snapshot)),JSON.parse(String(row.public_snapshot))):{};
 const purchased=JSON.parse(String(row.snapshot));
 return builderDeliverySnapshotSchema.parse({...recovered,...purchased});
}
export async function builderBuyerDelivery(orderId:string){const raw=await builderOrderDelivery(orderId);if(!raw)return null;await assertCommunityTierEntitlement(orderId,raw);return communityTierDelivery(raw);}
export async function builderBuyerCover(order:Record<string,unknown>,snapshot:BuilderDeliverySnapshot|null){
 let coverId=snapshot?.coverUploadId;
 if(!coverId&&!snapshot?.builderType){
  // A promotional cover grants no content access. For older purchases whose
  // publication version is no longer retained, use only the already-public
  // cover from a reviewed publication, never a workspace or private draft.
  const publication=await database().prepare('SELECT public_snapshot,content_snapshot FROM product_builder_publications WHERE product_id=? AND owner=? AND published_at IS NOT NULL').bind(order.product_id,order.owner).first();
  if(publication){
   const publicSnapshot=JSON.parse(String(publication.public_snapshot));
   if(publicSnapshot.hasCover===true){
    const candidate=builderPublishedPresentation(JSON.parse(String(publication.content_snapshot)),publicSnapshot).coverUploadId;
    const parsed=builderDeliverySnapshotSchema.shape.coverUploadId.safeParse(candidate);
    if(parsed.success)coverId=parsed.data;
   }
  }
 }
 if(!coverId)return null;
 const upload=await database().prepare(`SELECT * FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed'
  AND mime IN ('image/png','image/jpeg','image/webp') AND object_key NOT LIKE 'voice/%'
  AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)`).bind(coverId,order.product_id,order.owner).first();
 return upload&&/^[a-f0-9]{64}$/.test(String(upload.sha256||''))?upload:null;
}
export async function builderPrivateCover(order:Record<string,unknown>){
 const upload=await builderBuyerCover(order,await builderOrderDelivery(String(order.id)));
 if(!upload)throw new ApiError('Cover unavailable.',404);
 const object=await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.get(String(upload.object_key));
 if(!object)throw new ApiError('Cover unavailable.',404);
 if(object.size!==Number(upload.size)){await object.body.cancel().catch(()=>{});throw new ApiError('Cover unavailable.',404);}
 // Inspect actual bytes before streaming. HTML/SVG renamed to an image never
 // becomes an active response, even if stored MIME metadata is incorrect.
 const reader=object.body.getReader(),chunks:Uint8Array[]=[];let length=0,finished=false;
 while(length<12){const part=await reader.read();if(part.done){finished=true;break;}chunks.push(part.value);length+=part.value.byteLength;}
 const header=new Uint8Array(Math.min(length,12));let offset=0;
 for(const chunk of chunks){const count=Math.min(chunk.byteLength,header.length-offset);header.set(chunk.subarray(0,count),offset);offset+=count;if(offset===header.length)break;}
 const mime=String(upload.mime),matches=mime==='image/png'?header.length>=8&&[137,80,78,71,13,10,26,10].every((byte,index)=>header[index]===byte):mime==='image/jpeg'?header.length>=3&&header[0]===255&&header[1]===216&&header[2]===255:header.length>=12&&String.fromCharCode(...header.subarray(0,4))==='RIFF'&&String.fromCharCode(...header.subarray(8,12))==='WEBP';
 if(!matches){await reader.cancel().catch(()=>{});throw new ApiError('Cover unavailable.',404);}
 const body=new ReadableStream<Uint8Array>({
  async pull(controller){if(chunks.length){controller.enqueue(chunks.shift()!);return;}if(finished){controller.close();return;}try{const part=await reader.read();if(part.done)controller.close();else controller.enqueue(part.value);}catch(error){controller.error(error);}},
  cancel:reason=>reader.cancel(reason),
 });
 return new Response(body,{headers:{'Content-Type':mime,'Content-Length':String(upload.size),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin','Vary':'Cookie'}});
}
export async function verifyBuilderDelivery(product:{id:unknown;owner:unknown},snapshot:BuilderDeliverySnapshot,integrity=false){
 const designImages=snapshot.studio?.design?designImageIds(snapshot.studio.design):[];
 const ids=[...new Set([...snapshot.uploadIds,...designImages,...snapshot.sections.flatMap(section=>[section.videoId,section.studio?.audioId]).filter((id):id is string=>!!id)])];
 for(const id of ids){
  const upload=await database().prepare("SELECT * FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(id,product.id,product.owner).first();
  if(!upload||!/^[a-f0-9]{64}$/.test(String(upload.sha256||'')))throw new ApiError('A product file is unavailable or unverified. Upload it again before publishing or selling.',409);
  if(designImages.includes(id)&&(!['image/png','image/jpeg','image/webp'].includes(String(upload.mime))||Number(upload.size)>8_000_000))throw new ApiError('Use verified PNG, JPEG, or WebP design images up to 8 MB.',409);
  if(snapshot.sections.some(section=>section.videoId===id)&&!['video/mp4','video/webm'].includes(String(upload.mime)))throw new ApiError('Choose a completed MP4 or WebM recording for every video lesson.',409);
  if(snapshot.sections.some(section=>section.studio?.audioId===id)&&!String(upload.mime).startsWith('audio/'))throw new ApiError('Choose a completed audio file for every audio lesson.',409);
  const object=await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.get(String(upload.object_key));
  if(!object)throw new ApiError('A product file is unavailable. Upload it again before publishing or selling.',409);
  if(integrity){try{await verifyStoredUpload(object.body,Number(upload.size),String(upload.sha256));}catch{throw new ApiError('A product file failed its integrity check. Upload the original file again.',409);}}
  else {const correct=object.size===Number(upload.size);await object.body.cancel().catch(()=>{});if(!correct)throw new ApiError('A product file is incomplete. Upload the original file again.',409);}
 }
}
export async function builderDownloadMetadata(orderId:string,productId:string,owner:string){
 const raw=await builderOrderDelivery(orderId),snapshot=await builderBuyerDelivery(orderId);if(!snapshot)return [];
 const grants=await database().prepare('SELECT upload_id FROM product_builder_upload_grants WHERE order_id=?').bind(orderId).all(),ids=[...new Set([...snapshot.uploadIds,...grants.results.filter(row=>!raw||communityTierAllows(raw,'upload',String(row.upload_id))).map(row=>String(row.upload_id))])];
 if(!ids.length)return [];
 const result=await database().prepare(`SELECT id,name,mime,size FROM uploads WHERE id IN (${ids.map(()=>'?').join(',')}) AND product_id=? AND owner=? AND status='completed' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id) ORDER BY created_at,id`).bind(...ids,productId,owner).all();
 return result.results.map(row=>({id:String(row.id),name:String(row.name),mime:String(row.mime),size:Number(row.size)}));
}
export async function builderPrivateDownload(req:Request,order:Record<string,unknown>,uploadId:string){
 const raw=await builderOrderDelivery(String(order.id)),snapshot=await builderBuyerDelivery(String(order.id)),grant=await database().prepare('SELECT upload_id FROM product_builder_upload_grants WHERE order_id=? AND upload_id=?').bind(order.id,uploadId).first();if(!snapshot||raw&&!communityTierAllows(raw,'upload',uploadId)||!snapshot.uploadIds.includes(uploadId)&&!grant)throw new ApiError('File not found in this purchase.',404);
 const upload=await database().prepare("SELECT * FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(uploadId,order.product_id,order.owner).first();
 if(!upload)throw new ApiError('File unavailable. Contact your creator.',404);
 const object=await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.get(String(upload.object_key));if(!object||object.size!==Number(upload.size))throw new ApiError('File unavailable. Contact your creator.',404);
 const inline=new URL(req.url).searchParams.has('inline')&&['image/png','image/jpeg','image/webp'].includes(String(upload.mime));
 return new Response(object.body,{headers:{'Content-Type':inline?String(upload.mime):'application/octet-stream','Content-Length':String(upload.size),...(!inline?{'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(String(upload.name))}`}:{'Content-Security-Policy':"default-src 'none'; sandbox"}),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}
// The publication batch executes this statement after saving the public
// revision. Updates are additive, PDF-only, and require PDF access in the
// original purchased snapshot. New lesson modules and delivery families are
// never silently granted. Only paid customers at publication receive updates;
// a pending checkout keeps the exact offer originally reviewed by its buyer.
export function builderPdfUpdateGrantStatement(productId:string,owner:string,version:number,uploadIds:string[],family:string,createdAt:number,commitToken?:string){
 return database().prepare(`INSERT OR IGNORE INTO product_builder_upload_grants (order_id,upload_id,publication_version,created_at)
 SELECT s.order_id,u.id,?,? FROM product_builder_order_snapshots s JOIN commerce_orders o ON o.id=s.order_id
 JOIN uploads u ON u.product_id=s.product_id AND u.owner=o.owner
 WHERE s.product_id=? AND o.owner=? AND o.status='paid' AND json_extract(s.snapshot,'$.deliveryFamily')=?
 AND u.id IN (SELECT value FROM json_each(?)) AND u.mime='application/pdf' AND u.status='completed' AND u.sha256 IS NOT NULL AND u.object_key NOT LIKE 'voice/%'
 AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=u.id)
 AND EXISTS(SELECT 1 FROM json_each(s.snapshot,'$.uploadIds') original JOIN uploads original_file ON original_file.id=original.value WHERE original_file.product_id=s.product_id AND original_file.owner=o.owner AND original_file.mime='application/pdf' AND original_file.object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=original_file.id))
 AND EXISTS(SELECT 1 FROM product_builder_publications p WHERE p.product_id=s.product_id AND p.owner=o.owner AND p.version=? AND json_extract(p.content_snapshot,'$.deliveryFamily')=? AND u.id IN(SELECT value FROM json_each(p.upload_ids))${commitToken===undefined?'':' AND p.commit_token=?'})`).bind(version,createdAt,productId,owner,family,JSON.stringify(uploadIds),version,family,...(commitToken===undefined?[]:[commitToken]));
}
