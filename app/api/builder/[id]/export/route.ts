import {env} from 'cloudflare:workers';
import {ApiError,failure,identity,database} from '@/lib/server';
import {getBuilderWorkspace} from '@/lib/product-builder-server';
import {productHtml} from '@/lib/export';
import {builderFamily} from '@/lib/builder-contract';
import {createStudioExport,studioExportMarkdown,type StudioExportAsset,type StudioExportFormat,type StudioExportDocument} from '@/lib/product-studio-export';
import {parseBookBlocks} from '@/lib/book-manuscript';
import {ProductDocumentError} from '@/lib/product-document-archive';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const user=await identity(),{id}=await params,workspace=await getBuilderWorkspace(id,user.userId),{draft,product}=workspace;
 const format=new URL(req.url).searchParams.get('format');
 if(format&&!['html','pdf','epub','markdown','zip'].includes(format))throw new ApiError('Choose PDF, EPUB, HTML, Markdown, or ZIP. EPUB is suitable for Kindle conversion; MOBI export is not available.');
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
 if(format){
  const document:StudioExportDocument={title:draft.title,description:draft.description,audience:draft.audience,language:draft.language,subtitle:String(draft.studio?.basics?.subtitle||draft.fields.subtitle||''),writing:draft.studio?.writing,guide:draft.studio?.guide,playbook:draft.studio?.playbook,templates:draft.studio?.templates,originalFileNames:workspace.uploads.filter(file=>draft.uploadIds.includes(file.id)&&file.status==='completed').map(file=>({id:file.id,name:file.name})),sections:draft.sections,files:draft.files,originals:[],images:{},license:String(draft.studio?.playbook?.licenseTerms||draft.studio?.templates?.licenseTerms||draft.studio?.templates?.license||''),usageInstructions:draft.fields.usageInstructions||''};
  const load=async(uploadId:string):Promise<StudioExportAsset>=>{
   const row=await database().prepare("SELECT name,object_key,mime,size,sha256 FROM uploads WHERE id=? AND owner=? AND product_id=? AND status='completed' AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(uploadId,user.userId,id).first();
   if(!row||Number(row.size)>100*1024*1024||!/^[a-f0-9]{64}$/.test(String(row.sha256)))throw new ApiError('An export resource is unavailable or could not be verified. Reattach the original file.',409);
   const object=await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.get(String(row.object_key));
   if(!object||object.size!==Number(row.size)){await object?.body.cancel().catch(()=>{});throw new ApiError('An export resource is incomplete. Upload the original file again.',409);}
   const bytes=new Uint8Array(await new Response(object.body).arrayBuffer()),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
   if(Array.from(hash,part=>part.toString(16).padStart(2,'0')).join('')!==String(row.sha256))throw new ApiError('An export resource failed its integrity check. Reattach the original file.',409);
   return {name:String(row.name),mime:String(row.mime),bytes};
  };
  // Collect exactly the image references this document renderer will use,
  // including Guide examples/help and Playbook node notes. Private ownership,
  // product binding, source exclusions, integrity and byte limits stay below.
  const references=new Set(parseBookBlocks(studioExportMarkdown(document).replaceAll('/api/uploads/','upload:')).flatMap(block=>block.image?[block.image.uploadId]:[]));
  if(references.size>20)throw new ApiError('Document exports support up to 20 inline images.',413);
  const images:Record<string,StudioExportAsset>={};
  let imageBytes=0;for(const reference of references){const asset=await load(reference);imageBytes+=asset.bytes.length;if(!['image/png','image/jpeg','image/webp'].includes(asset.mime))throw new ApiError('An inline image must be PNG, JPEG, or WebP.',409);if(asset.bytes.length>8_000_000||imageBytes>24_000_000)throw new ApiError('Use inline images up to 8 MB each and 24 MB combined for document exports.',413);images[reference]=asset;}
  let cover:StudioExportAsset|undefined;if(draft.coverUploadId){cover=await load(draft.coverUploadId);if(cover.bytes.length>8_000_000)throw new ApiError('Use a cover image up to 8 MB for document exports.',413);}
  const originals:StudioExportAsset[]=[];
  if(format==='zip'){
   const total=draft.uploadIds.reduce((sum,uploadId)=>sum+(workspace.uploads.find(upload=>upload.id===uploadId)?.size||0),0);
   if(total>100*1024*1024)throw new ApiError('ZIP packages support up to 100 MB of original files. Download larger resources individually.',413);
   for(const uploadId of draft.uploadIds)originals.push(await load(uploadId));
  }
  const result=await createStudioExport({...document,originals,images,cover},format as StudioExportFormat);
  return new Response(result.bytes.slice().buffer as ArrayBuffer,{headers:{'Content-Type':result.mime,'Content-Disposition':`attachment; filename="${product.slug}.${result.extension}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"}});
 }
 const family=builderFamily(draft),html=productHtml({...product,title:draft.title,description:draft.description,audience:draft.audience,language:draft.language,content:{sections:draft.sections,files:draft.files,benefits:[],launch:''}},{
  subtitle:draft.fields.subtitle,coverDataUrl,
  originalFiles:draft.uploadIds.flatMap(uploadId=>{const upload=workspace.uploads.find(file=>file.id===uploadId);return upload?[{name:upload.name}]:[];}),
  ...(family==='service'?{serviceScope:draft.fields.serviceScope,preparation:draft.fields.preparation}:{}),
  ...(family==='community'?{welcome:draft.fields.welcome,rules:draft.fields.rules}:{}),
  ...(family==='templates'?{usageInstructions:draft.fields.usageInstructions}:{}),
 });
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="${product.slug}.html"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
}catch(error){return failure(error instanceof ProductDocumentError?new ApiError(error.message,error.status):error);}}
