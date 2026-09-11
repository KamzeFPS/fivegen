import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { randomBytes, createHmac } from 'node:crypto';
import { createStorage } from '../runtime/render/storage.mjs';
import { digest } from '../runtime/render/auth.mjs';
import { unzipSync, strFromU8 } from 'fflate';

const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = 'http://127.0.0.1:' + port;
const root = mkdtempSync(join(tmpdir(), 'fivegen-production-'));
let processHandle, output = '', storage;
const value = randomBytes(32).toString('base64url');
const owner = 'google:render-integration-user';
const cookie = 'fivegen-local-session=' + value;
const webhookSecret = 'whsec_local_integration_fixture';
async function launch() {
  output = '';
  processHandle = spawn(process.execPath, ['runtime/render/server.mjs'], {
    env: { ...process.env, NODE_ENV: 'production', APP_ORIGIN: base, PORT: String(port), FIVEGEN_RUNTIME: 'render',
      FIVEGEN_DATA_DIR: root, GOOGLE_CLIENT_ID: 'local-test', GOOGLE_CLIENT_SECRET: 'local-test',
      CREDENTIAL_ENCRYPTION_KEY: 'local-test-encryption-value-'.repeat(2),
      STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'sk_live_integration_fixture_not_a_key', STRIPE_WEBHOOK_SECRET: webhookSecret, STRIPE_BILLING_WEBHOOK_SECRET: '',
      RENDER_EXTERNAL_URL: 'https://fivegen-integration.onrender.com', PRODUCT_DOMAIN: '',
      OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', FAL_KEY: '', ADMIN_EMAILS: 'admin@example.test', RENDER: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processHandle.stdout.on('data', data => output += data);
  processHandle.stderr.on('data', data => output += data);
  for (let i = 0; i < 100; i++) {
    if (processHandle.exitCode !== null) throw new Error(output);
    try { if ((await fetch(base + '/healthz')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Production startup timed out: ' + output);
}
async function stop() {
  if (!processHandle || processHandle.exitCode !== null) return;
  const exit = once(processHandle, 'exit');
  processHandle.kill('SIGTERM'); await exit;
}
async function json(path, method = 'GET', body, authenticated = true, status = 200) {
  const response = await fetch(base + path, { method, redirect: 'manual',
    headers: { origin: base, ...(authenticated ? { cookie: typeof authenticated==='string'?authenticated:cookie } : {}), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${path}: ${text.slice(0, 350)}\n${output.slice(-1500)}`);
  return JSON.parse(text);
}
function requestHost(host, path = '/') {
  return new Promise((resolve, reject) => {
    const request = httpRequest(base + path, { headers: { host } }, response => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location }));
    });
    request.on('error', reject); request.end();
  });
}
try {
  storage=createStorage(root);
  const db=storage.sqlite, now=Date.now(), identities={};
  for(const [name,email] of Object.entries({creator:'creator@example.test',buyer:'buyer@example.test',second:'second@example.test',partner:'partner@example.test',outsider:'outsider@example.test'})){
    const token=name==='creator'?value:randomBytes(32).toString('base64url'),id=name==='creator'?owner:'google:'+name;
    db.prepare('INSERT INTO render_sessions VALUES (?,?,?,?,?)').run(digest(token),id,email,name,now+3600000);
    identities[name]='fivegen-local-session='+token;
  }
  db.prepare("INSERT INTO memberships (owner,status,period_end,updated_at) VALUES (?,'active',?,?)").run(owner,Math.floor(now/1000)+86400,now);
  await launch();
  const products=[];
  const examples=[
    ['Guide','Scope a Design Proposal','A practical scope worksheet for independent designers.','Write deliverables, exclusions, two review rounds, and your decision maker.'],
    ['Mini course','Photograph Your First Ceramic Collection','Learn a repeatable lighting setup for handmade ceramics.','Place a soft light at 45 degrees; compare a white card and a dark card as fill.'],
    ['Template kit','Weekly Bakery Order Planner','Reusable production and order forms for a small bakery.','Copy the order worksheet, enter daily quantities, and total the flour requirements.'],
    ['Challenge','Seven Days of Focused Writing','Build a daily writing practice with short exercises.','Day one: write for ten minutes about an object on your desk. Keep your pen moving.'],
    ['Playbook','Customer Interview Operations','Run customer discovery interviews with consistent evidence.','Recruit five customers, ask about the last purchase, and tag observed behavior separately from opinions.'],
    ['Custom product','A Color Contrast Workshop','An interactive page and handout for a practical color exercise.','Open the included HTML exercise. Compare light and dark surfaces with the same accent.'],
    ['Coaching session','Portfolio Review Appointment','A focused review session for a junior design portfolio.','Bring three case studies and one question about your target role.'],
    ['Community','Independent Ceramic Makers Circle','A private working space for ceramic makers to share progress.','Introduce your studio, post a current piece, and ask for one specific kind of feedback.'],
  ];
  for(const [format,title,description,body] of examples){
    let {product:p}=await json('/api/products','POST',{format,title,description,audience:'Independent professionals',price:0,color:'orange',generationMode:'manual'});
    await json('/api/products/'+p.id,'PATCH',{...p,status:'published'},true,409);
    p.content.sections[0].body=body;p.content.launch='PRIVATE CREATOR CAMPAIGN';p.content.salesCopy='PRIVATE STRATEGY';
    if(format==='Template kit'||format==='Custom product')p.content.files=[{name:'index.html',description:'Working exercise',content:'<link rel="stylesheet" href="style.css"><h1>Working exercise</h1>'},{name:'style.css',description:'Exercise stylesheet',content:'h1 { color: #a43b00; }'}];
    if(format==='Coaching session')p.experience.booking.meetingUrl='https://meet.google.com/test-meeting';
    p=(await json('/api/products/'+p.id,'PATCH',{...p,status:'published'})).product;
    assert.equal(p.format,format);products.push(p);
    const publicHtml=await (await fetch(base+'/p/'+p.slug)).text();assert.ok(!publicHtml.includes(body),'Public storefront cannot leak paid content');
    const access=await json('/api/checkout','POST',{slug:p.slug,email:'buyer@example.test'},false);
    assert.ok(access.url.includes('token='));
    const room=await json('/api/learn/'+p.slug,'GET',undefined,identities.buyer);
    assert.equal(room.product.content.sections[0].body,body);assert.equal(room.product.content.launch,'');assert.equal(room.product.content.salesCopy,undefined);
    await json('/api/learn/'+p.slug,'GET',undefined,identities.outsider,403);
    await json('/api/learn/'+p.slug,'POST',{action:'complete',lessonId:p.content.sections[0].id,complete:true},identities.buyer);
    assert.equal((await json('/api/learn/'+p.slug,'GET',undefined,identities.buyer)).progress.length,1);
    const zip=unzipSync(new Uint8Array(await (await fetch(base+'/api/member-download/'+p.slug,{headers:{cookie:identities.buyer}})).arrayBuffer()));
    assert.ok(!Object.keys(zip).some(k=>k.startsWith('03-marketing/')));
    if(p.content.files?.length){assert.ok(zip['02-resources/index.html']);assert.ok(zip['02-resources/style.css']);}
  }
  const [guide,course,,,,,coaching,community]=products;
  await json('/api/checkout','POST',{slug:guide.slug},false,400);
  const duplicate={...guide,content:{...guide.content,sections:[guide.content.sections[0],guide.content.sections[0]]}};
  await json('/api/products/'+guide.id,'PATCH',duplicate,true,400);
  async function upload(p,body,mime='video/mp4',who=cookie,expected=201){
    const res=await fetch(base+'/api/products/'+p.id+'/uploads?name=lesson.mp4',{method:'POST',headers:{cookie:who,origin:base,'Content-Type':mime,'X-File-Size':String(body.length)},body});
    assert.equal(res.status,expected,await res.clone().text());return res.json();
  }
  const videoBytes=Buffer.from('local range test video bytes'),{upload:video}=await upload(course,videoBytes);
  const raw=await fetch(base+'/api/uploads/'+video.id,{headers:{cookie,range:'bytes=6-10'}});assert.equal(raw.status,206);assert.equal(await raw.text(),'range');
  assert.equal((await fetch(base+'/api/uploads/'+video.id)).status,403);
  assert.equal((await fetch(base+'/api/uploads/'+video.id,{headers:{cookie,range:'bytes=999-'}})).status,416);
  course.content.sections[0].videoId=video.id;
  Object.assign(course,(await json('/api/products/'+course.id,'PATCH',course)).product);
  await json('/api/uploads/'+video.id,'DELETE',undefined,true,409);
  assert.equal((await fetch(base+'/api/uploads/'+video.id,{headers:{cookie:identities.buyer}})).status,200);
  const {upload:pdf}=await upload(course,Buffer.from('workbook bytes'),'application/pdf');
  await json('/api/products/'+course.id,'PATCH',{...course,content:{...course.content,sections:[{...course.content.sections[0],videoId:pdf.id}]}},true,409);
  await json('/api/products/'+guide.id,'PATCH',{...guide,content:{...guide.content,sections:[{...guide.content.sections[0],videoId:video.id}]}},true,409);
  course.commerce.funnel={...course.commerce.funnel,kind:'vsl',enabled:true,blocks:[{id:'vsl',kind:'video',title:'Watch the lesson preview',body:'',image:'/api/uploads/'+video.id,visible:true,align:'center'},{id:'offer',kind:'offer',title:'Get the course',body:'',image:'',visible:true,align:'center'}]};
  Object.assign(course,(await json('/api/products/'+course.id,'PATCH',course)).product);
  assert.equal((await fetch(base+'/api/uploads/'+video.id)).status,200);
  course.commerce.funnel.enabled=false;Object.assign(course,(await json('/api/products/'+course.id,'PATCH',course)).product);
  assert.equal((await fetch(base+'/api/uploads/'+video.id)).status,403,'Disabling funnel makes its sales video private');
  const magnet={...guide,commerce:{...guide.commerce,funnel:{...guide.commerce.funnel,enabled:true,kind:'free_guide',blocks:[{id:'offer',kind:'offer',title:'Get your free guide',body:'',image:'',visible:true,align:'center'}]}}};
  await json('/api/products/'+guide.id,'PATCH',magnet);
  for(let i=0;i<2;i++)await json('/api/leads','POST',{slug:guide.slug,name:'New reader',email:'new-reader@example.test',marketing:false},false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM leads WHERE product_id=? AND email=?').get(guide.id,'new-reader@example.test').n,1);
  assert.equal(db.prepare('SELECT marketing FROM leads WHERE email=?').get('new-reader@example.test').marketing,0);
  await json('/api/learn/'+community.slug,'POST',{action:'post',body:'My first firing experiment.'},identities.buyer);
  let room=await json('/api/learn/'+community.slug,'GET',undefined,identities.buyer);const post=room.posts[0];
  await json('/api/learn/'+community.slug,'POST',{action:'pinPost',id:post.id,pinned:true},identities.buyer,403);
  await json('/api/learn/'+community.slug,'POST',{action:'pinPost',id:post.id,pinned:true});
  await json('/api/learn/'+community.slug,'POST',{action:'post',parentId:post.id,body:'What changed with your glaze?'});
  room=await json('/api/learn/'+community.slug);assert.equal(room.posts.length,2);assert.equal(room.posts.find(p=>p.id===post.id).pinned,1);
  await json('/api/learn/'+community.slug,'POST',{action:'deletePost',id:post.id});assert.equal((await json('/api/learn/'+community.slug)).posts.length,0);
  await json('/api/checkout','POST',{slug:coaching.slug,email:'second@example.test'},false);
  const startsAt=now+86400000;
  const slot=await json('/api/products/'+coaching.id+'/slots','POST',{startsAt});
  const slotId=slot.id||slot.slot?.id||(await json('/api/products/'+coaching.id+'/slots')).slots[0].id;
  const booking=await json('/api/learn/'+coaching.slug,'POST',{action:'book',slotId,notes:'Please review my opening case study.'},identities.buyer);
  assert.equal(booking.emailSent,false,'No email provider means no false sent confirmation');
  await json('/api/learn/'+coaching.slug,'POST',{action:'book',slotId},identities.second,409);
  await json('/api/crm','PATCH',{id:booking.id,status:'attended'},true,409);
  const calendar=await fetch(base+'/api/bookings/'+booking.id+'/calendar',{headers:{cookie:identities.buyer}});assert.equal(calendar.status,200);assert.ok((await calendar.text()).includes('BEGIN:VCALENDAR'));
  await json('/api/learn/'+coaching.slug,'POST',{action:'cancel',id:booking.id},identities.second,404);
  await json('/api/learn/'+coaching.slug,'POST',{action:'cancel',id:booking.id},identities.buyer);
  const secondBooking=await json('/api/learn/'+coaching.slug,'POST',{action:'book',slotId},identities.second);
  db.prepare('UPDATE booking_slots SET starts_at=? WHERE id=?').run(now-3600000,slotId);
  await json('/api/crm','PATCH',{id:secondBooking.id,status:'attended'});
  const nextSlot=await json('/api/products/'+coaching.id+'/slots','POST',{startsAt:startsAt+86400000});
  const nextSlotId=nextSlot.id||nextSlot.slot?.id||(await json('/api/products/'+coaching.id+'/slots')).slots.find(s=>s.starts_at===startsAt+86400000).id;
  await json('/api/learn/'+coaching.slug,'POST',{action:'book',slotId:nextSlotId},identities.second,409);
  db.prepare("INSERT INTO orders (id,product_id,owner,email,amount,provider,token,created_at) VALUES ('isolated-paid-rebooking',?,?,'second@example.test',1000,'stripe','isolated-rebooking-token',?)").run(coaching.id,owner,now);
  assert.equal((await json('/api/learn/'+coaching.slug,'GET',undefined,identities.second)).bookingCredits,1);
  await json('/api/learn/'+coaching.slug,'POST',{action:'book',slotId:nextSlotId},identities.second);
  const crm=await json('/api/crm');assert.equal(crm.counts.attended,1);assert.equal(crm.counts.no_shows,0);assert.equal(crm.counts.sales,1);assert.equal(crm.counts.revenue,1000);assert.ok(crm.counts.booked_leads>0);
  assert.equal((await json('/api/crm','GET',undefined,identities.outsider)).leads.length,0);
  const invitation=await json('/api/referrals','POST',{productId:guide.id,email:'partner@example.test',percent:22.5,send:true},true,201);
  assert.equal(invitation.sent,false);let token=new URL(invitation.url).pathname.split('/').pop();
  db.prepare('UPDATE referral_invites SET created_at=? WHERE id=?').run(now-120000,invitation.id);
  const replaced=await json('/api/referrals','PATCH',{action:'refresh',id:invitation.id});
  await json('/api/referrals','PATCH',{action:'accept',token},identities.partner,410);
  token=new URL(replaced.url).pathname.split('/').pop();
  await json('/api/referrals','PATCH',{action:'accept',token},identities.buyer,403);
  const accepted=await json('/api/referrals','PATCH',{action:'accept',token},identities.partner);assert.equal(accepted.percent,22.5);
  const redirect=await fetch(accepted.url,{redirect:'manual'});assert.equal(redirect.status,302);assert.match(redirect.headers.get('set-cookie'),/HttpOnly/i);
  await json('/api/referrals','PATCH',{action:'revoke',id:invitation.id},identities.partner,404);
  await json('/api/referrals','PATCH',{action:'revoke',id:invitation.id});assert.equal((await fetch(accepted.url,{redirect:'manual'})).status,404);
  const free=await json('/api/products','POST',{title:'Free creator guide',description:'A finished guide for testing the free-plan boundary.',audience:'Independent professionals',format:'Guide',price:0,generationMode:'manual'},identities.outsider);
  await upload(free.product,videoBytes,'video/mp4',identities.outsider,403);
  await json('/api/referrals','POST',{productId:free.product.id,email:'partner@example.test',percent:20},identities.outsider,403);
  await stop();await launch();assert.equal((await json('/api/learn/'+course.slug,'GET',undefined,identities.buyer)).progress.length,1);
  assert.equal((await fetch(base+'/api/uploads/'+video.id,{headers:{cookie:identities.buyer}})).status,200);
  console.log('Passed: eight distinct product formats, saved edits, template filenames, free checkout identity, member-only delivery and progress, video range/private access, VSL privacy, free-guide consent/deduplication, private discussions, booking/cancellation/attendance, CRM isolation, referral acceptance/revocation, Free-plan gates, and restart persistence. Isolated fixtures; no AI generation, email, charges, or transfers.');
} finally {await stop();storage?.close();rmSync(root,{recursive:true,force:true});}
