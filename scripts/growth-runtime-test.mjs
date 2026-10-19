import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {createStorage} from '../runtime/render/storage.mjs';
import {digest} from '../runtime/render/auth.mjs';

// Exercise the built app over HTTP with isolated accounts and real SQLite/media.
// No external AI, email, payment, or deployment operations are performed.
const root=resolve('outputs/growth-runtime-qa',randomUUID());
const probe=createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));
const port=probe.address().port;await new Promise(done=>probe.close(done));
const base=`http://127.0.0.1:${port}`;
Object.assign(process.env,{NODE_ENV:'production',APP_ORIGIN:base,PORT:String(port),FIVEGEN_RUNTIME:'render',FIVEGEN_DATA_DIR:root,GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',CREDENTIAL_ENCRYPTION_KEY:'local-growth-test-key-'.repeat(3),RENDER_EXTERNAL_URL:'',RENDER:'',PRODUCT_DOMAIN:'',PADDLE_ENVIRONMENT:'sandbox',OPENAI_API_KEY:'',ANTHROPIC_API_KEY:'',FAL_KEY:'',PADDLE_API_KEY:'',STRIPE_SECRET_KEY:'',STRIPE_MODE:'test'});
const seed=createStorage(root),owner='growth-runtime-owner',other='growth-runtime-other';
const tokens=[randomBytes(32).toString('base64url'),randomBytes(32).toString('base64url')];
const version=readFileSync('lib/terms.ts','utf8').match(/TERMS_VERSION='([^']+)'/)[1];
for(const [index,id] of [owner,other].entries()){
  seed.sqlite.prepare('INSERT INTO render_sessions VALUES (?,?,?,?,?)').run(digest(tokens[index]),id,`${id}@example.test`,'Growth QA',Date.now()+3600000);
  seed.sqlite.prepare('INSERT INTO terms_acceptances VALUES (?,?,?,?,?)').run(randomUUID(),id,version,`${id}@example.test`,Date.now());
}
seed.close();
const {start}=await import('../runtime/render/server.mjs');const app=await start();
const headers={cookie:`fivegen-local-session=${tokens[0]}`,origin:base,'content-type':'application/json'};
const otherHeaders={...headers,cookie:`fivegen-local-session=${tokens[1]}`};
async function json(path,method='GET',body,auth=headers,expected=200){
  const response=await fetch(base+path,{method,headers:auth,body:body===undefined?undefined:JSON.stringify(body)});
  const value=await response.json();assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(value)}`);return value;
}
try{
  const home=await fetch(base+'/',{headers});assert.equal(home.status,200);assert.ok((await home.text()).includes('Create your product'));
  await json('/api/growth/crm','GET',undefined,{},401);
  const {product:initial}=await json('/api/products','POST',{title:'The creator-led launch',description:'A practical product taught with the creator’s own experience and recordings.',audience:'Independent designers',format:'Video course',price:0,color:'orange',generationMode:'auto'});
  assert.equal(app.storage.sqlite.prepare('SELECT COUNT(*) n FROM generation WHERE product_id=?').get(initial.id).n,0,'New products never enqueue AI course authorship');
  const productUrl=`/api/products/${initial.id}`;
  await json(productUrl+'/growth','GET',undefined,otherHeaders,404);
  const video=Buffer.from('local recorded video transport fixture');
  const uploadResponse=await fetch(base+productUrl+'/uploads?name=creator-vsl.mp4',{method:'POST',headers:{...headers,'content-type':'video/mp4','x-file-size':String(video.length)},body:video});assert.equal(uploadResponse.status,201);
  const {upload}=await uploadResponse.json();
  const {commerce,experience,...fields}=initial;
  const content={...initial.content,sections:[{id:randomUUID(),category:'Foundations',title:'My own lesson',body:'PRIVATE_LESSON_BODY',videoId:upload.id}]};
  const {product}=await json(productUrl,'PATCH',{...fields,content,expectedUpdatedAt:initial.updatedAt});
  assert.equal(product.content.sections[0].category,'Foundations');
  assert.equal((await fetch(base+`/api/uploads/${upload.id}` )).status,403,'Recordings default private');
  const brief={icp:'PRIVATE_ICP',problem:'PRIVATE_PROBLEM',beliefs:'PRIVATE_BELIEFS',story:'PRIVATE_CREATOR_STORY',promise:'An honest useful outcome',proof:'No proof yet',offer:'A course taught by the creator',tone:'Warm and direct',cta:'Join the interest list'};
  const assets={vsl:'PRIVATE_EDITABLE_SCRIPT',landing:{headline:'A better launch for independent designers',subheadline:'Learn from a working designer.',body:'Public and deliberately reviewed landing copy.',benefits:['A useful repeatable process'],ctaLabel:'Join the list',thankYou:'Thanks. The creator can follow up with details.'},followUp:'PRIVATE_FOLLOW_UP'};
  const {growth:initialGrowth}=await json(productUrl+'/growth');
  const {growth}=await json(productUrl+'/growth','PATCH',{brief,assets,expectedUpdatedAt:initialGrowth.updatedAt});
  await json(productUrl+'/growth','PATCH',{brief,assets,expectedUpdatedAt:initialGrowth.updatedAt},headers,409);
  await json(productUrl+'/growth','PATCH',{brief,assets,expectedUpdatedAt:growth.updatedAt},{...headers,origin:'https://other.example'},403);
  const {funnel}=await json(productUrl+'/growth/publish','POST',{expectedUpdatedAt:0,expectedGrowthUpdatedAt:growth.updatedAt,creatorVslUploadId:upload.id});
  const publicUrl=`/g/${funnel.slug}`;
  const page=await fetch(base+publicUrl);assert.equal(page.status,200);assert.match(page.headers.get('cache-control')||'',/no-store/);const html=await page.text();
  assert.ok(html.includes(assets.landing.headline));
  for(const secret of [owner,other,'PRIVATE_LESSON_BODY','PRIVATE_CREATOR_STORY','PRIVATE_ICP','PRIVATE_EDITABLE_SCRIPT','PRIVATE_FOLLOW_UP'])assert.ok(!html.includes(secret),`Public page must not leak ${secret}`);
  const recording=await fetch(base+`/api/growth/video/${funnel.slug}`,{headers:{range:'bytes=0-4'}});assert.equal(recording.status,206);assert.equal(await recording.text(),'local');
  assert.equal((await fetch(base+`/api/uploads/${upload.id}`,{headers:{...otherHeaders,'content-type':'video/mp4'}})).status,403);
  const changed={...assets,landing:{...assets.landing,headline:'Private revised headline'}};
  const {growth:newGrowth}=await json(productUrl+'/growth','PATCH',{brief,assets:changed,expectedUpdatedAt:growth.updatedAt});
  assert.ok((await (await fetch(base+publicUrl)).text()).includes(assets.landing.headline),'Private edits do not silently publish');
  const signup={slug:funnel.slug,name:'Interested Person',email:'Person@example.test',marketing:true,website:''};
  await json('/api/growth/leads','POST',signup,{'content-type':'application/json',origin:base});
  await json('/api/growth/leads','POST',{...signup,marketing:false},{'content-type':'application/json',origin:base});
  const leads=await json('/api/growth/crm');assert.equal(leads.total,1);assert.equal(leads.leads[0].marketing,true);assert.equal(leads.leads[0].email,'person@example.test');
  assert.equal((await json('/api/growth/crm','GET',undefined,otherHeaders)).total,0);
  const lead=leads.leads[0];
  await json('/api/growth/crm','PATCH',{id:lead.id,status:'qualified',notes:'Asked about the next cohort.',expectedUpdatedAt:lead.updatedAt},otherHeaders,404);
  const {lead:updated}=await json('/api/growth/crm','PATCH',{id:lead.id,status:'qualified',notes:'Asked about the next cohort.',expectedUpdatedAt:lead.updatedAt});assert.equal(updated.status,'qualified');
  await json(productUrl+'/growth/publish','POST',{expectedUpdatedAt:funnel.updatedAt,expectedGrowthUpdatedAt:newGrowth.updatedAt,creatorVslUploadId:null});
  assert.ok((await (await fetch(base+publicUrl)).text()).includes(changed.landing.headline));
  assert.equal((await fetch(base+`/api/growth/video/${funnel.slug}`)).status,404,'Detached public VSL immediately unavailable');
  await json(productUrl+'/growth/publish','DELETE');
  const unavailable=await fetch(base+publicUrl);assert.equal(unavailable.status,404);assert.ok(!(await unavailable.text()).includes(changed.landing.headline));
  await json('/api/growth/leads','POST',signup,{'content-type':'application/json',origin:base},404);
  for(const path of ['/api/checkout','/p/legacy','/api/referrals'])assert.equal((await fetch(base+path)).status,410,'Retired payments remain disabled');
  console.log('Passed: real HTTP auth, manual creation, lessons/video uploads, growth saves, publication snapshots, public data isolation, opt-in leads, CRM ownership, VSL revocation, unpublish, and retired payment boundaries.');
  console.log('QA records retained: '+root);
}finally{
  await new Promise(done=>{app.server.close(done);app.server.closeIdleConnections();});app.storage.close();
}
