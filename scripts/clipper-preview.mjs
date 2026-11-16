import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {resolve} from 'node:path';
import {createStorage} from '../runtime/render/storage.mjs';
import {digest} from '../runtime/render/auth.mjs';

// Local fixture only. No dotenv, production database, account, provider key,
// payment, social posting or outbound email is loaded by this harness.
assert.ok(!process.env.RENDER,'The clipping preview must run locally.');
const safeEnvironment=new Set(['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL','LC_CTYPE','TZ','SystemRoot','SYSTEMROOT','WINDIR']);
for(const key of Object.keys(process.env))if(!safeEnvironment.has(key))delete process.env[key];
const portArgument=process.argv.find(arg=>arg.startsWith('--port=')),port=portArgument?Number(portArgument.slice(7)):5286,entryPort=port+1;
assert.ok(Number.isInteger(port)&&port>=1024&&port<65535,'Use a local preview port between 1024 and 65534.');
const appOrigin=`http://localhost:${port}`,entryOrigin=`http://localhost:${entryPort}`,clipperOrigin=`http://clipper.localhost:${port}`;
const root=resolve('outputs',`clipper-preview-${Date.now()}-${randomUUID().slice(0,8)}`);
mkdirSync(root,{recursive:true});writeFileSync(resolve(root,'fixture-only.txt'),'FiveGen Clipper synthetic preview v1\nAll users, campaigns, views, money and submissions are local synthetic fixtures. No external effects.\n');
Object.assign(process.env,{NODE_ENV:'production',FIVEGEN_RUNTIME:'render',FIVEGEN_DATA_DIR:root,APP_ORIGIN:appOrigin,CLIPPER_ORIGIN:clipperOrigin,DOCS_ORIGIN:'',PORT:String(port),ADMIN_USER_IDS:'clipper-preview-admin',ADMIN_EMAILS:'',GOOGLE_CLIENT_ID:'synthetic-clipper-preview',GOOGLE_CLIENT_SECRET:'synthetic-clipper-preview',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),RENDER_EXTERNAL_URL:'',PRODUCT_DOMAIN:'',STRIPE_MODE:'test',STRIPE_COMMERCE_ENABLED:'false',STRIPE_WALLET_CHECKOUT_ENABLED:'false',PADDLE_ENVIRONMENT:'sandbox',AUTOMATIONS_WORKER_ENABLED:'false',PURCHASE_EMAILS_WORKER_ENABLED:'false',PRODUCT_REMINDERS_WORKER_ENABLED:'false',SERVICE_INTEGRATIONS_WORKER_ENABLED:'false'});

const local=host=>['localhost','127.0.0.1','[::1]','::1','clipper.localhost'].includes(host),originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  assert.ok(local(url.hostname),'External network is disabled in the synthetic clipping preview.');
  return originalFetch(input,options);
};
const require=createRequire(import.meta.url);
for(const name of ['node:http','node:https']){
  const transport=require(name);
  for(const operation of ['request','get']){
    const original=transport[operation];
    transport[operation]=function(input,...args){
      let host=typeof input==='string'||input instanceof URL?new URL(input).hostname:String(input?.hostname||input?.host||'localhost');
      host=host.startsWith('[')?host.slice(0,host.indexOf(']')+1):host.split(':')[0];
      assert.ok(local(host),'External HTTP(S) is disabled in the synthetic clipping preview.');
      return original.call(this,input,...args);
    };
  }
}
syncBuiltinESMExports();

