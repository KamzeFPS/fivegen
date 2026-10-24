import {database,failure,ApiError} from '@/lib/server';
import {env} from 'cloudflare:workers';
export async function GET(_req:Request,{params}:{params:Promise<{slug:string;id:string}>}){
 try{
  const {slug,id}=await params;if(!/^[a-f0-9-]{36}$/i.test(id))throw new ApiError('Preview unavailable.',404);
  const publication=await database().prepare('SELECT product_id,owner,public_snapshot,content_snapshot FROM product_builder_publications WHERE slug=? AND published_at IS NOT NULL').bind(slug).first();if(!publication)throw new ApiError('Preview unavailable.',404);
  const publicData=JSON.parse(String(publication.public_snapshot)),content=JSON.parse(String(publication.content_snapshot)),items=publicData.studio?.templates?.items as {imageUrl?:string}[]|undefined;
  const refs=[`/api/uploads/${id}`,`upload:${id}`];if(!items?.some(item=>refs.includes(item.imageUrl||''))||!content.studio?.templates?.items?.some((item:{imageUrl?:string})=>refs.includes(item.imageUrl||'')))throw new ApiError('Preview unavailable.',404);
  const file=await database().prepare("SELECT * FROM uploads WHERE id=? AND owner=? AND product_id=? AND status='completed' AND mime IN ('image/png','image/jpeg','image/webp') AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(id,publication.owner,publication.product_id).first();if(!file||Number(file.size)>8*1024*1024||!/^[a-f0-9]{64}$/.test(String(file.sha256||'')))throw new ApiError('Preview unavailable.',404);
  const object=await (env as unknown as {BUCKET:R2Bucket}).BUCKET.get(String(file.object_key));if(!object||object.size!==Number(file.size))throw new ApiError('Preview unavailable.',404);const bytes=new Uint8Array(await new Response(object.body).arrayBuffer()),mime=String(file.mime),header=new TextDecoder().decode(bytes.subarray(0,12));
  const matches=mime==='image/png'?bytes[0]===137&&header.slice(1,4)==='PNG':mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:header.startsWith('RIFF')&&header.slice(8)==='WEBP';const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');if(!matches||hash!==file.sha256)throw new ApiError('Preview unavailable.',404);
  return new Response(bytes,{headers:{'Content-Type':mime,'Content-Length':String(bytes.length),'Cache-Control':'public, max-age=300','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
 }catch(error){return failure(error);}
}

