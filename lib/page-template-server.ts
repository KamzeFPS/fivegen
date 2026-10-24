import {env} from 'cloudflare:workers';
import {z} from 'zod';
import { database, ownedProduct, ApiError } from './server';
import {storageLimit} from './experience';
import { pageBrandPresetSchema, pageBrandSchema, productPageConfigSchema,productPageLinkSchema,type PageBrandPreset } from './product-page';
const eligibleIcon="id=? AND product_id=? AND owner=? AND status='completed' AND mime IN ('image/jpeg','image/png','image/webp') AND size BETWEEN 1 AND 10485760 AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)";
async function sourceIcon(id:string,productId:string,owner:string){await ownedProduct(productId,owner);const row=await database().prepare('SELECT * FROM uploads WHERE '+eligibleIcon).bind(id,productId,owner).first();if(!row)throw new ApiError('Choose a completed product-owned JPEG, PNG or WebP icon up to 10 MB. Private voice files cannot be used as brand assets.',409);return row;}
export async function getBrandPresets(owner: string):Promise<PageBrandPreset[]> {
  const rows = await database().prepare('SELECT id,name,brand,source_product_id,icon_upload_id,links,updated_at FROM page_brand_presets WHERE owner=? ORDER BY updated_at DESC LIMIT 20').bind(owner).all();
  return rows.results.map(row => ({ id: String(row.id), name: String(row.name), brand: pageBrandSchema.parse(JSON.parse(String(row.brand))),sourceProductId:row.source_product_id==null?null:String(row.source_product_id),iconUploadId:row.icon_upload_id==null?null:String(row.icon_upload_id),links:z.array(productPageLinkSchema).max(8).parse(JSON.parse(String(row.links||'[]'))), updatedAt: Number(row.updated_at) }));
}
export async function saveBrandPreset(owner: string, input: unknown) {
  const value = pageBrandPresetSchema.parse(input);
  if(value.iconUploadId){if(!value.sourceProductId)throw new ApiError('Choose the product that owns this brand icon.');await sourceIcon(value.iconUploadId,value.sourceProductId,owner);}
  const count = await database().prepare('SELECT COUNT(*) AS n FROM page_brand_presets WHERE owner=?').bind(owner).first();
  if (Number(count?.n) >= 20) throw new ApiError('Your brand library has 20 presets. Use an existing preset before adding more.', 409);
  const inserted = await database().prepare('INSERT INTO page_brand_presets(id,owner,name,brand,source_product_id,icon_upload_id,links,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM page_brand_presets WHERE owner=?)<20').bind(crypto.randomUUID(), owner, value.name, JSON.stringify(value.brand),value.sourceProductId,value.iconUploadId,JSON.stringify(value.links), Date.now(), owner).run();
  if (!inserted.meta.changes) throw new ApiError('Your brand library has 20 presets. Use an existing preset before adding more.', 409);
  return getBrandPresets(owner);
}
const applySchema=z.object({presetId:z.string().uuid(),base:productPageConfigSchema,affected:z.object({brand:z.boolean(),icon:z.boolean(),links:z.boolean()}).strict()}).strict();
async function copyBrandIcon(source:Record<string,unknown>,productId:string,owner:string){
 const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;if(!bucket)throw new ApiError('File storage is unavailable. Your page draft is unchanged.',503);
 const object=await bucket.get(String(source.object_key));if(!object||object.size!==Number(source.size))throw new ApiError('This saved brand icon is unavailable. Choose or upload the original again.',409);
 const bytes=new Uint8Array(await new Response(object.body).arrayBuffer());if(bytes.length!==Number(source.size)||bytes.length>10*1024*1024)throw new ApiError('The brand icon could not be verified. Upload the original again.',409);
 const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end)),valid=source.mime==='image/png'?[137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte):source.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';if(!valid)throw new ApiError('This brand icon does not match its image type. Choose a valid original.',409);
 const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');if(source.sha256&&String(source.sha256)!==checksum)throw new ApiError('The brand icon no longer matches its verified file. Upload the original again.',409);
 const id=crypto.randomUUID(),key=`classes/${owner}/${productId}/${id}`,now=Date.now(),name=String(source.name).replace(/[\x00-\x1f\x7f/\\]/g,'').slice(0,150)||'Brand icon';
 const reserved=await database().prepare("INSERT INTO uploads(id,owner,product_id,name,mime,size,object_key,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,'uploading',?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?) AND (SELECT COALESCE(SUM(size),0) FROM uploads WHERE owner=? AND status!='failed')+?<=?").bind(id,owner,productId,name,source.mime,bytes.length,key,now,now,productId,owner,owner,bytes.length,storageLimit).run();if(!reserved.meta.changes)throw new ApiError('Your upload allowance is full. Keep the current icon or remove unused files before copying this one.',403);
 try{await bucket.put(key,bytes,{httpMetadata:{contentType:String(source.mime)}});const copied=await bucket.get(key);if(!copied||copied.size!==bytes.length)throw new Error('Copy unavailable');const stored=new Uint8Array(await new Response(copied.body).arrayBuffer()),actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',stored))].map(byte=>byte.toString(16).padStart(2,'0')).join('');if(actual!==checksum)throw new Error('Copy integrity check failed');const complete=await database().prepare("UPDATE uploads SET status='completed',sha256=?,updated_at=? WHERE id=? AND owner=? AND product_id=? AND status='uploading'").bind(checksum,Date.now(),id,owner,productId).run();if(!complete.meta.changes)throw new Error('Copy changed');return id;
 }catch{await bucket.delete(key).catch(()=>{});await database().prepare("UPDATE uploads SET status='failed',validation_error='The brand icon could not be copied. Retry with the original image.',updated_at=? WHERE id=? AND owner=? AND product_id=?").bind(Date.now(),id,owner,productId).run();throw new ApiError('The brand icon could not be copied. Your saved page is unchanged.',503);}
}
/** Returns a local draft patch. Publication and persisted-page CAS remain in the ordinary Save action. */
export async function applyBrandPreset(productId:string,owner:string,input:unknown){await ownedProduct(productId,owner);const value=applySchema.parse(input),presets=await getBrandPresets(owner),preset=presets.find(item=>item.id===value.presetId);if(!preset)throw new ApiError('This brand preset is unavailable.',404);const config={...value.base};
 if(value.affected.brand)config.brand={...preset.brand};if(value.affected.links)config.links=preset.links.map(link=>({...link}));
 if(value.affected.icon){if(!preset.iconUploadId||!preset.sourceProductId)throw new ApiError('This preset has no saved icon. Preserve the current icon or choose another preset.',409);const source=await sourceIcon(preset.iconUploadId,preset.sourceProductId,owner);config.iconUploadId=await copyBrandIcon(source,productId,owner);}
 return {config:productPageConfigSchema.parse(config),persisted:false,notice:'Selected brand settings are applied to this local page draft. Your other settings and public page are unchanged. Review, then Save draft.'};}
export async function getPageRevisions(productId: string, owner: string) {
  await ownedProduct(productId, owner);
  const rows = await database().prepare('SELECT id,config,created_at FROM product_page_revisions WHERE product_id=? AND owner=? ORDER BY created_at DESC LIMIT 30').bind(productId, owner).all();
  return rows.results.map(row => ({ id: String(row.id), config: productPageConfigSchema.parse(JSON.parse(String(row.config))), createdAt: Number(row.created_at) }));
}
