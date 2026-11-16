import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {copyFileSync,mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {z} from 'zod';
import {createStorage} from '../runtime/render/storage.mjs';
import {clipperVideoFixture} from './clipper-video-fixture.mjs';

const root=resolve('outputs/clipper-video-tests',randomUUID()),storage=createStorage(root),sql=storage.sqlite;
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
let actor='video-creator',admin=false;
const deps={z,createHash,env:{BUCKET:storage.BUCKET},ApiError,database:()=>storage.DB,identity:async()=>{if(!actor)throw new ApiError('Sign in',401);return {userId:actor,displayName:actor,email:actor+'@example.test',fullName:null};},isAdmin:()=>admin,sameOrigin:request=>{if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError('Origin rejected',403);},failure:error=>Response.json({error:error.issues?'Invalid input':error.message},{status:error.status||(error.issues?400:500)}),readProductArchive:()=>{throw new Error('Documents are not part of video tests.');}};
async function load(path){const key='videoQA'+randomUUID().replaceAll('-','');globalThis[key]={...deps};const source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');const value=await import('data:text/javascript;base64,'+Buffer.from('const {'+Object.keys(deps).join(',')+'}=globalThis.'+key+';\n'+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));delete globalThis[key];return value;}
Object.assign(deps,await load('lib/clipper.ts'));Object.assign(deps,await load('lib/upload-validation.ts'));Object.assign(deps,await load('lib/clipper-server.ts'));Object.assign(deps,await load('lib/clipper-video.ts'));
const uploadApi=await load('app/api/clipper/campaigns/[id]/videos/route.ts'),videoApi=await load('app/api/clipper/submissions/[id]/video/route.ts'),linkApi=await load('app/api/clipper/campaigns/[id]/submissions/route.ts');
const text={mn:'Видео туршилт',en:'Video upload test'},input={title:text,description:text,brief:text,rules:text,brand:'Synthetic',category:'Clipping',platforms:['tiktok','instagram','youtube'],rewardModel:'cpm',currency:'MNT',rate:1000,minPayout:1000,maxPayout:10000,budget:100000,startsAt:null,endsAt:null,coverUrl:'',referenceUrl:'',status:'active'};
const bytes=clipperVideoFixture(),params=id=>({params:Promise.resolve({id})});
function request(body=bytes,{name='original.mp4',mime='video/mp4',size=body.length,origin='https://fivegen.test',stream=false}={}){return new Request('https://fivegen.test/api/clipper/videos?name='+encodeURIComponent(name),{method:'POST',headers:{origin,'Content-Type':mime,'X-File-Size':String(size)},body:stream?new ReadableStream({start(controller){for(let i=0;i<body.length;i+=7)controller.enqueue(body.subarray(i,i+7));controller.close();}}):body,...(stream?{duplex:'half'}:{})});}
async function upload(campaign,body=bytes,options){return uploadApi.POST(request(body,options),params(campaign.id));}
function readRequest(range,method='GET'){return new Request('https://fivegen.test/api/clipper/video',{method,headers:range?{range}:{}});}
async function validate(payload,chunk=7,size=payload.length){const stream=new ReadableStream({start(controller){for(let i=0;i<payload.length;i+=chunk)controller.enqueue(payload.subarray(i,i+chunk));controller.close();}});return new Response(stream.pipeThrough(deps.createClipperMp4Validator(size))).arrayBuffer();}
try{
 for(const chunk of [1,7,16,128,4096])assert.deepEqual(Buffer.from(await validate(bytes,chunk)),bytes);
 await assert.rejects(()=>validate(Buffer.from('a fake text file with the mp4 filename')));
 await assert.rejects(()=>validate(bytes.subarray(0,bytes.length-1)));
 const audioOnly=Buffer.from(bytes);let videoIndex=audioOnly.indexOf(Buffer.from('vide'));assert.ok(videoIndex>0);audioOnly.write('soun',videoIndex);await assert.rejects(()=>validate(audioOnly));
 const oversizeMetadata=Buffer.alloc(8);oversizeMetadata.writeUInt32BE(9*1024*1024,0);oversizeMetadata.write('moov',4);await assert.rejects(()=>validate(oversizeMetadata,8,10*1024*1024));
 const campaign=await deps.saveClipperCampaign('admin',input);
 actor=null;assert.equal((await upload(campaign)).status,401);actor='video-creator';
 assert.equal((await upload(campaign,bytes,{origin:'https://attacker.test'})).status,403);
 assert.equal((await upload(campaign,bytes,{mime:'video/webm',name:'clip.webm'})).status,400);
 assert.equal((await upload(campaign,bytes,{size:104857601})).status,413);
 assert.equal((await upload(campaign,bytes,{size:0})).status,413);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM clipper_videos').get().n,0);
 assert.equal((await upload(campaign,Buffer.from('renamed malicious content'))).status,400);
 assert.equal((await upload(campaign,bytes,{size:bytes.length-1})).status,400);
 assert.equal((await upload(campaign,bytes,{size:bytes.length+1})).status,400);
 assert.equal((await linkApi.POST(new Request('https://fivegen.test/api/clipper',{method:'POST',headers:{origin:'https://fivegen.test'}}))).status,410);
 const saved=await upload(campaign,bytes,{stream:true,name:'../../original.mp4'});assert.equal(saved.status,201);const submission=await saved.json();
 assert.equal(submission.source,'upload');assert.equal(submission.platform,'upload');assert.equal(submission.videoName,'original.mp4');assert.equal(submission.videoSize,bytes.length);assert.ok(submission.videoId);assert.equal(submission.url,'/api/clipper/submissions/'+submission.id+'/video');
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM clipper_memberships WHERE owner=? AND campaign_id=?').get(actor,campaign.id).n,1);
 const profile=sql.prepare('SELECT * FROM clipper_profiles WHERE owner=?').get(actor);assert.ok(profile);assert.deepEqual(JSON.parse(profile.social_links),{tiktok:'',instagram:'',youtube:''});
 assert.equal((await deps.getClipperMember(actor)).submissions[0].videoId,submission.videoId);
 const media=await videoApi.GET(readRequest(),params(submission.id));assert.equal(media.status,200);assert.equal(media.headers.get('Content-Type'),'video/mp4');assert.equal(media.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(Buffer.from(await media.arrayBuffer()),bytes);
 const range=await videoApi.GET(readRequest('bytes=10-29'),params(submission.id));assert.equal(range.status,206);assert.equal(range.headers.get('Content-Range'),`bytes 10-29/${bytes.length}`);assert.deepEqual(Buffer.from(await range.arrayBuffer()),bytes.subarray(10,30));
 const suffix=await videoApi.GET(readRequest('bytes=-20'),params(submission.id));assert.equal(suffix.status,206);assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),bytes.subarray(-20));
 const head=await videoApi.HEAD(readRequest(undefined,'HEAD'),params(submission.id));assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
 for(const bad of ['bytes=9999999-','bytes=10-4','bytes=0-1,4-5','bytes=-0','items=0-20'])assert.equal((await videoApi.GET(readRequest(bad),params(submission.id))).status,416);
 actor='outsider';assert.equal((await videoApi.GET(readRequest(),params(submission.id))).status,404);assert.equal((await upload(campaign)).status,409);admin=true;assert.equal((await videoApi.GET(readRequest(),params(submission.id))).status,200);admin=false;
 actor=null;assert.equal((await videoApi.GET(readRequest(),params(submission.id))).status,401);actor='video-creator';
 assert.equal((await upload(campaign)).status,409);assert.equal(sql.prepare("SELECT COUNT(*) n FROM clipper_submissions WHERE video_id IS NOT NULL").get().n,1);
 await assert.rejects(()=>deps.reviewClipperSubmission('admin',submission.id,{status:'approved',verifiedViews:0,reviewNote:''}),error=>error.status===409);
 const rejected=await deps.reviewClipperSubmission('admin',submission.id,{status:'rejected',verifiedViews:0,reviewNote:'Synthetic rejection'});assert.equal(rejected.status,'rejected');assert.equal(rejected.reward,0);
 const stored=await deps.getClipperVideo(submission.videoId);assert.equal(stored.sha256,createHash('sha256').update(bytes).digest('hex'));
 for(const row of sql.prepare("SELECT object_key FROM clipper_videos WHERE status='failed'").all())assert.equal(await storage.BUCKET.get(row.object_key),null);
 const paused=await deps.saveClipperCampaign('admin',{...input,status:'paused'});assert.equal((await upload(paused)).status,409);
 // An active upload finishing after a pause cannot leak a completed orphan.
 const race=await deps.saveClipperCampaign('admin',input),originalPut=storage.BUCKET.put;
 storage.BUCKET.put=async(...args)=>{const result=await originalPut(...args);sql.prepare("UPDATE clipper_campaigns SET status='paused' WHERE id=?").run(race.id);return result;};
 assert.equal((await upload(race)).status,409);storage.BUCKET.put=originalPut;
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM clipper_submissions WHERE campaign_id=?').get(race.id).n,0);
 actor='quota-person';for(let i=0;i<22;i++)sql.prepare("INSERT INTO clipper_videos(id,owner,campaign_id,object_key,name,mime,size,status,created_at,updated_at) VALUES(?,?,?,?,?,'video/mp4',104857600,'completed',?,?)").run(randomUUID(),actor,campaign.id,randomUUID(),'quota.mp4',Date.now()-86400001,Date.now());
 assert.equal((await upload(campaign)).status,409);
 actor='rate-person';for(let i=0;i<50;i++)sql.prepare("INSERT INTO clipper_videos(id,owner,campaign_id,object_key,name,mime,size,status,created_at,updated_at) VALUES(?,?,?,?,?,'video/mp4',1,'failed',?,?)").run(randomUUID(),actor,campaign.id,randomUUID(),'failed.mp4',Date.now(),Date.now());
 assert.equal((await upload(campaign)).status,409);
 // Upgrade a real old0063 database, preserving identities, rewards and triggers.
 const migrations=resolve(root,'legacy-migrations'),legacyRoot=resolve(root,'legacy-db');mkdirSync(migrations);copyFileSync('drizzle/0063_clipper.sql',resolve(migrations,'0063_clipper.sql'));
 let legacy=createStorage(legacyRoot,migrations),old=legacy.sqlite;old.prepare("INSERT INTO clipper_campaigns(id,title,description,brief,rules,brand,category,platforms,reward_model,currency,rate,min_payout,max_payout,budget,status,created_by,created_at,updated_at) VALUES('campaign','{}','{}','{}','{}','Brand','Clipping','[\"youtube\"]','per_post','USD',100,100,100,1000,'active','admin',1,1)").run();old.prepare("INSERT INTO clipper_profiles VALUES('person','Person','{}',1,1)").run();old.prepare("INSERT INTO clipper_memberships VALUES('campaign','person',1)").run();old.prepare("INSERT INTO clipper_submissions(id,campaign_id,owner,display_name,platform,url,post_key,created_at) VALUES('old','campaign','person','Person','youtube','https://youtu.be/Synthetic01','youtube:Synthetic01',1)").run();old.prepare("UPDATE clipper_submissions SET status='approved',reward=100 WHERE id='old'").run();legacy.close();
 copyFileSync('drizzle/0064_clipper_video.sql',resolve(migrations,'0064_clipper_video.sql'));legacy=createStorage(legacyRoot,migrations);old=legacy.sqlite;assert.equal(old.prepare("SELECT reward FROM clipper_submissions WHERE id='old'").get().reward,100);assert.equal(old.prepare("SELECT video_id FROM clipper_submissions WHERE id='old'").get().video_id,null);assert.equal(old.prepare("SELECT approved_rewards FROM clipper_campaigns WHERE id='campaign'").get().approved_rewards,100);old.prepare("UPDATE clipper_submissions SET status='rejected',reward=0 WHERE id='old'").run();assert.equal(old.prepare("SELECT approved_rewards FROM clipper_campaigns WHERE id='campaign'").get().approved_rewards,0);assert.deepEqual(old.prepare('PRAGMA foreign_key_check').all(),[]);legacy.close();
 console.log('Clipper video passed: original MP4 streaming/container/video-track/hash validation, bounded metadata/storage/attempts, automatic registration/join, private ranged playback, owner/admin isolation, blocked link submissions, duplicate hashes, paused-finalize rollback, failed object cleanup and old0063 upgrade preservation. No external network or publishing.');
}finally{storage.close();}
