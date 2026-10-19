import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {ApiError,database,failure} from '@/lib/server';

export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}){try{
 const {slug}=await params;
 const publication=await database().prepare('SELECT product_id,owner,public_snapshot,content_snapshot FROM product_builder_publications WHERE slug=? AND published_at IS NOT NULL').bind(slug).first();
 if(!publication||JSON.parse(String(publication.public_snapshot)).hasCover!==true)throw new ApiError('Cover unavailable.',404);
 // Resolve only the reviewed publication. Private draft changes never change
 // this image, and no original file IDs are exposed in public page metadata.
 const id=z.string().uuid().safeParse(JSON.parse(String(publication.content_snapshot)).draft?.coverUploadId);
 if(!id.success)throw new ApiError('Cover unavailable.',404);
 const upload=await database().prepare("SELECT * FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND mime IN ('image/png','image/jpeg','image/webp') AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(id.data,publication.product_id,publication.owner).first();
 if(!upload||!/^[a-f0-9]{64}$/.test(String(upload.sha256||'')))throw new ApiError('Cover unavailable.',404);
 const object=await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.get(String(upload.object_key));
 if(!object)throw new ApiError('Cover unavailable.',404);
 if(object.size!==Number(upload.size)){await object.body.cancel().catch(()=>{});throw new ApiError('Cover unavailable.',404);}
 return new Response(object.body,{headers:{'Content-Type':String(upload.mime),'Content-Length':String(upload.size),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}catch(error){const response=failure(error);response.headers.set('Cache-Control','private, no-store');return response;}}
