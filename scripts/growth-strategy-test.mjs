import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createStorage } from '../runtime/render/storage.mjs';
const root=resolve('outputs/growth-strategy-qa',randomUUID()),storage=createStorage(root),db=storage.sqlite;
let owner='creator-a',mode='test',growth={updatedAt:1,brief:{story:'My real story',proof:'My evidence'},assets:null};
class ApiError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const deps={z,ApiError,database:()=>storage.DB,binding:name=>name==='STRIPE_MODE'?mode:'',
  identity:async()=>{if(!owner)throw new ApiError('Sign in',401);return {userId:owner};},
  sameOrigin:req=>{if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new ApiError('Wrong origin',403);},
  failure:e=>Response.json({error:e.message},{status:e.status||(e.issues?400:500)}),
  ownedProduct:async(id,account)=>{const row=db.prepare('SELECT * FROM products WHERE id=? AND owner=?').get(id,account);if(!row)throw new ApiError('Not found',404);return row;},
  getGrowth:async()=>structuredClone(growth),saveGrowth:async(_id,_owner,input)=>{if(input.expectedUpdatedAt!==growth.updatedAt)throw new ApiError('Stale brief',409);growth={brief:input.brief,assets:input.assets,updatedAt:growth.updatedAt+1};return growth;},
  getPublicFunnel:async slug=>{const row=db.prepare('SELECT * FROM growth_funnels WHERE slug=? AND published_at IS NOT NULL').get(slug);if(!row)throw new ApiError('Not found',404);return {productId:row.product_id,owner:row.owner,slug};},
  limitLeadCapture:async()=>{},
};
async function load(file){const key='qa'+randomUUID().replaceAll('-','');globalThis[key]={...deps};const source=fs.readFileSync(file,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;const module=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete globalThis[key];return module;}
Object.assign(deps,await load('lib/growth-funnel.ts'));
Object.assign(deps,await load('lib/offer-lab.ts'));
Object.assign(deps,await load('lib/offer-lab-server.ts'));
Object.assign(deps,await load('lib/marketing-plugins.ts'));
Object.assign(deps,await load('lib/growth-analytics.ts'));
const labRoute=await load('app/api/products/[id]/offer-lab/route.ts'),publicRoute=await load('app/api/offer-lab/respond/route.ts'),eventRoute=await load('app/api/growth/events/route.ts'),dashboardRoute=await load('app/api/growth/dashboard/route.ts');
const exportRoute=await load('app/api/products/[id]/offer-lab/export/route.ts');
const now=Date.now(),id=randomUUID(),other=randomUUID();
for(const [productId,account] of [[id,owner],[other,'creator-b']])db.prepare("INSERT INTO products(id,owner,slug,title,description,audience,format,color,content,created_at,updated_at) VALUES (?,?,?,?,?,'Designers','Video course','orange',?, ?,?)").run(productId,account,'product-'+productId,'Design mentorship','Real creator lessons',JSON.stringify({sections:[],benefits:[],launch:''}),now,now);
const ctx={params:Promise.resolve({id})},url=`https://fivegen.test/api/products/${id}/offer-lab`;
const patch=(body,headers={})=>labRoute.PATCH(new Request(url,{method:'PATCH',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),ctx);
const post=(route,path,body,headers={})=>route.POST(new Request('https://fivegen.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}));
const variant={title:'Creator mentorship',audience:'New freelance designers',outcome:'Learn a repeatable client handoff process',includes:'Two live sessions and a checklist',price:99,currency:'usd'};
const draft={question:'Which format would help you most?',problem:'Client handoffs take too long.',a:variant,b:{...variant,title:'Recorded workshop',price:49}};
try{
  let response=await labRoute.GET(new Request(url),ctx),lab=(await response.json()).lab;assert.equal(lab.revision,0);
  owner='creator-b';assert.equal((await labRoute.GET(new Request(url),ctx)).status,404);assert.equal((await exportRoute.GET(new Request(url+'/export'),ctx)).status,404);owner='';assert.equal((await labRoute.GET(new Request(url),ctx)).status,401);owner='creator-a';
  assert.equal((await patch({action:'save',expectedRevision:0,draft},{Origin:'https://evil.test'})).status,403);
  response=await patch({action:'save',expectedRevision:0,draft});assert.equal(response.status,200);lab=(await response.json()).lab;assert.equal(lab.status,'draft');
  await assert.rejects(()=>deps.publicOfferStudy(lab.slug),e=>e.status===404);
  assert.equal((await patch({action:'save',expectedRevision:0,draft})).status,409);
  response=await patch({action:'publish',expectedRevision:lab.revision});assert.equal(response.status,200);lab=(await response.json()).lab;const publishedRevision=lab.publishedRevision;
  const pub=await deps.publicOfferStudy(lab.slug);assert.equal(pub.study.a.price,99);
  const visitor=randomUUID(),input={slug:lab.slug,revision:publishedRevision,visitor,action:'visit'};
  assert.equal((await post(publicRoute,'/api/offer-lab/respond',input)).status,200);await post(publicRoute,'/api/offer-lab/respond',input);assert.equal(db.prepare('SELECT COUNT(*) n FROM offer_visitors').get().n,1);
  response=await post(publicRoute,'/api/offer-lab/respond',{...input,action:'respond',preference:'a',readiness:'interested',feedback:'Would you include a real example?',email:'Reader@example.test'});assert.equal(response.status,200);
  assert.equal((await post(publicRoute,'/api/offer-lab/respond',{...input,action:'respond',preference:'b',readiness:'ready'})).status,409);
  assert.equal((await post(publicRoute,'/api/offer-lab/respond',{...input,visitor:randomUUID(),action:'respond',preference:'b',readiness:'ready',email:'reader@example.test'})).status,409);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM growth_leads').get().n,0,'Survey contact info never grants marketing consent or enrolls leads');
  response=await patch({action:'save',expectedRevision:lab.revision,draft:{...draft,a:{...variant,price:129}}});lab=(await response.json()).lab;
  assert.equal((await deps.publicOfferStudy(lab.slug)).study.a.price,99,'Private edits preserve the public research snapshot');
  assert.equal((await patch({action:'apply',variant:'a',expectedRevision:lab.revision,expectedGrowthUpdatedAt:0})).status,409);
  response=await patch({action:'apply',variant:'a',expectedRevision:lab.revision,expectedGrowthUpdatedAt:1});assert.equal(response.status,200);assert.equal(growth.brief.story,'My real story');assert.equal(growth.brief.proof,'My evidence');assert.equal(growth.brief.icp,variant.audience);assert.match(growth.brief.offer,/129/);
  response=await patch({action:'publish',expectedRevision:lab.revision});lab=(await response.json()).lab;assert.notEqual(lab.publishedRevision,publishedRevision);assert.equal(lab.responses[0].revision,publishedRevision);assert.equal(lab.visitors,0,'A new price starts a new comparison round');
  const rounds=db.prepare('SELECT * FROM offer_rounds WHERE product_id=? ORDER BY revision').all(id);assert.equal(rounds.length,2);assert.equal(JSON.parse(rounds[0].study).a.price,99,'Earlier published prices remain in their immutable round');assert.equal(JSON.parse(rounds[1].study).a.price,129);
  const insertResponse=db.prepare('INSERT INTO offer_responses(id,product_id,owner,revision,visitor,preference,readiness,feedback,email,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
  for(let i=0;i<1005;i++)insertResponse.run(randomUUID(),id,owner,lab.publishedRevision,randomUUID(),i%2?'b':'a','interested',i===1004?'=CSV formula escaped':'bulk '+i,null,now+i);
  const counted=await deps.getOfferLab(id,owner);assert.equal(counted.responseCount,1005);assert.equal(counted.totalResponses,1006);assert.equal(counted.preferenceCounts.a,503);assert.equal(counted.preferenceCounts.b,502);assert.equal(counted.responses.length,20,'Editor returns recent responses while showing exact aggregate totals');
  const exported=await exportRoute.GET(new Request(url+'/export'),ctx);assert.equal(exported.status,200);const csv=await exported.text();assert.ok(csv.includes('"99","usd"'),'Export retains the original round price');assert.ok(csv.includes('"129","usd"'));assert.ok(csv.includes('bulk 1003'),'Stream includes rows after the first 1000');assert.ok(csv.includes("'=CSV formula escaped"));assert.equal(csv.split('\r\n').length,1008,'All 1006 responses, header and trailing newline are exported');assert.equal(exported.headers.get('cache-control'),'private, no-store');
  assert.equal((await post(publicRoute,'/api/offer-lab/respond',input)).status,409);
  response=await patch({action:'close',expectedRevision:lab.revision});lab=(await response.json()).lab;assert.equal(lab.status,'closed');await assert.rejects(()=>deps.publicOfferStudy(lab.slug),e=>e.status===404);
  for(const [productId,account] of [[id,owner],[other,'creator-b']])db.prepare('INSERT INTO growth_funnels(product_id,owner,slug,title,landing,published_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(productId,account,'product-'+productId,'My workshop','{}',now,now);
  const event={slug:'product-'+id,visitor:randomUUID(),event:'visit',campaign:'launch_week'};
  assert.equal((await post(eventRoute,'/api/growth/events',event,{Origin:'https://evil.test'})).status,403);
  assert.equal((await post(eventRoute,'/api/growth/events',{...event,campaign:'https://private.example/?email=secret'})).status,400);
  assert.equal((await post(eventRoute,'/api/growth/events',event)).status,200);await post(eventRoute,'/api/growth/events',event);await post(eventRoute,'/api/growth/events',{...event,event:'cta'});assert.equal(db.prepare('SELECT COUNT(*) n FROM growth_events').get().n,2,'Duplicate daily session events are counted once');
  await post(eventRoute,'/api/growth/events',{...event,slug:'product-'+other,visitor:randomUUID()});
  db.prepare("INSERT INTO growth_leads(id,owner,product_id,email,name,source,last_source,created_at,last_seen_at,updated_at) VALUES (?,?,?,?,?,'/g/test','/g/test',?,?,?)").run(randomUUID(),owner,id,'lead@example.test','Reader',now,now,now);
  for(const [account,productId,paymentMode,amount,currency,status] of [[owner,id,'test',9900,'usd','paid'],[owner,id,'test',5000,'eur','paid'],[owner,id,'live',99900,'usd','paid'],['creator-b',other,'test',8800,'usd','paid'],[owner,id,'test',4000,'usd','revoked']])db.prepare('INSERT INTO commerce_orders(id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),account,productId,'acct_fixture',paymentMode,'buyer@example.test',amount,currency,'Workshop',status,'hash',now,now);
  let overview=await deps.growthDashboard(owner,30);assert.equal(overview.visits,1);assert.equal(overview.clicks,1);assert.equal(overview.leads,1);assert.equal(overview.purchases,2);assert.equal(overview.revenue.find(r=>r.currency==='usd').amount,9900);assert.equal(overview.revenue.find(r=>r.currency==='eur').amount,5000);assert.equal(overview.products.length,1);assert.equal(overview.sources[0].campaign,'launch_week');assert.equal(overview.trend.reduce((n,d)=>n+d.purchases,0),2);assert.ok(overview.actions.some(a=>a.title.includes('Follow up')));
  assert.equal(overview.actions[0].href,'/?view=crm','Existing new contacts are the first follow-up task');
  const emptyOverview=await deps.growthDashboard('creator-with-no-products',30);assert.equal(emptyOverview.actions[0].href,'/?view=create','An empty workspace starts with creating a product');assert.equal(emptyOverview.products.length,0);
  mode='live';overview=await deps.growthDashboard(owner,30);assert.equal(overview.purchases,1);assert.equal(overview.revenue[0].amount,99900);mode='test';
  const firstDay=Math.floor(now/86400000)*86400000-6*86400000;
  for(const timestamp of [firstDay-1,firstDay])db.prepare('INSERT INTO growth_events(id,owner,product_id,visitor,event,campaign,day,created_at) VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),owner,id,randomUUID(),'visit','boundary',new Date(timestamp).toISOString().slice(0,10),timestamp);
  const week=await deps.growthDashboard(owner,7);assert.equal(week.visits,2,'Seven calendar days exclude the partial eighth day');assert.equal(week.trend.reduce((n,d)=>n+d.visits,0),week.visits,'Summary totals and plotted UTC days use the same boundaries');assert.equal(week.trend[0].day,new Date(firstDay).toISOString().slice(0,10));
  assert.ok(!overview.actions.some(action=>/area=(funnel|automations|campaigns|offer)/.test(action.href)),'Existing growth content never installs or recommends an optional plugin');
  const bookId=randomUUID(),extraId=randomUUID();
  for(const [productId,title] of [[bookId,'Published book without a funnel'],[extraId,'Another product']])db.prepare("INSERT INTO products(id,owner,slug,title,description,audience,format,color,content,status,created_at,updated_at) VALUES (?,?,?,?,?,'Readers','Book','orange',?,'published',?,?)").run(productId,owner,'book-'+productId,title,'A book created with the dedicated builder',JSON.stringify({sections:[],benefits:[],launch:''}),now,now);
  db.prepare('INSERT INTO product_builder_publications(product_id,owner,version,slug,public_snapshot,content_snapshot,published_at,updated_at) VALUES (?,?,1,?,?,?,?,?)').run(bookId,owner,'book-'+bookId,'{}','{}',now,now);
  let book=await deps.growthDashboard(owner,30,bookId);assert.equal(book.productId,bookId);assert.equal(book.products.length,1);assert.equal(book.products[0].published,true,'Builder publication is published without any funnel');assert.equal(book.actions.length,0,'A published book has no forced funnel or automation tasks');
  for(const [productId,campaign,amount] of [[bookId,'book_launch',1500],[extraId,'other_launch',9900]]){
    db.prepare('INSERT INTO growth_events(id,owner,product_id,visitor,event,campaign,day,created_at) VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),owner,productId,randomUUID(),'visit',campaign,new Date(now).toISOString().slice(0,10),now);
    db.prepare("INSERT INTO growth_leads(id,owner,product_id,email,name,source,last_source,created_at,last_seen_at,updated_at) VALUES (?,?,?,?,?,'/g/test','/g/test',?,?,?)").run(randomUUID(),owner,productId,'buyer-'+productId+'@example.test','Reader',now,now,now);
    const orderId=randomUUID();db.prepare("INSERT INTO commerce_orders(id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at,paid_at) VALUES (?,?,?,'acct_fixture','test','buyer@example.test',?,'usd','Book','paid','hash',?,?)").run(orderId,owner,productId,amount,now,now);
    db.prepare("INSERT INTO commerce_bookings(id,slot_id,order_id,owner,product_id,email,mode,intake,status,created_at) VALUES (?,?,?,?,?,'buyer@example.test','test','{}','confirmed',?)").run(randomUUID(),randomUUID(),orderId,owner,productId,now);
  }
  book=await deps.growthDashboard(owner,30,bookId);assert.equal(book.visits,1);assert.equal(book.leads,1);assert.equal(book.bookings,1);assert.equal(book.purchases,1);assert.equal(book.revenue[0].amount,1500);assert.deepEqual(book.sources,[{campaign:'book_launch',visits:1,clicks:0}]);assert.equal(book.trend.reduce((sum,day)=>sum+day.visits,0),1);assert.equal(book.trend.reduce((sum,day)=>sum+day.leads,0),1);assert.equal(book.trend.reduce((sum,day)=>sum+day.purchases,0),1);assert.match(book.actions[0].title,/1 new contact/);
  let scoped=await dashboardRoute.GET(new Request('https://fivegen.test/api/growth/dashboard?productId='+bookId));assert.equal(scoped.status,200);assert.equal((await scoped.json()).productId,bookId);assert.equal(scoped.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(book.salesCoverage,{source:'connected-checkout',legacyOrdersExcluded:0});
  for(const [productId,account,created] of [[bookId,owner,now],[extraId,owner,now],[bookId,owner,now-31*86400000],[other,'creator-b',now]])db.prepare("INSERT INTO orders(id,product_id,owner,email,amount,provider,token,created_at) VALUES (?,?,?,'legacy-buyer@example.test',9900,'stripe',?,?)").run(randomUUID(),productId,account,randomUUID(),created);
  const legacyBook=await deps.growthDashboard(owner,30,bookId);assert.equal(legacyBook.salesCoverage.legacyOrdersExcluded,1,'Legacy coverage counts are product/date/owner scoped');assert.equal(legacyBook.purchases,1);assert.equal(legacyBook.revenue[0].amount,1500,'Unverifiable legacy environment/refund records never inflate current paid revenue');assert.equal((await deps.growthDashboard(owner,30)).salesCoverage.legacyOrdersExcluded,2,'Global overview identifies legacy coverage without including another owner or an old period');
  assert.equal((await dashboardRoute.GET(new Request('https://fivegen.test/api/growth/dashboard?productId='+other))).status,404,'A product dashboard never reads another owner’s product');
  assert.equal((await dashboardRoute.GET(new Request('https://fivegen.test/api/growth/dashboard?productId=invalid'))).status,400);
  assert.equal((await dashboardRoute.GET(new Request('https://fivegen.test/api/growth/dashboard?productId='+randomUUID()))).status,404);
  db.prepare('INSERT INTO product_marketing_plugins(product_id,owner,installed,updated_at) VALUES (?,?,?,?)').run(bookId,owner,JSON.stringify(['funnel','automations']),now);
  book=await deps.growthDashboard(owner,30,bookId);assert.ok(book.actions.some(action=>action.href.endsWith('&area=funnel')),'An explicitly installed funnel can be reviewed');assert.ok(book.actions.some(action=>action.href.endsWith('&area=automations')),'An explicitly installed automation can be prepared');
  db.prepare('UPDATE product_marketing_plugins SET installed=? WHERE product_id=?').run('[]',bookId);book=await deps.growthDashboard(owner,30,bookId);assert.ok(!book.actions.some(action=>/area=(funnel|automations|campaigns|offer)/.test(action.href)),'Removed plugins no longer appear as recommended tasks');
  assert.equal((await dashboardRoute.GET(new Request('https://fivegen.test/api/growth/dashboard?days=999'))).status,400);owner='';assert.equal((await dashboardRoute.GET(new Request('https://fivegen.test/api/growth/dashboard'))).status,401);
  console.log('Passed: Offer Lab ownership, revisions, public snapshots, archived research rounds, exact counts and complete streamed CSV beyond1000 responses, survey dedupe/closure, no accidental marketing consent, safe VSL brief handoff, anonymous event dedupe, aligned UTC reporting windows, owner/mode/currency-isolated revenue, product-scoped dashboard auth and all metrics, builder publication without a funnel, opt-in-only marketing recommendations.');
  console.log('QA records retained: '+root);
}finally{storage.close();}
