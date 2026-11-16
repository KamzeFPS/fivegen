import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {request as httpRequest} from 'node:http';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {createStorage} from '../runtime/render/storage.mjs';
import {digest} from '../runtime/render/auth.mjs';
import {clipperVideoFixture} from './clipper-video-fixture.mjs';

// Real HTTP, auth, private storage and SQLite; all publisher calls are mocked.
const root=resolve('outputs/clipper-runtime-qa',randomUUID());
const probe=createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));
const port=probe.address().port;await new Promise(done=>probe.close(done));
const canonical='https://www.fivegen.test',clipperOrigin='https://clipper.fivegen.test',base=`http://127.0.0.1:${port}`;
for(const key of Object.keys(process.env))if(/^(STRIPE_|PADDLE_|OPENAI_|ANTHROPIC_|FAL_|RESEND_|EMAIL_|AUTH_EMAIL_|PURCHASE_EMAIL_|AUTOMATION_)/.test(key))delete process.env[key];
const dispatchSecret=randomBytes(32).toString('base64url');
Object.assign(process.env,{NODE_ENV:'production',APP_ORIGIN:canonical,CLIPPER_ORIGIN:clipperOrigin,DOCS_ORIGIN:'',PORT:String(port),FIVEGEN_RUNTIME:'render',FIVEGEN_DATA_DIR:root,GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',CREDENTIAL_ENCRYPTION_KEY:'clipper-runtime-fixture-key-'.repeat(3),RENDER_EXTERNAL_URL:'',RENDER:'',PRODUCT_DOMAIN:'',ADMIN_USER_IDS:'clipper-admin',ADMIN_EMAILS:'',PADDLE_ENVIRONMENT:'sandbox',STRIPE_MODE:'test',STRIPE_COMMERCE_ENABLED:'false',AUTOMATIONS_WORKER_ENABLED:'false',PURCHASE_EMAILS_WORKER_ENABLED:'false',PRODUCT_REMINDERS_WORKER_ENABLED:'false',SERVICE_INTEGRATIONS_WORKER_ENABLED:'false',CLIPPER_PUBLISHING_WORKER_ENABLED:'false',CLIPPER_PUBLISHING_DISPATCH_SECRET:dispatchSecret});
const actors=['clipper-admin','clipper-member','clipper-outsider','clipper-unaccepted'],tokens=actors.map(()=>randomBytes(32).toString('base64url'));
const terms=readFileSync('lib/terms.ts','utf8').match(/TERMS_VERSION='([^']+)'/)[1],seed=createStorage(root);
for(const [i,id] of actors.entries()){seed.sqlite.prepare('INSERT INTO render_sessions VALUES(?,?,?,?,?)').run(digest(tokens[i]),id,id+'@example.test',id+' Synthetic',Date.now()+3600000);if(id!=='clipper-unaccepted')seed.sqlite.prepare('INSERT INTO terms_acceptances VALUES(?,?,?,?,?)').run(randomUUID(),id,terms,id+'@example.test',Date.now());}
seed.close();
const originalFetch=globalThis.fetch,outbound=[],postRequests=[],remotePosts=[];
let ambiguousNext=false;
const accountFixture={activeSocialAccounts:['instagram','youtube','tiktok'],displayNames:[{platform:'instagram',id:'ig-owned-1',username:'fivegen'},{platform:'youtube',id:'yt-owned-1',username:'FiveGen'},{platform:'tiktok',id:'tt-owned-1',username:'fivegen'}]};
globalThis.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(['127.0.0.1','localhost','[::1]'].includes(url.hostname))return originalFetch(input,options);
 if(url.origin!=='https://api.ayrshare.com'){outbound.push(url.origin);throw new Error('External request blocked.');}
 if(!String(options.headers?.Authorization||'').includes('synthetic-ayrshare-key'))return Response.json({status:'error'},{status:401});
 if(url.pathname==='/api/user')return Response.json(accountFixture);
 if(url.pathname==='/api/post'&&options.method==='POST'){
  const body=JSON.parse(options.body);postRequests.push(body);
  const post={status:'success',id:'mock-post-'+postRequests.length,notes:body.notes,postIds:body.platforms.map(platform=>({platform,status:'success',id:platform+'-fixture',postUrl:platform==='instagram'?'https://www.instagram.com/reel/PrivateTest01/':platform==='youtube'?'https://youtu.be/PrivateQA01':'https://www.tiktok.com/@fivegen/video/9000000000000000001'}))};remotePosts.push(post);
  if(ambiguousNext){ambiguousNext=false;throw new Error('Simulated lost provider reply after creation.');}return Response.json(post);
 }
 if(url.pathname.startsWith('/api/post/')){const post=remotePosts.find(post=>post.id===url.pathname.split('/').at(-1));return Response.json(post||{status:'error'},{status:post?200:404});}
 if(url.pathname==='/api/history')return Response.json({history:remotePosts});
 throw new Error('Unexpected provider request '+url.pathname);
};
const {start}=await import('../runtime/render/server.mjs');const app=await start(),db=app.storage.sqlite;
const actorHeaders=i=>({Host:new URL(canonical).host,Origin:canonical,Cookie:`__Host-fivegen-session=${tokens[i]}`,'Content-Type':'application/json'});
const admin=actorHeaders(0),member=actorHeaders(1),outsider=actorHeaders(2),unaccepted=actorHeaders(3),anonymous={Host:new URL(canonical).host,Origin:canonical,'Content-Type':'application/json'};
function request(path,{method='GET',headers=anonymous,body,raw}={}){return new Promise((resolve,reject)=>{const req=httpRequest(base+path,{method,headers},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);res.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:res.statusCode,headers:res.headers,text:bytes.toString('utf8'),bytes});});});req.on('error',reject);req.end(raw===undefined?(body===undefined?undefined:JSON.stringify(body)):raw);});}
async function json(path,method='GET',body,headers=member,expected=200){const r=await request(path,{method,body,headers});let value;try{value=JSON.parse(r.text);}catch{throw new Error(`${method} ${path}: ${r.status} ${r.text.slice(0,200)}`);}assert.equal(r.status,expected,`${method} ${path}: ${JSON.stringify(value)}`);return value;}
const campaignInput={title:{mn:'Туршилтын клип кампани',en:'Synthetic upload campaign'},description:{mn:'Зөвхөн туршилтын кампанийн тайлбар.',en:'Private synthetic upload campaign.'},brief:{mn:'Клипээ MP4 файлаар илгээнэ үү.',en:'Upload your own MP4 clip.'},rules:{mn:'Зөвхөн туршилтын контент.',en:'Private test content only.'},brand:'Synthetic Brand',category:'Clipping',platforms:['tiktok','instagram','youtube'],rewardModel:'per_post',currency:'USD',rate:1200,minPayout:1200,maxPayout:1200,budget:12000,startsAt:null,endsAt:null,coverUrl:'',referenceUrl:'',status:'active'};
const video=clipperVideoFixture(),variant=n=>Buffer.concat([video,Buffer.from([0,0,0,9,102,114,101,101,n])]);
async function upload(id,bytes=video,headers=member,expected=201){const r=await request('/api/clipper/campaigns/'+id+'/videos?name=synthetic-clip.mp4',{method:'POST',headers:{...headers,'Content-Type':'video/mp4','X-File-Size':String(bytes.length)},raw:bytes});assert.equal(r.status,expected,r.text);return JSON.parse(r.text);}
const dispatch=()=>json('/api/clipper/publishing/dispatch','POST',undefined,{...anonymous,Authorization:'Bearer '+dispatchSecret});
try{
 const empty=await json('/api/clipper','GET',undefined,anonymous);assert.deepEqual(empty.campaigns,[]);assert.equal(empty.user,null);assert.deepEqual(empty.publishing,[]);
 await json('/api/clipper/admin','GET',undefined,anonymous,401);await json('/api/clipper/admin','GET',undefined,outsider,403);await json('/api/clipper/admin/publishing','GET',undefined,outsider,403);
 const campaign=await json('/api/clipper/admin/campaigns','POST',campaignInput,admin,201),id=campaign.id;
 await json('/api/clipper/admin/campaigns','POST',campaignInput,{...admin,Origin:'https://attacker.test'},403);
 await upload(id,video,anonymous,401);await upload(id,video,unaccepted,428);await upload(id,video,{...member,Origin:'https://attacker.test'},403);await upload(id,Buffer.from('This is not a video'),member,400);
 const first=await upload(id);assert.equal(first.source,'upload');assert.equal(first.platform,'upload');assert.equal(first.videoSize,video.length);assert.ok(first.videoId);assert.match(first.url,/^\/api\/clipper\/submissions\//);
 const creator=await json('/api/clipper');assert.ok(creator.profile);assert.equal(creator.memberships[0].campaignId,id);assert.equal(creator.submissions.length,1,'No profile/join prerequisites');await upload(id,video,member,409);await upload(id,video,outsider,409);
 await json('/api/clipper/campaigns/'+id+'/submissions','POST',{platform:'instagram',url:'https://www.instagram.com/reel/NoLinksNow/'},member,410);
 const full=await request(first.url,{headers:member});assert.equal(full.status,200);assert.deepEqual(full.bytes,video);assert.match(full.headers['cache-control'],/no-store/);
 const ranged=await request(first.url,{headers:{...member,Range:'bytes=0-15'}});assert.equal(ranged.status,206);assert.deepEqual(ranged.bytes,video.subarray(0,16));
 const head=await request(first.url,{method:'HEAD',headers:admin});assert.equal(head.status,200);assert.equal(head.bytes.length,0);assert.equal((await request(first.url)).status,401);assert.ok([403,404].includes((await request(first.url,{headers:outsider})).status));
 const review='/api/clipper/admin/submissions/'+first.id,approval={status:'approved',caption:'Synthetic private test caption',platforms:['instagram','youtube'],reviewNote:'Synthetic reviewed video.'};
 await json(review,'PATCH',approval,outsider,403);await json(review,'PATCH',approval,admin,409);assert.equal(db.prepare('SELECT status FROM clipper_submissions WHERE id=?').get(first.id).status,'pending');
 const settings=await json('/api/clipper/admin/publishing','PUT',{apiKey:'synthetic-ayrshare-key-never-real',enabledPlatforms:['instagram','youtube','tiktok']},admin);assert.equal(settings.configured,true);assert.equal(settings.accounts.length,3);assert.ok(!JSON.stringify(settings).includes('synthetic-ayrshare-key'));assert.ok(!db.prepare('SELECT credentials FROM clipper_publishing_settings').get().credentials.includes('synthetic-ayrshare-key'));
 await json(review,'PATCH',approval,{...admin,Origin:'https://attacker.test'},403);await json(review,'PATCH',approval,admin);await json(review,'PATCH',approval,admin);assert.equal(db.prepare('SELECT COUNT(*) n FROM clipper_publish_jobs').get().n,1);assert.equal(db.prepare('SELECT reward FROM clipper_submissions WHERE id=?').get(first.id).reward,1200);
 await json('/api/clipper/publishing/dispatch','POST',undefined,admin,401);await dispatch();assert.equal(postRequests.length,1);assert.deepEqual(postRequests[0].platforms,['instagram','youtube']);assert.equal(postRequests[0].youTubeOptions.visibility,'public');
 const asset=new URL(postRequests[0].mediaUrls[0]);assert.equal(asset.origin,canonical);assert.match(asset.pathname,/\.mp4$/);const served=await request(asset.pathname+asset.search);assert.equal(served.status,200);assert.deepEqual(served.bytes,video);assert.match(served.headers['referrer-policy'],/no-referrer/);assert.equal((await request(asset.pathname+'?token=wrong')).status,404);assert.equal((await request(asset.pathname)).status,404);
 await dispatch();assert.equal(postRequests.length,1,'Published videos are not posted twice');const publishing=(await json('/api/clipper')).publishing[0];assert.equal(publishing.status,'published');assert.equal(publishing.results.length,2);assert.ok(!JSON.stringify(publishing).includes(asset.searchParams.get('token')));
 const second=await upload(id,variant(2));await json('/api/clipper/admin/submissions/'+second.id,'PATCH',{...approval,caption:'Second synthetic test clip',platforms:['tiktok']},admin);ambiguousNext=true;await dispatch();assert.equal(postRequests.length,2);assert.equal(db.prepare('SELECT status FROM clipper_publish_jobs WHERE submission_id=?').get(second.id).status,'uncertain');
 db.prepare('UPDATE clipper_publish_jobs SET next_attempt_at=0 WHERE submission_id=?').run(second.id);await dispatch();assert.equal(postRequests.length,2,'Lost creation replies reconcile without a second post');assert.equal(db.prepare('SELECT status FROM clipper_publish_jobs WHERE submission_id=?').get(second.id).status,'published');
 const rejected=await upload(id,variant(3));await json('/api/clipper/admin/submissions/'+rejected.id,'PATCH',{status:'rejected',verifiedViews:0,reviewNote:'Synthetic rejection.'},admin);assert.equal(db.prepare('SELECT COUNT(*) n FROM clipper_publish_jobs WHERE submission_id=?').get(rejected.id).n,0);
 const publicState=await json('/api/clipper','GET',undefined,anonymous);assert.deepEqual(publicState.submissions,[]);assert.deepEqual(publicState.publishing,[]);assert.equal(publicState.profile,null);assert.ok(!JSON.stringify(publicState).includes('synthetic-clip.mp4'));
 const clipperHeaders={...admin,Host:new URL(clipperOrigin).host,Origin:clipperOrigin};assert.equal((await request('/?lang=mn',{headers:clipperHeaders})).status,200);assert.equal((await json('/api/clipper','GET',undefined,clipperHeaders)).user,null);assert.equal((await request('/api/clipper/campaigns/'+id+'/videos',{method:'POST',headers:clipperHeaders,raw:video})).status,405);
 for(const lang of ['mn','en']){assert.equal((await request('/clipper/app?lang='+lang,{headers:member})).status,200);assert.equal((await request('/clipper/admin?lang='+lang,{headers:admin})).status,200);}
 assert.deepEqual(outbound,[]);console.log('Clipper video runtime passed: MP4 upload, automatic profile/membership, private/range playback, access boundaries, encrypted setup, approval+queue atomicity, fixed rewards, signed media, exactly-once mocked publishing and lost-reply reconciliation. No real social posts, emails or payments.');console.log('Synthetic fixture: '+root);
}finally{await new Promise(done=>{app.server.close(done);app.server.closeIdleConnections();});app.storage.close();globalThis.fetch=originalFetch;}
