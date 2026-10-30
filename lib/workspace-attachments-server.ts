import {env} from 'cloudflare:workers';
import {createRequire} from 'node:module';
import {z} from 'zod';
import {ApiError,database} from './server';
import {importProductDocument} from './product-document-import';
import {ProductDocumentError} from './product-document-archive';
import {workspaceAttachmentLimits,workspaceAttachmentSchema,workspaceAttachmentIdsSchema,type WorkspaceAttachment} from './workspace-attachments';
import type {TextGenerationImage} from './ai';

type AttachmentRow=Record<string,unknown>;
const encoder=new TextEncoder();
function bucket(){const result=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;if(!result)throw new ApiError('Private file storage is temporarily unavailable.',503);return result;}
async function digest(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))).map(value=>value.toString(16).padStart(2,'0')).join('');}
function excerpt(value:string,limit=24000){const bytes=encoder.encode(value);if(bytes.length<=limit)return value;return new TextDecoder().decode(bytes.subarray(0,limit-30)).replace(/\ufffd$/,'')+'\n[Source excerpt truncated]';}
function metadata(row:AttachmentRow):WorkspaceAttachment{return workspaceAttachmentSchema.parse({id:row.id,name:row.name,mime:row.mime,size:Number(row.size),sha256:row.sha256,kind:row.kind,warnings:JSON.parse(String(row.warnings))});}

/** Check raster geometry before native decoding can allocate the pixel buffer. */
function dimensions(bytes:Uint8Array,mime:string):{width:number;height:number}|undefined{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(mime==='image/png'&&bytes.length>=24&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value)&&Buffer.from(bytes.subarray(12,16)).toString()==='IHDR')return {width:view.getUint32(16),height:view.getUint32(20)};
 if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255){let offset=2;while(offset+4<=bytes.length){if(bytes[offset++]!==255)return;while(offset<bytes.length&&bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)return;if(marker===1||marker>=208&&marker<=215)continue;if(offset+2>bytes.length)return;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)return;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8)return {width:view.getUint16(offset+5),height:view.getUint16(offset+3)};offset+=length;}}
 if(mime==='image/webp'&&bytes.length>=12&&Buffer.from(bytes.subarray(0,4)).toString()==='RIFF'&&Buffer.from(bytes.subarray(8,12)).toString()==='WEBP'){let offset=12;const uint24=(start:number)=>bytes[start]+bytes[start+1]*256+bytes[start+2]*65536;while(offset+8<=bytes.length){const name=Buffer.from(bytes.subarray(offset,offset+4)).toString(),length=view.getUint32(offset+4,true),start=offset+8;if(start+length>bytes.length)return;if(name==='VP8X'&&length>=10)return {width:uint24(start+4)+1,height:uint24(start+7)+1};if(name==='VP8L'&&length>=5&&bytes[start]===47)return {width:1+bytes[start+1]+((bytes[start+2]&63)<<8),height:1+(bytes[start+2]>>6)+(bytes[start+3]<<2)+((bytes[start+4]&15)<<10)};if(name==='VP8 '&&length>=10&&bytes[start+3]===157&&bytes[start+4]===1&&bytes[start+5]===42)return {width:view.getUint16(start+6,true)&16383,height:view.getUint16(start+8,true)&16383};offset=start+length+(length%2);}}
}
async function normalizeImage(bytes:Uint8Array,mime:string){
 const size=dimensions(bytes,mime);if(!size)throw new ApiError('This image does not match its declared PNG, JPEG or WebP format.');
 if(size.width<1||size.height<1||size.width>8192||size.height>8192||size.width*size.height>24_000_000)throw new ApiError('Resize this image below 24 megapixels and 8192 pixels per side.',413);
 try{const packageName='@napi-rs/canvas',native=createRequire(import.meta.url)(packageName) as typeof import('@napi-rs/canvas'),image=await native.loadImage(bytes);if(!(image.width===size.width&&image.height===size.height||image.width===size.height&&image.height===size.width))throw Error('dimensions');const scale=Math.min(1,2048/Math.max(image.width,image.height)),width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale)),canvas=native.createCanvas(width,height),context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);return new Uint8Array(canvas.toBuffer('image/jpeg',85));}catch{throw new ApiError('This image could not be decoded. Export it as a new PNG or JPEG and try again.');}
}
async function normalize(file:File){
 let name=file.name.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,'').trim();if(!name||name.length>180||/[\\/]/.test(name))throw new ApiError('Use a filename under 180 characters without path separators.');
 const mime=file.type.toLowerCase(),allowed:Record<string,RegExp>={'image/png':/\.png$/i,'image/jpeg':/\.jpe?g$/i,'image/webp':/\.webp$/i,'application/pdf':/\.pdf$/i,'application/vnd.openxmlformats-officedocument.wordprocessingml.document':/\.docx$/i,'text/plain':/\.(?:txt|md)$/i};
 if(!allowed[mime]?.test(name))throw new ApiError('Choose an original PNG, JPEG, WebP, PDF, DOCX or TXT file with its matching file type.');
 const original=new Uint8Array(await file.arrayBuffer()),originalSha=await digest(original);let bytes=original,text='',warnings:string[]=[],storedMime=mime;
 if(mime.startsWith('image/')){bytes=await normalizeImage(original,mime);storedMime='image/jpeg';name=name.replace(/\.[^.]+$/,'.jpg');warnings=['Image optimized to a private JPEG for visual analysis; fine text and small details may be lost.'];}
 else if(mime==='text/plain'){try{text=new TextDecoder('utf-8',{fatal:true}).decode(original).replace(/^\ufeff/,'');if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw Error('binary');}catch{throw new ApiError('Choose a readable UTF-8 text file.');}}
 else{try{const imported=await importProductDocument(original,name);text=imported.sections.map(section=>section.title+'\n'+section.body).join('\n\n').replace(/!\[[^\]]*\]\(import:[^)]+\)/g,'[Embedded image omitted]');warnings=imported.warnings;if(imported.assets.length)warnings.push('Embedded document images are not analyzed. Attach the original image separately for visual analysis.');}catch(error){if(mime==='application/pdf'&&error instanceof ProductDocumentError&&/No readable text/.test(error.message)){text='';warnings=['No readable text was found. This may be a scanned PDF. Its pages are not visually analyzed here; attach page images or a text-based document.'];}else if(error instanceof ProductDocumentError)throw new ApiError(error.message,error.status);else throw error;}}
 if(bytes.length>workspaceAttachmentLimits.fileBytes)throw new ApiError('The optimized file exceeds 8 MiB. Use a smaller image.',413);
 const bounded=excerpt(text);if(bounded!==text)warnings.push('Only a bounded text excerpt is supplied to Gen; review the original document for omitted content.');
 return {id:crypto.randomUUID(),name,mime:storedMime,size:bytes.length,sha256:await digest(bytes),kind:mime.startsWith('image/')?'image' as const:'document' as const,warnings:[...new Set(warnings)].slice(0,8).map(value=>value.slice(0,500)),bytes,excerpt:bounded,originalSha};
}

