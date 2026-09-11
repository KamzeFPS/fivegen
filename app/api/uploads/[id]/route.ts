import { env } from "cloudflare:workers";
import { ApiError,database,failure,identity,ownedProduct,sameOrigin } from "@/lib/server";
import { productAccess } from "@/lib/access";

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params,a=await database().prepare("SELECT * FROM uploads WHERE id=? AND status='completed'").bind(id).first();if(!a)throw new ApiError("File not found.",404);
 const p=await database().prepare("SELECT * FROM products WHERE id=?").bind(a.product_id).first();if(!p)throw new ApiError("Product not found.",404);
 const q=new URL(req.url).searchParams;
 const funnel=JSON.parse(String(p.commerce||"{}")).funnel;
 const publicVideo=p.status==="published"&&funnel?.enabled&&String(a.mime).startsWith('video/')&&funnel.blocks?.some((b:any)=>b.visible&&b.kind==="video"&&b.image===`/api/uploads/${id}`);
 if(!publicVideo)await productAccess(p,q.get("token")||undefined);
 const bucket=(env as unknown as {BUCKET:R2Bucket}).BUCKET,size=Number(a.size);let range:{offset:number;length:number}|undefined;
 if(req.headers.has("range")){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range")!);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{"Content-Range":`bytes */${size}`}});const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2])),end=m[1]?(m[2]?Number(m[2]):size-1):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return new Response(null,{status:416,headers:{"Content-Range":`bytes */${size}`}});range={offset:start,length:Math.min(end,size-1)-start+1};}
 const obj=await bucket?.get(String(a.object_key),range?{range}:undefined);if(!obj)throw new ApiError("File is unavailable.",404);
 return new Response(obj.body,{status:range?206:200,headers:{"Content-Type":String(a.mime),"Content-Length":String(range?.length||size),"Accept-Ranges":"bytes","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",...(range?{"Content-Range":`bytes ${range.offset}-${range.offset+range.length-1}/${size}`} : {}),...(q.has("download")?{"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(String(a.name))}`}:{})}});
}catch(e){return failure(e);}}
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const u=await identity(),{id}=await params,a=await database().prepare("SELECT * FROM uploads WHERE id=? AND owner=?").bind(id,u.userId).first();if(!a)throw new ApiError("File not found.",404);const p=await ownedProduct(String(a.product_id),u.userId);if([p.content,p.commerce,p.experience].some(v=>String(v).includes(id)))throw new ApiError("Remove this file from your lessons or funnel and save before deleting it.",409);await (env as unknown as {BUCKET:R2Bucket}).BUCKET.delete(String(a.object_key));await database().prepare("DELETE FROM uploads WHERE id=? AND owner=?").bind(id,u.userId).run();return Response.json({deleted:true});}catch(e){return failure(e);}}