const storage=createStorage(root),db=storage.sqlite,now=Date.now(),terms=readFileSync('lib/terms.ts','utf8').match(/TERMS_VERSION='([^']+)'/)[1];
const people={admin:{id:'clipper-preview-admin',name:'Тэмүүлэн · Admin',email:'admin@example.test',token:randomBytes(32).toString('base64url')},member:{id:'clipper-preview-member',name:'Ану · Creator',email:'creator@example.test',token:randomBytes(32).toString('base64url')}};
for(const person of Object.values(people)){
  db.prepare('INSERT INTO render_sessions VALUES(?,?,?,?,?)').run(digest(person.token),person.id,person.email,person.name,now+86400000);
  db.prepare('INSERT INTO terms_acceptances VALUES(?,?,?,?,?)').run(randomUUID(),person.id,terms,person.email,now);
  db.prepare('INSERT INTO clipper_profiles VALUES(?,?,?,?,?)').run(person.id,person.name,JSON.stringify({tiktok:'https://www.tiktok.com/@synthetic_preview',instagram:'https://www.instagram.com/synthetic_preview/',youtube:'https://www.youtube.com/@synthetic_preview'}),now,now);
}
const campaigns=[
  {id:randomUUID(),title:{mn:'Том санааг богино клип болго.',en:'Big ideas. Your next great clip.'},description:{mn:'Сонирхолтой ярианы шилдэг мөчийг өөрийн өнцгөөр хүргээрэй.',en:'Turn the best moments from a thoughtful conversation into a fresh perspective.'},brand:'FRAME STUDIO',category:'Podcast',platforms:['tiktok','instagram','youtube'],model:'cpm',currency:'USD',rate:350,min:500,max:5000,budget:25000,status:'active'},
  {id:randomUUID(),title:{mn:'Хотын хэмнэлийг өөрөөр харуул.',en:'Find the rhythm of the city.'},description:{mn:'Өдөр тутмын амьдралын энгийн мөчөөс өөрийн түүхийг бүтээгээрэй.',en:'Find an original story in the everyday moments around you.'},brand:'URBAN STORIES',category:'Lifestyle',platforms:['tiktok','instagram'],model:'cpm',currency:'MNT',rate:150000,min:100000,max:5000000,budget:60000000,status:'active'},
  {id:randomUUID(),title:{mn:'Бүтээгчийн нэг өдөр.',en:'A day in the creator’s world.'},description:{mn:'Өөрийн бүтээх явцыг богино, сонирхолтой клипээр хуваалцаарай.',en:'Share the process behind your next idea in a short, memorable clip.'},brand:'CREATOR LAB',category:'UGC',platforms:['instagram','youtube'],model:'per_post',currency:'USD',rate:1200,min:1200,max:1200,budget:120000,status:'active'},
  {id:randomUUID(),title:{mn:'Дараагийн шинэ түүх.',en:'The next story starts here.'},description:{mn:'Админы хянаж буй орон нутгийн туршилтын ноорог.',en:'An unpublished local preview draft for the administrator.'},brand:'STORY LAB',category:'Clipping',platforms:['tiktok'],model:'cpm',currency:'USD',rate:200,min:100,max:2000,budget:30000,status:'draft'},
];
for(const [index,c] of campaigns.entries()){
  const brief={mn:'Энэ нь зөвхөн локал загварын туршилт. Бүх хэрэглэгч, үзэлт, мөнгөн дүн хийсвэр. Бодит клип нийтлэх, төлбөр хийхгүй.',en:'Local preview only. All people, views and reward amounts are synthetic. Do not publish real clips or make payments.'};
  const rules={mn:'Туршилтын контент. Бодит кампанит ажил биш. Эх материалын зөвшөөрөл болон сонгосон платформын дүрмийг баримтал.',en:'Synthetic preview content, not a real campaign. Real campaigns require source permissions and compliance with the selected platform rules.'};
  db.prepare('INSERT INTO clipper_campaigns(id,title,description,brief,rules,brand,category,platforms,reward_model,currency,rate,min_payout,max_payout,budget,starts_at,ends_at,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(c.id,JSON.stringify(c.title),JSON.stringify(c.description),JSON.stringify(brief),JSON.stringify(rules),c.brand,c.category,JSON.stringify(c.platforms),c.model,c.currency,c.rate,c.min,c.max,c.budget,now-86400000,now+(index+7)*86400000,c.status,people.admin.id,now-index*3600000,now);
}
for(const person of Object.values(people))db.prepare('INSERT INTO clipper_memberships VALUES(?,?,?)').run(campaigns[0].id,person.id,now-3600000);
db.prepare('INSERT INTO clipper_memberships VALUES(?,?,?)').run(campaigns[1].id,people.member.id,now-1800000);
const insertSubmission=(campaignId,owner,platform,url,status,views,reward,note,offset)=>{
  const id=randomUUID(),person=Object.values(people).find(p=>p.id===owner);
  const parsed=new URL(url),mediaId=platform==='tiktok'?parsed.pathname.match(/\/video\/(\d+)$/)?.[1]:platform==='instagram'?parsed.pathname.match(/^\/(?:p|reel)\/([A-Za-z0-9_-]+)\/$/)?.[1]:parsed.searchParams.get('v');
  assert.ok(mediaId,'Synthetic submissions need a stable platform media identity.');
  db.prepare('INSERT INTO clipper_submissions(id,campaign_id,owner,display_name,platform,url,post_key,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,campaignId,owner,person.name,platform,url,platform+':'+mediaId,now-offset);
  if(status!=='pending')db.prepare('UPDATE clipper_submissions SET status=?,verified_views=?,reward=?,review_note=?,reviewed_at=?,reviewed_by=? WHERE id=?').run(status,views,reward,note,now-600000,people.admin.id,id);
};
insertSubmission(campaigns[0].id,people.member.id,'tiktok','https://www.tiktok.com/@synthetic_preview/video/9000000000000000001','approved',32000,5000,'Туршилтын зөвшөөрсөн клип. Synthetic approval; no payment.',10800000);
insertSubmission(campaigns[0].id,people.member.id,'instagram','https://www.instagram.com/reel/SyntheticPreview_2/','pending',0,0,'',3600000);
insertSubmission(campaigns[0].id,people.member.id,'youtube','https://www.youtube.com/watch?v=PreviewQA01','rejected',0,0,'Туршилтын тайлбар: бичлэгийн эх сурвалжийн холбоосыг нэмээрэй.',7200000);
insertSubmission(campaigns[1].id,people.member.id,'tiktok','https://www.tiktok.com/@synthetic_preview/video/9000000000000000004','pending',0,0,'',1800000);
storage.close();

const {start}=await import('../runtime/render/server.mjs');const app=await start();
const entry=createServer((req,res)=>{
  if(req.headers.host!==`localhost:${entryPort}`||req.method!=='GET'){res.writeHead(404);res.end('Local synthetic preview only.');return;}
  const url=new URL(req.url,entryOrigin);
  if(url.pathname==='/__clipper_preview'){
    const role=url.searchParams.get('role')==='member'?'member':'admin',lang=url.searchParams.get('lang')==='en'?'en':'mn';
    res.writeHead(303,{'Cache-Control':'no-store','Set-Cookie':`fivegen-local-session=${people[role].token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,Location:appOrigin+(role==='admin'?'/clipper/admin':'/clipper/app')+'?lang='+lang});res.end();return;
  }
  if(url.pathname!=='/'){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Clipper local preview</title><body style="max-width:680px;margin:10vh auto;padding:24px;font:16px/1.6 system-ui"><h1>FiveGen Clipper · Local preview</h1><p>Isolated synthetic campaigns and accounts. No external requests, posts, emails or payments.</p><p><a href="/__clipper_preview?role=admin&lang=mn">Admin · Монгол</a> · <a href="/__clipper_preview?role=admin&lang=en">Admin · English</a></p><p><a href="/__clipper_preview?role=member&lang=mn">Creator · Монгол</a> · <a href="/__clipper_preview?role=member&lang=en">Creator · English</a></p><p><a href="'+appOrigin+'/clipper?lang=mn">Landing · Монгол</a> · <a href="'+appOrigin+'/clipper?lang=en">Landing · English</a></p></body></html>');
});
await new Promise((done,reject)=>{entry.once('error',reject);entry.listen(entryPort,'127.0.0.1',done);});
const info={synthetic:true,harness:'clipper-preview-v1',externalEffects:false,dataRoot:root,entryURL:entryOrigin+'/',adminURL:entryOrigin+'/__clipper_preview?role=admin&lang=mn',memberURL:entryOrigin+'/__clipper_preview?role=member&lang=mn',landingURL:appOrigin+'/clipper?lang=mn',clipperHostURL:clipperOrigin+'/?lang=mn',appOrigin};
writeFileSync(resolve(root,'preview-info.json'),JSON.stringify(info,null,2));
const check=await fetch(appOrigin+'/api/clipper',{headers:{Cookie:`fivegen-local-session=${people.member.token}`}}),state=await check.json();
assert.equal(check.status,200);assert.equal(state.campaigns.length,3);assert.equal(state.submissions.length,4);assert.equal(state.memberships.length,2);
console.log('Synthetic Clipper preview ready: '+info.entryURL);
console.log(JSON.stringify(info));
if(process.argv.includes('--check')){
  await new Promise(done=>entry.close(done));await new Promise(done=>{app.server.close(done);app.server.closeIdleConnections();});app.storage.close();
}
