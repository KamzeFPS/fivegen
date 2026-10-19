import {env} from 'cloudflare:workers';
import {failure,identity,database} from '@/lib/server';
import {getBuilderWorkspace} from '@/lib/product-builder-server';
import {productHtml} from '@/lib/export';
import {builderFamily} from '@/lib/builder-contract';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{
 const user=await identity(),{id}=await params,workspace=await getBuilderWorkspace(id,user.userId),{draft,product}=workspace;
 let coverDataUrl:string|undefined;
 if(draft.coverUploadId){
  const row=await database().prepare("SELECT object_key,mime,size,sha256 FROM uploads WHERE id=? AND owner=? AND product_id=? AND status='completed' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(draft.coverUploadId,user.userId,id).first();
  if(row&&['image/png','image/jpeg','image/webp'].includes(String(row.mime))&&Number(row.size)>0&&Number(row.size)<=8_000_000&&/^[a-f0-9]{64}$/.test(String(row.sha256))){
   const object=await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.get(String(row.object_key));
   if(object){if(object.size!==Number(row.size))await object.body.cancel().catch(()=>{});else{
    const bytes=new Uint8Array(await new Response(object.body).arrayBuffer()),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    if(Array.from(hash,value=>value.toString(16).padStart(2,'0')).join('')===String(row.sha256)){
     let binary='';for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
     coverDataUrl=`data:${String(row.mime)};base64,${btoa(binary)}`;
    }
   }}
  }
 }
 const family=builderFamily(draft),html=productHtml({...product,title:draft.title,description:draft.description,audience:draft.audience,language:draft.language,content:{sections:draft.sections,files:draft.files,benefits:[],launch:''}},{
  subtitle:draft.fields.subtitle,coverDataUrl,
  originalFiles:draft.uploadIds.flatMap(uploadId=>{const upload=workspace.uploads.find(file=>file.id===uploadId);return upload?[{name:upload.name}]:[];}),
  ...(family==='service'?{serviceScope:draft.fields.serviceScope,preparation:draft.fields.preparation}:{}),
  ...(family==='community'?{welcome:draft.fields.welcome,rules:draft.fields.rules}:{}),
  ...(family==='templates'?{usageInstructions:draft.fields.usageInstructions}:{}),
 });
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="${product.slug}.html"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
}catch(error){return failure(error);}}
