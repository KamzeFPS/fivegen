import { env } from "cloudflare:workers";
import { ApiError,database,failure,identity,ownedProduct,sameOrigin } from "@/lib/server";
import { storageLimit,uploadLimit } from "@/lib/experience";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{const u=await identity(),{id}=await params;await ownedProduct(id,u.userId);const rows=await database().prepare("SELECT id,name,mime,size,created_at FROM uploads WHERE product_id=? AND owner=? AND status='completed' ORDER BY created_at DESC").bind(id,u.userId).all();return Response.json({uploads:rows.results});}catch(e){return failure(e);}}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  let uploadId="",key="";const bucket=(env as unknown as {BUCKET:R2Bucket}).BUCKET;
  try{
    sameOrigin(req);const u=await identity(),{id}=await params;await ownedProduct(id,u.userId);
    const mime=(req.headers.get("content-type")||"").split(";")[0],size=Number(req.headers.get("x-file-size")),name=(new URL(req.url).searchParams.get("name")||"Upload").slice(0,150);
    if(!["video/mp4","video/webm","application/pdf","image/jpeg","image/png","image/webp","text/plain","text/csv"].includes(mime))throw new ApiError("Upload an MP4, WebM, PDF, image, text or CSV file.");
    if(!Number.isSafeInteger(size)||size<1||size>uploadLimit||!req.body)throw new ApiError("Files must be between 1 byte and 100 MB.",413);
    if(!bucket)throw new ApiError("File storage is unavailable.",503);
    uploadId=crypto.randomUUID();key=`classes/${u.userId}/${id}/${uploadId}`;
    const reserve=await database().prepare("INSERT INTO uploads (id,owner,product_id,name,mime,size,object_key,status,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM uploads WHERE owner=?) + ? <= ?").bind(uploadId,u.userId,id,name,mime,size,key,"uploading",Date.now(),u.userId,size,storageLimit).run();
    if(!reserve.meta.changes)throw new ApiError("Your 2 GB upload allowance is full. Remove unused files to make space.",403);
    let received=0;
    const stream=req.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){received+=chunk.byteLength;if(received>size||received>uploadLimit)throw new Error("File exceeds the declared size.");controller.enqueue(chunk);},flush(){if(received!==size)throw new Error("The upload was interrupted. Retry the file.");}}));
    if(typeof FixedLengthStream!=='undefined'){
      const fixed=new FixedLengthStream(size);
      await Promise.all([stream.pipeTo(fixed.writable),bucket.put(key,fixed.readable,{httpMetadata:{contentType:mime}})]);
    }else await bucket.put(key,stream,{httpMetadata:{contentType:mime}});
    await database().prepare("UPDATE uploads SET status='completed' WHERE id=?").bind(uploadId).run();
    return Response.json({upload:{id:uploadId,name,mime,size}},{status:201});
  }catch(e){if(uploadId){if(key)await bucket?.delete(key).catch(()=>{});await database().prepare("DELETE FROM uploads WHERE id=? AND status='uploading'").bind(uploadId).run();}return failure(e);}
}
