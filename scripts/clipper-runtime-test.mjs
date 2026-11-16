import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {request as httpRequest} from 'node:http';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {createStorage} from '../runtime/render/storage.mjs';
import {digest} from '../runtime/render/auth.mjs';

// Real built bundles, HTTP host/auth boundary and SQLite. All people, campaigns
// and social URLs are synthetic; nothing is posted, emailed or paid externally.
const root=resolve('outputs/clipper-runtime-qa',randomUUID());
const probe=createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));
const port=probe.address().port;await new Promise(done=>probe.close(done));
const canonical='https://www.fivegen.test',clipperOrigin='https://clipper.fivegen.test',base=`http://127.0.0.1:${port}`;
for(const key of Object.keys(process.env))if(/^(STRIPE_|PADDLE_|OPENAI_|ANTHROPIC_|FAL_|RESEND_|EMAIL_|AUTH_EMAIL_|PURCHASE_EMAIL_|AUTOMATION_)/.test(key))delete process.env[key];
Object.assign(process.env,{NODE_ENV:'production',APP_ORIGIN:canonical,CLIPPER_ORIGIN:clipperOrigin,DOCS_ORIGIN:'',PORT:String(port),FIVEGEN_RUNTIME:'render',FIVEGEN_DATA_DIR:root,GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',CREDENTIAL_ENCRYPTION_KEY:'clipper-runtime-fixture-key-'.repeat(3),RENDER_EXTERNAL_URL:'',RENDER:'',PRODUCT_DOMAIN:'',ADMIN_USER_IDS:'clipper-admin',ADMIN_EMAILS:'',PADDLE_ENVIRONMENT:'sandbox',STRIPE_MODE:'test',STRIPE_COMMERCE_ENABLED:'false',AUTOMATIONS_WORKER_ENABLED:'false',PURCHASE_EMAILS_WORKER_ENABLED:'false',PRODUCT_REMINDERS_WORKER_ENABLED:'false',SERVICE_INTEGRATIONS_WORKER_ENABLED:'false'});
const actors=['clipper-admin','clipper-member','clipper-outsider','clipper-unaccepted'],tokens=actors.map(()=>randomBytes(32).toString('base64url'));
const terms=readFileSync('lib/terms.ts','utf8').match(/TERMS_VERSION='([^']+)'/)[1],seed=createStorage(root);
for(const [i,id] of actors.entries()){
  seed.sqlite.prepare('INSERT INTO render_sessions VALUES(?,?,?,?,?)').run(digest(tokens[i]),id,id+'@example.test',id+' Synthetic',Date.now()+3600000);
  if(id!=='clipper-unaccepted')seed.sqlite.prepare('INSERT INTO terms_acceptances VALUES(?,?,?,?,?)').run(randomUUID(),id,terms,id+'@example.test',Date.now());
}
seed.close();
const originalFetch=globalThis.fetch,outbound=[];
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)){outbound.push(url.origin);throw new Error('Clipping runtime QA blocked an external request.');}
  return originalFetch(input,options);
};
const {start}=await import('../runtime/render/server.mjs');
const app=await start(),db=app.storage.sqlite;
const actorHeaders=i=>({Host:new URL(canonical).host,Origin:canonical,Cookie:`__Host-fivegen-session=${tokens[i]}`,'Content-Type':'application/json'});
const admin=actorHeaders(0),member=actorHeaders(1),outsider=actorHeaders(2),unaccepted=actorHeaders(3),anonymous={Host:new URL(canonical).host,Origin:canonical,'Content-Type':'application/json'};
function request(path,{method='GET',headers=anonymous,body,raw}={}){
  return new Promise((resolve,reject)=>{
    const req=httpRequest(base+path,{method,headers},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString('utf8')}));
    });
    req.on('error',reject);req.end(raw===undefined?(body===undefined?undefined:JSON.stringify(body)):raw);
  });
}
async function json(path,method='GET',body,headers=member,expected=200){
  const response=await request(path,{method,body,headers});let value;
  try{value=JSON.parse(response.text);}catch{throw new Error(`${method} ${path}: expected JSON, received ${response.status} ${response.text.slice(0,300)}`);}
  assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(value)}`);return value;
}
const campaignInput=(overrides={})=>({title:{mn:'Туршилтын клип кампани',en:'Synthetic clipping campaign'},description:{mn:'Зөвхөн туршилтад зориулсан кампанийн тайлбар.',en:'Synthetic campaign used only for isolated runtime verification.'},brief:{mn:'Өөрийн клипийг бүтээж, зөвшөөрсөн платформд нийтэлнэ.',en:'Create your own clip and publish it on an eligible platform.'},rules:{mn:'Эх материалын эрх болон платформын дүрмийг баримтал.',en:'Respect source permissions and platform requirements.'},brand:'Synthetic Brand',category:'Clipping',platforms:['tiktok','instagram','youtube'],rewardModel:'cpm',currency:'USD',rate:200,minPayout:100,maxPayout:1000,budget:1500,startsAt:null,endsAt:null,coverUrl:'',referenceUrl:'',status:'active',...overrides});
const profileInput={displayName:'Synthetic Creator',socialLinks:{tiktok:'https://www.tiktok.com/@synthetic_creator?utm_source=qa',instagram:'',youtube:''}};
const post=n=>({platform:'tiktok',url:`https://www.tiktok.com/@synthetic_creator/video/${9000000000000000000n+BigInt(n)}?utm_source=qa`});
try{
  const empty=await json('/api/clipper','GET',undefined,anonymous);
  assert.deepEqual(empty,{campaigns:[],profile:null,memberships:[],submissions:[],isAdmin:false,user:null});
  await json('/api/clipper/admin','GET',undefined,anonymous,401);
  await json('/api/clipper/admin','GET',undefined,outsider,403);
  await json('/api/clipper/admin/campaigns','POST',campaignInput(),anonymous,401);
  await json('/api/clipper/admin/campaigns','POST',campaignInput(),outsider,403);
  await json('/api/clipper/admin/campaigns','POST',campaignInput(),{...admin,Origin:'https://attacker.test'},403);
  await json('/api/clipper/admin/campaigns','POST',campaignInput(),{...anonymous,'oai-authenticated-user-id':actors[0],'oai-authenticated-user-email':actors[0]+'@example.test'},401);
  await json('/api/clipper/admin/campaigns','POST',campaignInput({title:{mn:'Зөвхөн нэг хэл'}}),admin,400);
  const draft=await json('/api/clipper/admin/campaigns','POST',campaignInput({status:'draft',title:{mn:'Нууц ноорог',en:'Private synthetic draft'}}),admin,201);
  let campaign=await json('/api/clipper/admin/campaigns','POST',campaignInput(),admin,201);
  assert.equal(campaign.version,1);assert.equal(campaign.approvedRewards,0);
  const publicBefore=await json('/api/clipper','GET',undefined,anonymous);
  assert.deepEqual(publicBefore.campaigns.map(c=>c.id),[campaign.id]);
  assert.ok(!JSON.stringify(publicBefore).includes(draft.id));
  assert.ok(!JSON.stringify(publicBefore).includes(actors[0]));
  assert.ok(!JSON.stringify(publicBefore).includes('@example.test'));
  assert.deepEqual((await json('/api/clipper/admin','GET',undefined,admin)).campaigns.map(c=>c.id).sort(),[draft.id,campaign.id].sort());
  const join='/api/clipper/campaigns/'+campaign.id+'/join',submit='/api/clipper/campaigns/'+campaign.id+'/submissions';
  await json(join,'POST',{},anonymous,401);
  await json(join,'POST',{},member,409);
  await json('/api/clipper/profile','PUT',profileInput,unaccepted,428);
  await json('/api/clipper/profile','PUT',profileInput,{...member,Origin:'https://attacker.test'},403);
  await json('/api/clipper/profile','PUT',{...profileInput,socialLinks:{tiktok:'',instagram:'',youtube:''}},member,400);
  await json('/api/clipper/profile','PUT',{...profileInput,socialLinks:{...profileInput.socialLinks,tiktok:'https://attacker.test/@synthetic'}},member,400);
  assert.equal((await request('/api/clipper/profile',{method:'PUT',headers:member,raw:'{'})).status,400);
  assert.equal((await request('/api/clipper/profile',{method:'PUT',headers:member,raw:'x'.repeat(96001)})).status,413);
  const profile=await json('/api/clipper/profile','PUT',profileInput);
  assert.equal(profile.owner,actors[1]);assert.equal(profile.socialLinks.tiktok,'https://www.tiktok.com/@synthetic_creator');
  await json(submit,'POST',post(1),member,409);
  const membership=await json(join,'POST',{});
  assert.equal(membership.campaignId,campaign.id);assert.deepEqual(await json(join,'POST',{}),membership);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM clipper_memberships WHERE campaign_id=? AND owner=?').get(campaign.id,actors[1]).n,1);
  await json('/api/clipper/admin/campaigns/'+campaign.id,'PATCH',{...campaignInput(),expectedVersion:0},admin,409);
  await json('/api/clipper/admin/campaigns/'+campaign.id,'PATCH',{...campaignInput({rate:300}),expectedVersion:campaign.version},admin,409);
  await json('/api/clipper/admin/campaigns/'+campaign.id,'PATCH',{...campaignInput(),expectedVersion:campaign.version},outsider,403);
  await json(submit,'POST',{platform:'tiktok',url:'https://www.tiktok.com/@synthetic_creator'},member,400);
  const first=await json(submit,'POST',post(1),member,201);
  const second=await json(submit,'POST',post(2),member,201),third=await json(submit,'POST',post(3),member,201);
  assert.equal(first.status,'pending');assert.equal(first.reward,0);assert.ok(!first.url.includes('?'));
  await json(submit,'POST',post(1),member,409);
  await json('/api/clipper/profile','PUT',{...profileInput,displayName:'Synthetic Outsider',socialLinks:{tiktok:'https://www.tiktok.com/@synthetic_outsider',instagram:'',youtube:''}},outsider);
  await json(submit,'POST',post(4),outsider,409);
  const outsiderState=await json('/api/clipper','GET',undefined,outsider);
  assert.deepEqual(outsiderState.memberships,[]);assert.deepEqual(outsiderState.submissions,[]);assert.ok(!JSON.stringify(outsiderState).includes(first.id));
  await json(join,'POST',{},outsider);
  await json(submit,'POST',{platform:'tiktok',url:first.url+'?different=tracking'},outsider,409);
  const review='/api/clipper/admin/submissions/'+first.id;
  await json(review,'PATCH',{status:'approved',verifiedViews:100000,reviewNote:''},outsider,403);
  await json(review,'PATCH',{status:'approved',verifiedViews:100000,reviewNote:''},{...admin,Origin:'https://attacker.test'},403);
  await json(review,'PATCH',{status:'approved',verifiedViews:100,reviewNote:''},admin,409);
  assert.equal(db.prepare('SELECT status FROM clipper_submissions WHERE id=?').get(first.id).status,'pending');
  const approved=await json(review,'PATCH',{status:'approved',verifiedViews:100000,reviewNote:'Synthetic verified-view review.'},admin);
  assert.equal(approved.reward,1000,'Actual recorded reward is capped per clip');assert.equal(approved.verifiedViews,100000);
  await json(review,'PATCH',{status:'approved',verifiedViews:100000,reviewNote:''},admin,409);
  const reviewSecond='/api/clipper/admin/submissions/'+second.id;
  await json(reviewSecond,'PATCH',{status:'approved',verifiedViews:3000,reviewNote:''},admin,409);
  assert.deepEqual({...db.prepare('SELECT status,reward FROM clipper_submissions WHERE id=?').get(second.id)},{status:'pending',reward:0},'Budget rejection rolls back the decision');
  assert.equal(db.prepare('SELECT approved_rewards FROM clipper_campaigns WHERE id=?').get(campaign.id).approved_rewards,1000);
  const lastApproved=await json(reviewSecond,'PATCH',{status:'approved',verifiedViews:2500,reviewNote:''},admin);assert.equal(lastApproved.reward,500);
  await json('/api/clipper/admin/submissions/'+third.id,'PATCH',{status:'rejected',verifiedViews:0,reviewNote:''},admin,400);
  const rejected=await json('/api/clipper/admin/submissions/'+third.id,'PATCH',{status:'rejected',verifiedViews:0,reviewNote:'Synthetic clip did not meet the stated rules.'},admin);assert.equal(rejected.reward,0);
  assert.equal(db.prepare('SELECT approved_rewards FROM clipper_campaigns WHERE id=?').get(campaign.id).approved_rewards,1500);
  await json(submit,'POST',post(5),member,409);
  await json('/api/clipper/admin/campaigns/'+campaign.id,'PATCH',{...campaignInput({budget:1499}),expectedVersion:campaign.version},admin,409);
  campaign=await json('/api/clipper/admin/campaigns/'+campaign.id,'PATCH',{...campaignInput({budget:2000}),expectedVersion:campaign.version},admin);assert.equal(campaign.version,2);assert.equal(campaign.approvedRewards,1500);
  await json('/api/clipper/admin/campaigns/'+campaign.id,'PATCH',{...campaignInput({budget:2000}),expectedVersion:1},admin,409);
  const perPost=await json('/api/clipper/admin/campaigns','POST',campaignInput({rewardModel:'per_post',rate:500,minPayout:100,maxPayout:500,budget:1000,currency:'MNT',platforms:['instagram']}),admin,201);
  await json('/api/clipper/campaigns/'+perPost.id+'/join','POST',{});
  await json('/api/clipper/campaigns/'+perPost.id+'/submissions','POST',post(6),member,409);
  const ig=await json('/api/clipper/campaigns/'+perPost.id+'/submissions','POST',{platform:'instagram',url:'https://instagram.com/reel/SyntheticQa_1/?utm_source=test'},member,201);
  assert.equal(ig.url,'https://www.instagram.com/reel/SyntheticQa_1/');
  const igApproved=await json('/api/clipper/admin/submissions/'+ig.id,'PATCH',{status:'approved',verifiedViews:0,reviewNote:'Verified synthetic per-post record.'},admin);assert.equal(igApproved.reward,500);
  const future=await json('/api/clipper/admin/campaigns','POST',campaignInput({startsAt:Date.now()+3600000}),admin,201);
  await json('/api/clipper/campaigns/'+future.id+'/join','POST',{},member,409);
  const paused=await json('/api/clipper/admin/campaigns','POST',campaignInput({status:'paused'}),admin,201);
  await json('/api/clipper/campaigns/'+paused.id+'/join','POST',{},member,409);

  const state=await json('/api/clipper');
  assert.equal(state.profile.displayName,'Synthetic Creator');assert.equal(state.submissions.length,4);
  assert.equal(state.submissions.filter(s=>s.status==='approved').length,3);assert.equal(state.isAdmin,false);
  const anonymousAfter=await request('/api/clipper');
  assert.match(anonymousAfter.headers['cache-control'],/no-store/);
  const publicState=JSON.parse(anonymousAfter.text);
  assert.equal(publicState.user,null);assert.equal(publicState.profile,null);assert.deepEqual(publicState.submissions,[]);assert.deepEqual(publicState.memberships,[]);
  for(const secret of [...actors,'Synthetic Creator','Synthetic Outsider',...tokens,...state.submissions.map(s=>s.url)])assert.ok(!anonymousAfter.text.includes(secret),'Public data must exclude '+secret);
  const adminState=await json('/api/clipper/admin','GET',undefined,admin);assert.equal(adminState.submissions.length,4);

  for(const [locale,copy] of [['mn','Дараагийн клипээ. Дараагийн боломжоо.'],['en','Your next clip. Your next opportunity.']]){
    const portal=await request('/clipper/app?lang='+locale,{headers:member});assert.equal(portal.status,200);assert.ok(portal.text.includes(copy));assert.ok(portal.text.includes(`lang="${locale}"`));
    const manage=await request('/clipper/admin?lang='+locale,{headers:admin});assert.equal(manage.status,200);assert.ok(manage.text.includes(locale==='mn'?'Шинэ кампани':'New campaign'));
    const landing=await request('/clipper?lang='+locale);assert.equal(landing.status,200);assert.ok(landing.text.includes('FiveGen'));assert.ok(landing.text.includes(`lang="${locale}"`));
  }
  const guestPortal=await request('/clipper/app?lang=mn');assert.equal(guestPortal.status,307);
  const authUrl=new URL(guestPortal.headers.location,canonical);assert.equal(authUrl.pathname,'/signin-with-chatgpt');assert.equal(authUrl.searchParams.get('return_to'),'/clipper/app?lang=mn');
  const consentPortal=await request('/clipper/app?lang=en',{headers:unaccepted});assert.equal(consentPortal.status,307);assert.equal(new URL(consentPortal.headers.location,canonical).pathname,'/welcome');
  const blockedAdmin=await request('/clipper/admin?lang=en',{headers:outsider});assert.equal(blockedAdmin.status,307);assert.equal(new URL(blockedAdmin.headers.location,canonical).pathname,'/clipper/app');

  const clipperHeaders={...admin,Host:new URL(clipperOrigin).host,Origin:clipperOrigin,'oai-authenticated-user-id':actors[0],'x-fivegen-app-origin':'https://attacker.test'};
  const hostLanding=await request('/?lang=mn',{headers:clipperHeaders});assert.equal(hostLanding.status,200);assert.equal(hostLanding.headers['x-fivegen-surface'],'clipper');assert.ok(hostLanding.text.includes('FiveGen'));
  const hostState=await json('/api/clipper','GET',undefined,clipperHeaders);assert.equal(hostState.user,null);assert.equal(hostState.isAdmin,false);assert.deepEqual(hostState.submissions,[]);
  const hostPrivate=await request('/clipper/app?lang=en&campaign='+campaign.id,{headers:clipperHeaders});assert.equal(hostPrivate.status,303);assert.equal(hostPrivate.headers.location,canonical+'/clipper/app?lang=en&campaign='+campaign.id);
  const hostAdmin=await request('/clipper/admin?lang=mn',{headers:clipperHeaders});assert.equal(hostAdmin.status,303);assert.equal(hostAdmin.headers.location,canonical+'/clipper/admin?lang=mn');
  assert.equal((await request('/api/admin',{headers:clipperHeaders})).status,404);
  assert.equal((await request('/api/clipper/profile',{method:'PUT',body:profileInput,headers:clipperHeaders})).status,405);
  assert.equal((await request('/api/clipper',{headers:{Host:'unrecognized.example.test'}})).status,421);
  assert.deepEqual(outbound,[],'No external provider, email, social or payment request was attempted');
  console.log('Clipping built runtime passed: actual authenticated admin publication, public/private data isolation, profile/join/submission lifecycle, unique normalized video URLs, terms/admin/origin/body boundaries, verified-view minimum/cap/budget accounting and rejection rollback, per-post MNT rewards, stale/frozen offer terms, bilingual pages, dedicated public host and canonical member/admin redirects. No external calls, emails, posts or payments.');
  console.log('Synthetic QA records retained: '+root);
}finally{
  await new Promise(done=>{app.server.close(done);app.server.closeIdleConnections();});app.storage.close();globalThis.fetch=originalFetch;
}
