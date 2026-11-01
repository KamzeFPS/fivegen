import {env} from 'cloudflare:workers';
import {ApiError,database} from './server';
import {customerOrder} from './commerce-v2-server';
import {builderBuyerDelivery} from './builder-delivery-server';
import {builderBuyerPresentation} from './builder-publication-contract';
import {parseBookBlocks} from './book-manuscript';
import {createStudioExport,studioExportMarkdown,type StudioExportAsset,type StudioExportDocument} from './product-studio-export';

export type BuyerBookExportFormat='pdf'|'epub'|'html';
const formats=new Set<BuyerBookExportFormat>(['pdf','epub','html']);
const raster=['image/png','image/jpeg','image/webp'];

/** Export only the version this customer purchased. Neither the current draft
 * nor the current public product is a fallback for missing purchased content. */
export async function exportBuyerBook(req:Request,orderId:string,format:string){
 if(!formats.has(format as BuyerBookExportFormat))throw new ApiError('Choose PDF, EPUB, or HTML for your download.');
 const order=await customerOrder(req,orderId),snapshot=await builderBuyerDelivery(orderId);
 const kind=snapshot&&builderBuyerPresentation(snapshot,snapshot.format).builderType;
 if(!snapshot||kind!=='book'&&kind!=='guide'&&kind!=='playbook')throw new ApiError('This purchase does not include a saved book, guide, or playbook.',404);
 if(!snapshot.sections.some(section=>section.body.trim()))throw new ApiError('This purchase does not include written content to export.',409);
 const grants=await database().prepare('SELECT upload_id FROM product_builder_upload_grants WHERE order_id=?').bind(orderId).all();
 const allowed=new Set([...snapshot.uploadIds,...grants.results.map(row=>String(row.upload_id))]);
 const load=async(uploadId:string,cover=false):Promise<StudioExportAsset>=>{
  if(cover?uploadId!==snapshot.coverUploadId:!allowed.has(uploadId))throw new ApiError('An image is not included in this purchase.',404);
  const row=await database().prepare("SELECT name,object_key,mime,size,sha256 FROM uploads WHERE id=? AND owner=? AND product_id=? AND status='completed' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(uploadId,order.owner,order.product_id).first();
  if(!row||!raster.includes(String(row.mime))||Number(row.size)<=0||Number(row.size)>8_000_000||!/^[a-f0-9]{64}$/.test(String(row.sha256)))throw new ApiError('An image in this purchase is unavailable or could not be verified. Contact the creator.',409);
  const object=await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.get(String(row.object_key));
  if(!object||object.size!==Number(row.size)){await object?.body.cancel().catch(()=>{});throw new ApiError('An image in this purchase is incomplete. Contact the creator.',409);}
  const bytes=new Uint8Array(await new Response(object.body).arrayBuffer()),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  if(Array.from(digest,value=>value.toString(16).padStart(2,'0')).join('')!==String(row.sha256))throw new ApiError('An image in this purchase failed its integrity check. Contact the creator.',409);
  const signature=row.mime==='image/png'?bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value):row.mime==='image/jpeg'?bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.length>=12&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP';
  if(!signature)throw new ApiError('An image in this purchase has invalid image data. Contact the creator.',409);
  return {name:String(row.name),mime:String(row.mime),bytes};
 };
 const document:StudioExportDocument={title:snapshot.title,description:snapshot.description,audience:'',language:'en',subtitle:String(snapshot.studio?.basics?.subtitle||''),writing:snapshot.studio?.writing,guide:snapshot.studio?.guide,playbook:snapshot.studio?.playbook,sections:snapshot.sections,files:snapshot.files,originals:[],images:{},license:String(snapshot.studio?.playbook?.licenseTerms||snapshot.studio?.templates?.licenseTerms||snapshot.studio?.templates?.license||''),usageInstructions:snapshot.usageInstructions};
 const references=new Set(parseBookBlocks(studioExportMarkdown(document).replaceAll('/api/uploads/','upload:')).flatMap(block=>block.image?[block.image.uploadId]:[]));
 if(references.size>20)throw new ApiError('Document downloads support up to 20 inline images.',413);
 let total=0;for(const reference of references){const asset=await load(reference);total+=asset.bytes.length;if(total>24_000_000)throw new ApiError('Document images exceed the combined download size limit.',413);document.images[reference]=asset;}
 if(snapshot.coverUploadId)document.cover=await load(snapshot.coverUploadId,true);
 const result=await createStudioExport(document,format as BuyerBookExportFormat);
 return new Response(result.bytes.slice().buffer as ArrayBuffer,{headers:{'Content-Type':result.mime,'Content-Disposition':`attachment; filename="${kind}.${result.extension}"`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",'Vary':'Cookie'}});
}
