import {env} from 'cloudflare:workers';
import {ApiError,database} from './server';
import {createUploadValidator,UploadValidationError,verifyStoredUpload} from './upload-validation';
import {getClipperSubmission} from './clipper-server';
import type {ChatGPTUser} from '@/app/chatgpt-auth';

export const CLIPPER_VIDEO_LIMIT=100*1024*1024;
export const CLIPPER_VIDEO_QUOTA=2*1024*1024*1024;
const globalQuota=5*1024*1024*1024;
type VideoRow=Record<string,unknown>;
function videoBucket(){const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;if(!bucket)throw new ApiError('Video storage is unavailable. Try again shortly.',503);return bucket;}
const fourcc=(bytes:Uint8Array,offset=0)=>String.fromCharCode(...bytes.subarray(offset,offset+4));

/** Check the MP4 container and declared video track while streaming. Large mdat
 * boxes are skipped; only a bounded moov box is retained. This is not decoding. */
export function createClipperMp4Validator(size:number){
 let cursor=0,header=new Uint8Array(0),expectedHeader=8,remaining=0,type='',capture:Uint8Array|null=null,captured=0,hasFtyp=false,hasVideo=false,hasMedia=false;
 function inspectTrack(bytes:Uint8Array,start=0,end=bytes.length,depth=0):boolean{
  if(depth>8)throw new UploadValidationError('This MP4 container is too deeply nested. Export the video again.');
  for(let offset=start;offset<end;){
   if(offset+8>end)throw new UploadValidationError('This MP4 video container is incomplete.');
   const view=new DataView(bytes.buffer,bytes.byteOffset+offset,end-offset),short=view.getUint32(0),kind=fourcc(bytes,offset+4),head=short===1?16:8;
   if(offset+head>end)throw new UploadValidationError('This MP4 video container is incomplete.');
   const length=short===0?end-offset:short===1?Number(view.getBigUint64(8)):short;
   if(!Number.isSafeInteger(length)||length<head||offset+length>end)throw new UploadValidationError('This MP4 video container is invalid.');
   if(kind==='hdlr'&&length>=head+12&&fourcc(bytes,offset+head+8)==='vide')return true;
   if(['trak','mdia'].includes(kind)&&inspectTrack(bytes,offset+head,offset+length,depth+1))return true;
   offset+=length;
  }
  return false;
 }
 function completeBox(){
  if(type==='ftyp'){
   const brands=new Set(['isom','iso2','iso3','iso4','iso5','iso6','iso8','iso9','mp41','mp42','avc1','dash','M4V ','MSNV']);
   if(!capture||capture.length<8||capture.length%4!==0)throw new UploadValidationError('Choose an original MP4 video.');
   let compatible=brands.has(fourcc(capture));for(let i=8;i<capture.length;i+=4)compatible=compatible||brands.has(fourcc(capture,i));
   if(!compatible)throw new UploadValidationError('Choose a supported MP4 video export.');hasFtyp=true;
  }
  if(type==='moov'&&capture)hasVideo=hasVideo||inspectTrack(capture);
  header=new Uint8Array(0);expectedHeader=8;capture=null;captured=0;type='';
 }
 return new TransformStream<Uint8Array,Uint8Array>({
  transform(chunk,controller){let offset=0;while(offset<chunk.length){
   if(!remaining){
    const count=Math.min(expectedHeader-header.length,chunk.length-offset),next=new Uint8Array(header.length+count);next.set(header);next.set(chunk.subarray(offset,offset+count),header.length);header=next;offset+=count;cursor+=count;
    if(header.length<expectedHeader)continue;
    const view=new DataView(header.buffer);if(expectedHeader===8&&view.getUint32(0)===1){expectedHeader=16;continue;}
    const start=cursor-header.length,short=view.getUint32(0),length=short===0?size-start:short===1?Number(view.getBigUint64(8)):short;
    if(!Number.isSafeInteger(length)||length<header.length||start+length>size)throw new UploadValidationError('This MP4 video container is incomplete or invalid.');
    type=fourcc(header,4);remaining=length-header.length;if(type==='mdat'&&remaining>0)hasMedia=true;
    if(type==='ftyp'||type==='moov'){
     if(remaining>(type==='ftyp'?4096:8*1024*1024))throw new UploadValidationError('This MP4 has oversized metadata. Export a smaller MP4 video.');
     capture=new Uint8Array(remaining);
    }
    if(!remaining){completeBox();continue;}
   }
   const count=Math.min(remaining,chunk.length-offset);if(capture){capture.set(chunk.subarray(offset,offset+count),captured);captured+=count;}offset+=count;cursor+=count;remaining-=count;
   if(!remaining)completeBox();
  }controller.enqueue(chunk);},
  flush(){if(cursor!==size||header.length||remaining||!hasFtyp||!hasVideo||!hasMedia)throw new UploadValidationError('Choose a complete MP4 file containing a video track.');},
 });
}

