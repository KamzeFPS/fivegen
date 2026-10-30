import { env } from "cloudflare:workers";
import { ApiError,database,failure,identity,ownedProduct,sameOrigin } from "@/lib/server";
import { productAccess } from "@/lib/access";
import {fileSaleUploadAllowed} from '@/lib/file-sales';

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params,a=await database().prepare("SELECT * FROM uploads WHERE id=? AND status='completed'").bind(id).first();if(!a)throw new ApiError("File not found.",404);
 const p=await database().prepare("SELECT * FROM products WHERE id=?").bind(a.product_id).first();
 const voiceOnly=String(a.object_key).startsWith("voice/")||await database().prepare("SELECT id FROM creator_voice_sources WHERE upload_id=? LIMIT 1").bind(id).first();
 const designArtwork=String(a.object_key).startsWith('design-images/');
 const retainedBrand=!p&&await database().prepare('SELECT id FROM page_brand_presets WHERE icon_upload_id=? AND owner=? LIMIT 1').bind(id,a.owner).first();
 // Private source recordings and generated design originals stay owner-only.
 // Buyer design exports resolve only entitled snapshot assets internally.
 if(voiceOnly||retainedBrand||designArtwork){const user=await identity();if(user.userId!==a.owner)throw new ApiError("File not found.",404);}
 else {
   if(!p)throw new ApiError("Product not found.",404);
   const funnel=JSON.parse(String(p.commerce||"{}")).funnel;
   const publicVideo=p.status==="published"&&funnel?.enabled&&String(a.mime).startsWith('video/')&&funnel.blocks?.some((b:{visible?:boolean;kind?:string;image?:string})=>b.visible&&b.kind==="video"&&b.image===`/api/uploads/${id}`);
   const q=new URL(req.url).searchParams;
   const saleAccess=await fileSaleUploadAllowed(p,id,q.get('token')||undefined);
   if(saleAccess===false)throw new ApiError('This file is not included in your purchased access.',403);
   if(saleAccess===null&&!publicVideo)await productAccess(p,q.get("token")||undefined);
 }
 const q=new URL(req.url).searchParams;
 const bucket=(env as unknown as {BUCKET:R2Bucket}).BUCKET,size=Number(a.size);let range:{offset:number;length:number}|undefined;
 if(req.headers.has("range")){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range")!);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{"Content-Range":`bytes */${size}`}});const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2])),end=m[1]?(m[2]?Number(m[2]):size-1):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return new Response(null,{status:416,headers:{"Content-Range":`bytes */${size}`}});range={offset:start,length:Math.min(end,size-1)-start+1};}
 const obj=await bucket?.get(String(a.object_key),range?{range}:undefined);if(!obj)throw new ApiError("File is unavailable.",404);
 const preview=/^(?:image\/(?:png|jpeg|webp)|audio\/|video\/)/.test(String(a.mime))||a.mime==='application/pdf';
 return new Response(obj.body,{status:range?206:200,headers:{"Content-Type":preview?String(a.mime):'application/octet-stream',"Content-Length":String(range?.length||size),"Accept-Ranges":"bytes","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",...(!preview?{'Content-Security-Policy':"sandbox; default-src 'none'"}:{}),...(range?{"Content-Range":`bytes ${range.offset}-${range.offset+range.length-1}/${size}`} : {}),...(q.has("download")||!preview?{"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(String(a.name))}`}:{})}});
}catch(e){return failure(e);}}
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const u=await identity(),{id}=await params,a=await database().prepare("SELECT * FROM uploads WHERE id=? AND owner=?").bind(id,u.userId).first();if(!a)throw new ApiError("File not found.",404);
 const source=await database().prepare('SELECT id FROM creator_voice_sources WHERE upload_id=? LIMIT 1').bind(id).first();
 if(source)throw new ApiError('Remove this recording from your Creator Library source before deleting the original file.',409);
 if(await database().prepare('SELECT id FROM page_brand_presets WHERE icon_upload_id=? LIMIT 1').bind(id).first())throw new ApiError('Remove this image from your saved brand presets before deleting the original file.',409);
 const product=await database().prepare('SELECT * FROM products WHERE id=? AND owner=?').bind(a.product_id,u.userId).first();
 if(!product){await (env as unknown as {BUCKET:R2Bucket}).BUCKET.delete(String(a.object_key));await database().prepare('DELETE FROM uploads WHERE id=? AND owner=?').bind(id,u.userId).run();return Response.json({deleted:true});}
 const p=await ownedProduct(String(a.product_id),u.userId);
 // File-sale assets are immutable retained objects. Detach from a draft rather
 // than race a publication or erase a historical paid version.
 if(await database().prepare('SELECT product_id FROM file_sale_drafts WHERE product_id=?').bind(p.id).first())throw new ApiError('Remove this file from the draft feature instead. Stored versions are retained to protect buyer access.',409);
 if(await database().prepare('SELECT product_id FROM product_builder_workspaces WHERE product_id=?').bind(p.id).first())throw new ApiError('Remove this file from the builder instead. Stored versions are retained to protect published pages and purchased content.',409);
 if([p.content,p.commerce,p.experience].some(v=>String(v).includes(id)))throw new ApiError("Remove this file from your lessons or funnel and save before deleting it.",409);
 const published=await database().prepare("SELECT product_id FROM growth_funnels WHERE creator_vsl_upload_id=? AND owner=? AND published_at IS NOT NULL").bind(id,u.userId).first();
 if(published)throw new ApiError("Remove this recording from the published funnel and publish the update before deleting it.",409);
 const productPage=await database().prepare("SELECT product_id FROM product_pages WHERE product_id=? AND owner=? AND (json_extract(draft,'$.iconUploadId')=? OR json_extract(draft,'$.bannerUploadId')=? OR json_extract(published,'$.iconUploadId')=? OR json_extract(published,'$.bannerUploadId')=? OR EXISTS(SELECT 1 FROM json_each(draft,'$.sections') WHERE json_extract(value,'$.imageUploadId')=?) OR EXISTS(SELECT 1 FROM json_each(published,'$.sections') WHERE json_extract(value,'$.imageUploadId')=?))").bind(a.product_id,u.userId,id,id,id,id,id,id).first();
 const sharedPage=await database().prepare("SELECT id FROM public_page_records WHERE product_id=? AND owner=? AND (instr(draft,?)>0 OR instr(COALESCE(published,''),?)>0) UNION ALL SELECT product_id AS id FROM product_pages WHERE product_id=? AND owner=? AND (instr(draft,?)>0 OR instr(COALESCE(published,''),?)>0) LIMIT 1").bind(a.product_id,u.userId,id,id,a.product_id,u.userId,id,id).first();
 if(sharedPage)throw new ApiError("Remove this recording or image from every page draft and publication before deleting it.",409);
 if(productPage)throw new ApiError("Remove this image from your product page draft and published page before deleting it.",409);
 await (env as unknown as {BUCKET:R2Bucket}).BUCKET.delete(String(a.object_key));await database().prepare("DELETE FROM uploads WHERE id=? AND owner=?").bind(id,u.userId).run();return Response.json({deleted:true});}catch(e){return failure(e);}}
