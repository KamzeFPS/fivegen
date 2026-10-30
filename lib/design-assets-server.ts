import {env} from 'cloudflare:workers';
import {ApiError,database} from './server';
import {designImageIds,type DesignDocument} from './design-document';

/** Resolve only immutable document references; never load URLs or draft assets. */
export async function verifiedDesignAssets(document:DesignDocument,productId:string,owner:string){
 const ids=designImageIds(document);if(ids.length>20)throw new ApiError('Design exports support up to 20 images.',413);
 const images:Record<string,{mime:string;bytes:Uint8Array}>={};let total=0;
 for(const id of ids){
  const row=await database().prepare("SELECT object_key,mime,size,sha256 FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(id,productId,owner).first();
  if(!row||!['image/png','image/jpeg','image/webp'].includes(String(row.mime))||Number(row.size)<=0||Number(row.size)>8_000_000||!/^[a-f0-9]{64}$/.test(String(row.sha256)))throw new ApiError('A design image is unavailable or unverified. Ask the creator to replace it.',409);
  total+=Number(row.size);if(total>24_000_000)throw new ApiError('Design exports support up to 24 MB of images combined.',413);
  const object=await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.get(String(row.object_key));
  if(!object||object.size!==Number(row.size)){await object?.body.cancel().catch(()=>{});throw new ApiError('A design image is incomplete. Ask the creator to replace it.',409);}
  const bytes=new Uint8Array(await new Response(object.body).arrayBuffer()),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  if(Array.from(hash,part=>part.toString(16).padStart(2,'0')).join('')!==String(row.sha256))throw new ApiError('A design image failed its integrity check.',409);
  const mime=String(row.mime),png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((part,index)=>bytes[index]===part),jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=bytes.length>=12&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP';
  if(!(mime==='image/png'?png:mime==='image/jpeg'?jpeg:webp))throw new ApiError('A design image does not match its verified file type.',409);
  images[id]={mime,bytes};
 }
 return images;
}