/** Enforce body bytes before the multipart parser allocates file buffers. */
export async function readWorkspaceAttachmentForm(request:Request){
 const max=workspaceAttachmentLimits.totalBytes+65536,length=request.headers.get('content-length'),type=request.headers.get('content-type')||'';if(!type.startsWith('multipart/form-data;')||!request.body)throw new ApiError('Attach files using multipart form data.');if(length&&(!/^\d+$/.test(length)||Number(length)>max))throw new ApiError('Attachments exceed the 20 MiB message limit.',413);
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){if(request.signal.aborted)throw new ApiError('File upload cancelled.',499);const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>max)throw new ApiError('Attachments exceed the 20 MiB message limit.',413);chunks.push(item.value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}try{return await new Response(bytes,{headers:{'Content-Type':type}}).formData();}catch{throw new ApiError('The file upload was incomplete. Select the files again.');}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
}
export async function createWorkspaceAttachments(owner:string,form:FormData){
 const requestId=z.string().uuid().parse(form.get('requestId'));if(form.getAll('requestId').length!==1||[...form.keys()].some(key=>!['requestId','files'].includes(key)))throw new ApiError('Use a single upload request reference and the selected files.');
 const files=form.getAll('files');if(files.length<1||files.length>workspaceAttachmentLimits.files||files.some(file=>typeof file==='string'))throw new ApiError('Attach between one and four files.');
 let originalBytes=0;for(const file of files as File[]){if(file.size<1||file.size>workspaceAttachmentLimits.fileBytes)throw new ApiError('Each attachment must be between 1 byte and 8 MiB.',413);originalBytes+=file.size;}if(originalBytes>workspaceAttachmentLimits.totalBytes)throw new ApiError('Keep attachments under 20 MiB combined.',413);
 const normalized=[];for(const file of files as File[])normalized.push(await normalize(file));
 const intent=JSON.stringify(normalized.map((item,index)=>({name:(files[index] as File).name,mime:(files[index] as File).type,size:(files[index] as File).size,sha256:item.originalSha}))),db=database();
 const prior=await db.prepare('SELECT owner,intent,response FROM workspace_attachment_batches WHERE id=?').bind(requestId).first();
 const replay=(row:AttachmentRow)=>{if(row.owner!==owner||row.intent!==intent)throw new ApiError('This upload request reference was already used for different files.',409);return JSON.parse(String(row.response)) as {attachments:WorkspaceAttachment[]};};if(prior)return replay(prior);
 const usage=await db.prepare('SELECT COUNT(*) AS files,COALESCE(SUM(size),0) AS bytes FROM workspace_attachments WHERE owner=?').bind(owner).first();const storedBytes=normalized.reduce((total,item)=>total+item.size,0);
 if(Number(usage?.files||0)+files.length>workspaceAttachmentLimits.ownerFiles||Number(usage?.bytes||0)+storedBytes>workspaceAttachmentLimits.ownerBytes)throw new ApiError('Your private chat file storage is full. Use smaller existing references or contact support.',413);
 const ownerKey=await digest(encoder.encode(owner)),objects=normalized.map(item=>({item,key:`workspace-attachments/${ownerKey}/${item.id}`})),response:{attachments:WorkspaceAttachment[]}={attachments:[]},now=Date.now();
 // Metadata exposes only an allowlist, never the private key or source excerpt.
 response.attachments=normalized.map(({bytes,excerpt:ignored,originalSha,...item})=>{void bytes;void ignored;void originalSha;return workspaceAttachmentSchema.parse(item);});
 const responseJson=JSON.stringify(response);
 try{
  for(const object of objects)await bucket().put(object.key,object.item.bytes);
  const results=await db.batch([
   db.prepare('INSERT OR IGNORE INTO workspace_attachment_batches(id,owner,intent,response,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM workspace_attachments WHERE owner=?)+?<=? AND (SELECT COALESCE(SUM(size),0) FROM workspace_attachments WHERE owner=?)+?<=?').bind(requestId,owner,intent,responseJson,now,owner,files.length,workspaceAttachmentLimits.ownerFiles,owner,storedBytes,workspaceAttachmentLimits.ownerBytes),
   ...objects.map(({item,key})=>db.prepare('INSERT INTO workspace_attachments(id,owner,batch_id,name,mime,size,sha256,kind,object_key,excerpt,warnings,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM workspace_attachment_batches WHERE id=? AND owner=? AND response=?)').bind(item.id,owner,requestId,item.name,item.mime,item.size,item.sha256,item.kind,key,item.excerpt,JSON.stringify(item.warnings),now,requestId,owner,responseJson)),
  ]);
  if(!results[0].meta.changes){for(const object of objects)await bucket().delete(object.key);const row=await db.prepare('SELECT owner,intent,response FROM workspace_attachment_batches WHERE id=?').bind(requestId).first();if(row)return replay(row);throw new ApiError('Your private chat file storage is full.',413);}
  return response;
 }catch(error){for(const object of objects)await bucket().delete(object.key).catch(()=>{});throw error;}
}
async function verifiedBytes(row:AttachmentRow){const object=await bucket().get(String(row.object_key));if(!object||object.size!==Number(row.size)){await object?.body.cancel().catch(()=>{});throw new ApiError('An attached file is unavailable. Select the original file again.',409);}const bytes=new Uint8Array(await new Response(object.body).arrayBuffer());if(await digest(bytes)!==row.sha256)throw new ApiError('An attached file failed its integrity check. Select the original again.',409);return bytes;}
export async function workspaceAttachmentDownload(id:string,owner:string){z.string().uuid().parse(id);const row=await database().prepare('SELECT * FROM workspace_attachments WHERE id=? AND owner=?').bind(id,owner).first();if(!row)throw new ApiError('This file was not found in your workspace.',404);return {attachment:metadata(row),bytes:await verifiedBytes(row)};}
export async function workspaceAttachmentContext(ids:string[],owner:string){
 workspaceAttachmentIdsSchema.parse(ids);const sources:{attachment:WorkspaceAttachment;excerpt:string}[]=[],images:TextGenerationImage[]=[];let total=0;
 for(const id of ids){const row=await database().prepare('SELECT * FROM workspace_attachments WHERE id=? AND owner=?').bind(id,owner).first();if(!row)throw new ApiError('An attached file was not found in your workspace.',404);total+=Number(row.size);if(total>workspaceAttachmentLimits.totalBytes)throw new ApiError('Keep attached references below 20 MiB combined.',413);const bytes=await verifiedBytes(row),attachment=metadata(row);sources.push({attachment,excerpt:String(row.excerpt)});if(attachment.kind==='image')images.push({mime:'image/jpeg',base64:Buffer.from(bytes).toString('base64')});}
 return {sources,images};
}