async function expireVideoAttempts(owner:string,bucket:R2Bucket){
 const db=database(),cutoff=Date.now()-30*60*1000,rows=await db.prepare("SELECT id,object_key FROM clipper_videos WHERE owner=? AND status='uploading' AND updated_at<? LIMIT 50").bind(owner,cutoff).all();
 for(const row of rows.results){const result=await db.prepare("UPDATE clipper_videos SET status='failed',updated_at=? WHERE id=? AND status='uploading' AND updated_at<?").bind(Date.now(),row.id,cutoff).run();if(result.meta.changes)await bucket.delete(String(row.object_key)).catch(()=>{});}
}

export async function uploadClipperVideo(request:Request,campaignId:string,user:ChatGPTUser){
 const db=database(),bucket=videoBucket(),size=Number(request.headers.get('x-file-size')),mime=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 const rawName=(new URL(request.url).searchParams.get('name')||'video.mp4').split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g,''),name=rawName.length>150?rawName.slice(0,146)+'.mp4':rawName;
 if(mime!=='video/mp4'||!name.toLowerCase().endsWith('.mp4'))throw new ApiError('Choose an MP4 video file.',400);
 if(!Number.isSafeInteger(size)||size<1||size>CLIPPER_VIDEO_LIMIT||!request.body)throw new ApiError('Upload an MP4 video up to 100 MB.',413);
 await expireVideoAttempts(user.userId,bucket);
 const now=Date.now(),id=crypto.randomUUID(),submissionId=crypto.randomUUID(),key=`clipper-videos/${user.userId}/${campaignId}/${id}`;
 // Signup records the contributor's name. Uploading does not require a personal
 // social account or a separate join form.
 const displayName=(user.fullName||user.displayName||'Clipper').slice(0,80);
 await db.prepare("INSERT OR IGNORE INTO clipper_profiles(owner,display_name,social_links,created_at,updated_at) SELECT ?,?,'{\"tiktok\":\"\",\"instagram\":\"\",\"youtube\":\"\"}',?,? WHERE EXISTS(SELECT 1 FROM clipper_campaigns WHERE id=? AND status='active' AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>?) AND approved_rewards<budget)").bind(user.userId,displayName,now,now,campaignId,now,now).run();
 await db.prepare("INSERT OR IGNORE INTO clipper_memberships(campaign_id,owner,joined_at) SELECT c.id,p.owner,? FROM clipper_campaigns c JOIN clipper_profiles p ON p.owner=? WHERE c.id=? AND c.status='active' AND (c.starts_at IS NULL OR c.starts_at<=?) AND (ends_at IS NULL OR ends_at>?) AND c.approved_rewards<c.budget").bind(now,user.userId,campaignId,now,now).run();
 const reserve=await db.prepare("INSERT INTO clipper_videos(id,owner,campaign_id,object_key,name,mime,size,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,'uploading',?,? WHERE EXISTS(SELECT 1 FROM clipper_campaigns c JOIN clipper_memberships m ON m.campaign_id=c.id AND m.owner=? WHERE c.id=? AND c.status='active' AND (c.starts_at IS NULL OR c.starts_at<=?) AND (c.ends_at IS NULL OR c.ends_at>?) AND c.approved_rewards<c.budget) AND (SELECT COUNT(*) FROM clipper_videos WHERE owner=? AND created_at>?)<50 AND (SELECT COALESCE(SUM(size),0) FROM clipper_videos WHERE owner=? AND status<>'failed')+?<=? AND (SELECT COALESCE(SUM(size),0) FROM clipper_videos WHERE status<>'failed')+?<=?").bind(id,user.userId,campaignId,key,name,mime,size,now,now,user.userId,campaignId,now,now,user.userId,now-86400000,user.userId,size,CLIPPER_VIDEO_QUOTA,size,globalQuota).run();
 if(!reserve.meta.changes)throw new ApiError('This campaign is closed, or your video storage/upload allowance is full. Upload up to 50 videos per day and 2 GB in total.',409);
 try{
  const validation=createUploadValidator(size,mime),stream=request.body.pipeThrough(createClipperMp4Validator(size)).pipeThrough(validation.stream);
  if(typeof FixedLengthStream!=='undefined'){const fixed=new FixedLengthStream(size);await Promise.all([stream.pipeTo(fixed.writable),bucket.put(key,fixed.readable,{httpMetadata:{contentType:mime}})]);}else await bucket.put(key,stream,{httpMetadata:{contentType:mime}});
  const checksum=validation.checksum(),stored=await bucket.get(key);if(!stored||stored.size!==size)throw new ApiError('The stored video could not be verified. Try the original file again.',503);
  await verifyStoredUpload(stored.body,size,checksum);
  const results=await db.batch([
   db.prepare("INSERT INTO clipper_submissions(id,campaign_id,owner,display_name,platform,url,post_key,video_id,created_at) SELECT ?,c.id,v.owner,p.display_name,'upload',?,?,v.id,? FROM clipper_videos v JOIN clipper_campaigns c ON c.id=v.campaign_id JOIN clipper_profiles p ON p.owner=v.owner WHERE v.id=? AND v.owner=? AND v.status='uploading' AND c.status='active' AND (c.starts_at IS NULL OR c.starts_at<=?) AND (c.ends_at IS NULL OR c.ends_at>?) AND c.approved_rewards<c.budget").bind(submissionId,'/api/clipper/submissions/'+submissionId+'/video','upload:'+checksum,now,id,user.userId,Date.now(),Date.now()),
   db.prepare("UPDATE clipper_videos SET status='completed',sha256=?,updated_at=? WHERE id=? AND owner=? AND status='uploading' AND EXISTS(SELECT 1 FROM clipper_submissions WHERE id=? AND video_id=clipper_videos.id)").bind(checksum,Date.now(),id,user.userId,submissionId),
  ]);
  if(!results[0].meta.changes||!results[1].meta.changes)throw new ApiError('The campaign stopped accepting videos while this upload was finishing. Your video was not submitted.',409);
  return getClipperSubmission(submissionId);
 }catch(error){
  await bucket.delete(key).catch(()=>{});
  await db.prepare("UPDATE clipper_videos SET status='failed',updated_at=? WHERE id=? AND owner=?").bind(Date.now(),id,user.userId).run();
  if(/UNIQUE.*clipper_submissions\.(?:post_key|url|video_id)/i.test(String(error)))throw new ApiError('This video has already been uploaded.',409);
  if(error instanceof ApiError)throw error;
  if(error instanceof UploadValidationError)throw new ApiError(error.message,error.status);
  throw new ApiError('The video upload did not finish. Try the original MP4 file again.',503);
 }
}

export async function getClipperVideo(id:string):Promise<VideoRow>{const row=await database().prepare("SELECT * FROM clipper_videos WHERE id=? AND status='completed'").bind(id).first();if(!row)throw new ApiError('Video not found.',404);return row;}
export async function streamClipperVideo(request:Request,video:VideoRow){
 const size=Number(video.size),headers:Record<string,string>={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Disposition':(new URL(request.url).searchParams.has('download')?'attachment':'inline')+`; filename*=UTF-8''${encodeURIComponent(String(video.name))}`};let range:{offset:number;length:number}|undefined;
 if(request.headers.has('range')){const match=/^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range')||'');if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]?(match[2]?Number(match[2]):size-1):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});range={offset:start,length:Math.min(end,size-1)-start+1};}
 const object=await videoBucket().get(String(video.object_key),range?{range}:undefined);if(!object)throw new ApiError('Video is unavailable.',404);
 headers['Content-Length']=String(range?.length||size);if(range)headers['Content-Range']=`bytes ${range.offset}-${range.offset+range.length-1}/${size}`;
 if(request.method==='HEAD'){await object.body.cancel().catch(()=>{});return new Response(null,{status:range?206:200,headers});}
 return new Response(object.body,{status:range?206:200,headers});
}
