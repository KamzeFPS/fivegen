import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {resolve} from 'node:path';
import {createStorage} from '../runtime/render/storage.mjs';
import {fileSalePdfFixture} from './file-sale-pdf-fixture.mjs';

// The real additive SQLite migrations and private filesystem are used. Provider
// transport is synthetic; this never loads an env file or calls a payment API.
const root=resolve('outputs/file-sales-qa',randomUUID()),storage=createStorage(root),sql=storage.sqlite;
const owner='file-sale-fixture-owner',buyer={userId:'fixture-buyer',email:'buyer@example.test'},other={userId:'fixture-other',email:'other@example.test'};
let enabled=true,mode='test',configured=true,accountFailure=false,account={charges_enabled:true,payouts_enabled:true,capabilities:{card_payments:'active'}},user=null;
const sessions=new Map(),idempotency=new Map();let createCalls=0;
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
let telemetryFailure=false,publicationFailure=false;
const db=()=>({
  prepare(query){if(telemetryFailure&&query.includes('file_sale_events'))throw new Error('Synthetic telemetry write failure');return storage.DB.prepare(query);},
  batch(statements){return storage.DB.batch(publicationFailure?[...statements,storage.DB.prepare("INSERT INTO file_sale_drafts (product_id,version,data) VALUES ('missing-fixture-product',1,'{}')")]:statements);},
});
const deps={z,env:{BUCKET:storage.BUCKET},ApiError,database:db,
  binding:key=>({FIVEGEN_FILE_SALES_ENABLED:enabled?'true':'false',STRIPE_MODE:mode,STRIPE_WEBHOOK_SECRET:'whsec_fixture'})[key]||'',
  stripeConfigured:()=>configured,stripeMode:()=>mode,
  identity:async()=>{if(!user)throw new ApiError('Sign in.',401);return user;},
  ownedProduct:async(id,who)=>{const product=await db().prepare('SELECT * FROM products WHERE id=? AND owner=?').bind(id,who).first();if(!product)throw new ApiError('Product not found.',404);return product;},
  stripe:async(path,body,connected,idempotencyKey)=>{
    if(path.startsWith('accounts/')){if(accountFailure)throw new Error('sensitive provider failure');return structuredClone(account);}
    if(path==='checkout/sessions'){
      assert.equal(connected,'acct_fixture');assert.ok(idempotencyKey);
      if(idempotency.has(idempotencyKey))return structuredClone(sessions.get(idempotency.get(idempotencyKey)));
      createCalls++;const id='cs_test_'+randomUUID().replaceAll('-',''),metadata={};
      for(const [key,value] of body)if(key.startsWith('metadata['))metadata[key.slice(9,-1)]=value;
      const session={id,livemode:false,metadata,status:'open',payment_status:'unpaid',currency:'usd',mode:'payment',amount_total:Number(body.get('line_items[0][price_data][unit_amount]')),customer_details:{email:body.get('customer_email')||buyer.email,name:'Fixture buyer'},url:'https://checkout.stripe.com/c/pay/'+id};
      idempotency.set(idempotencyKey,id);sessions.set(id,session);return structuredClone(session);
    }
    if(path.startsWith('checkout/sessions/'))return structuredClone(sessions.get(path.split('/').pop()));
    throw new Error('Unexpected provider operation: '+path);
  },
  recordReferral:async()=>{},captureLead:async()=>{},planFor:async()=>({tier:'free'}),
};
async function load(path){const key='qa'+randomUUID().replaceAll('-','');globalThis[key]={...deps};const source=fs.readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;const result=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete globalThis[key];return result;}
Object.assign(deps,await load('lib/product.ts'));
Object.assign(deps,await load('lib/product-presets.ts'));
Object.assign(deps,await load('lib/file-sale-contract.ts'));
Object.assign(deps,await load('lib/credit-policy.ts'));
Object.assign(deps,{createHash});Object.assign(deps,await load('lib/upload-validation.ts'));
const sale=await load('lib/file-sales.ts');Object.assign(deps,sale);
const payments=await load('lib/payments.ts');
Object.assign(deps,payments,{failure:e=>Response.json({error:e.message},{status:e.status||500}),assertStripeMode:live=>{if(live!==false)throw new ApiError('Wrong environment.',400);}});
const webhook=await load('app/api/webhooks/stripe/route.ts');
const pdf=fileSalePdfFixture();
async function upload(productId,bytes=pdf,{mime='application/pdf',hash=true,who=owner,store=true}={}){
  const id=randomUUID(),key='private-fixtures/'+productId+'/'+id;
  if(store)await storage.BUCKET.put(key,bytes);
  sql.prepare("INSERT INTO uploads (id,owner,product_id,name,mime,size,object_key,status,sha256,created_at) VALUES (?,?,?,?,?,?,?,'completed',?,?)").run(id,who,productId,'playbook.pdf',mime,bytes.length,key,hash?createHash('sha256').update(bytes).digest('hex'):null,Date.now());return id;
}
const product=id=>sql.prepare('SELECT * FROM products WHERE id=?').get(id);
const save=(workspace,draft)=>sale.saveFileSale(workspace.product.id,owner,{expectedVersion:workspace.version,draft});
const publish=(workspace,grantModulesToExisting=[])=>sale.publishFileSale(workspace.product.id,owner,{expectedVersion:workspace.version,grantModulesToExisting});
const sessionFor=requestId=>sql.prepare('SELECT session_id FROM checkout_intents WHERE id=?').get('file_'+requestId).session_id;
const checkOut=(workspace,requestId=randomUUID())=>sale.startFileSaleCheckout(new Request('http://localhost:5184/api/file-sales/checkout'),{slug:workspace.product.slug,expectedRevisionId:workspace.publishedRevisionId,requestId,email:buyer.email});
async function complete(sessionId){const session=sessions.get(sessionId);session.payment_status='paid';session.status='complete';return payments.recordPayment(structuredClone(session),'acct_fixture');}
try{
  enabled=false;await assert.rejects(()=>sale.createFileSale(owner,{preset:'playbook'}),e=>e.status===503);enabled=true;
  mode='live';assert.equal(sale.fileSalesEnabled(),false);await assert.rejects(()=>sale.createFileSale(owner,{preset:'playbook'}),e=>e.status===503);mode='test';
  let w=await sale.createFileSale(owner,{preset:'playbook'});
  assert.equal(w.draft.modules[0].kind,'downloads');assert.equal(w.draft.modules[0].included,false);assert.equal(w.readiness.ready,false);
  assert.equal(w.readiness.payments.state,'not_connected');
  const readinessEventCount=()=>sql.prepare("SELECT COUNT(*) n FROM file_sale_events WHERE product_id=? AND event='payment_readiness_changed'").get(w.product.id).n;
  assert.equal(readinessEventCount(),1,'The first owner workspace read observes its real payment state');
  await Promise.all([sale.getFileSale(w.product.id,owner),sale.getFileSale(w.product.id,owner)]);
  assert.equal(readinessEventCount(),1,'Concurrent unchanged owner reads do not duplicate readiness events');
  await assert.rejects(()=>sale.getFileSale(w.product.id,'foreign-owner'),e=>e.status===404);
  await assert.rejects(()=>sale.createFileSale(owner,{preset:'consulting'}),e=>e.status===400);
  const createId=randomUUID();const duplicates=await Promise.all(Array.from({length:4},()=>sale.createFileSale(owner,{preset:'guide',requestId:createId})));
  assert.equal(new Set(duplicates.map(v=>v.product.id)).size,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM products WHERE id=?').get(createId).n,1);
  sql.prepare('INSERT INTO sellers (owner,name,stripe_account,created_at) VALUES (?,?,?,?)').run(owner,'Fixture studio','acct_fixture',Date.now());
  account={charges_enabled:false,payouts_enabled:false,requirements:{disabled_reason:'requirements.pending_verification'}};
  assert.equal((await sale.fileSalePaymentReadiness(owner)).state,'pending');
  assert.equal(readinessEventCount(),1,'The shared readiness helper does not mutate telemetry');
  await Promise.all([sale.getFileSale(w.product.id,owner),sale.getFileSale(w.product.id,owner)]);
  assert.equal(readinessEventCount(),2,'A genuinely changed observed state records exactly one transition');
  assert.equal(JSON.parse(sql.prepare("SELECT detail FROM file_sale_events WHERE product_id=? AND event='payment_readiness_changed' ORDER BY rowid DESC LIMIT 1").get(w.product.id).detail).state,'pending');
  account.requirements.disabled_reason='rejected.fraud';assert.equal((await sale.fileSalePaymentReadiness(owner)).state,'restricted');
  account.requirements.disabled_reason='requirements.past_due';assert.equal((await sale.fileSalePaymentReadiness(owner)).state,'incomplete');
  accountFailure=true;assert.equal((await sale.fileSalePaymentReadiness(owner)).state,'unavailable');assert.ok(!(await sale.fileSalePaymentReadiness(owner)).message.includes('sensitive'));accountFailure=false;
  configured=false;assert.equal((await sale.fileSalePaymentReadiness(owner)).state,'unconfigured');configured=true;
  account={charges_enabled:true,payouts_enabled:true,capabilities:{card_payments:'active'}};
  const first=await upload(w.product.id),unvalidated=await upload(w.product.id,pdf,{hash:false}),missing=await upload(w.product.id,pdf,{store:false}),foreign=await upload(w.product.id,pdf,{who:'foreign-owner'});
  const base={...w.draft,title:'Practical PDF Playbook',description:'A finished practical playbook for independent creators.',priceCents:1900,modules:[{kind:'downloads',name:'Your playbook',included:true,uploadIds:[first],sections:[]}]};
  await assert.rejects(()=>save(w,{...base,modules:[{...base.modules[0],uploadIds:[foreign]}]}),e=>e.status===403);
  w=await save(w,{...base,modules:[{...base.modules[0],uploadIds:[unvalidated]}]});assert.equal(w.readiness.ready,false);await assert.rejects(()=>publish(w),e=>e.status===409);
  w=await save(w,{...base,modules:[{...base.modules[0],uploadIds:[missing]}]});assert.equal(w.readiness.ready,false);
  w=await save(w,base);assert.equal(w.readiness.ready,true);
  const originalKey=sql.prepare('SELECT object_key FROM uploads WHERE id=?').get(first).object_key;
  const corruptKey=originalKey+'/corrupt-fixture';await storage.BUCKET.put(corruptKey,Buffer.alloc(pdf.length,65));
  sql.prepare('UPDATE uploads SET object_key=? WHERE id=?').run(corruptKey,first);
  await assert.rejects(()=>publish(w),e=>e.status===409,'A same-size corrupted stored file cannot be published');
  sql.prepare('UPDATE uploads SET object_key=? WHERE id=?').run(originalKey,first);
  const version=w.version;
  assert.equal((await sale.saveFileSale(w.product.id,owner,{expectedVersion:version-1,draft:base})).version,version,'A repeated successful save is idempotent');
  await assert.rejects(()=>sale.saveFileSale(w.product.id,owner,{expectedVersion:version-1,draft:{...base,title:'Conflicting tab title'}}),e=>e.status===409);
  publicationFailure=true;
  try{await assert.rejects(()=>publish(w),/FOREIGN KEY/);}finally{publicationFailure=false;}
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM file_sale_revisions WHERE product_id=?').get(w.product.id).n,0,'An actual SQLite batch failure rolls back the attempted revision');
  assert.equal(product(w.product.id).status,'draft');
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM file_sale_events WHERE product_id=? AND event='publish_failed'").get(w.product.id).n,1,'A failed atomic publication emits a truthful failure event');
  assert.deepEqual(JSON.parse(sql.prepare("SELECT detail FROM file_sale_events WHERE product_id=? AND event='publish_failed'").get(w.product.id).detail),{version,reason:'storage'});
  const publications=await Promise.all([publish(w),publish(w)]);w=publications[0];
  assert.equal(new Set(publications.map(v=>v.publishedRevisionId)).size,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM file_sale_revisions WHERE product_id=?').get(w.product.id).n,1);
  const originalRevision=w.publishedRevisionId;
  const requestId=randomUUID();await Promise.all(Array.from({length:5},()=>checkOut(w,requestId)));assert.equal(createCalls,1,'Repeated checkout requests create one provider session');
  const sessionA=sessionFor(requestId);
  await assert.rejects(()=>sale.startFileSaleCheckout(new Request('http://localhost:5184/api/file-sales/checkout'),{slug:w.product.slug,expectedRevisionId:w.publishedRevisionId,requestId,email:other.email}),e=>e.status===409);
  const beforeCourseVersion=w.version;
  w=await save(w,{...w.draft,modules:[...w.draft.modules,{kind:'course',name:'Optional course',included:false,uploadIds:[],sections:[]}]});
  assert.equal(w.publishedRevisionId,originalRevision);assert.equal(w.draft.priceCents,1900);assert.equal(w.version,beforeCourseVersion+1);
  assert.equal((await sale.getPublishedFileSale(w.product.slug)).snapshot.modules.length,1,'A newly attached Course remains private');
  assert.equal((await sale.getPublishedFileSale(w.product.slug)).readiness.ready,true,'An incomplete draft Course does not disable the live PDF');
  w=await save(w,{...w.draft,modules:w.draft.modules.map(m=>({...m,included:true}))});await assert.rejects(()=>publish(w),e=>e.status===409);
  assert.equal((await sale.getPublishedFileSale(w.product.slug)).revisionId,originalRevision);
  const course={...w.draft.modules[1],sections:[{id:randomUUID(),title:'Start here',body:'A complete first lesson with a practical exercise.'}]};
  w=await save(w,{...w.draft,modules:[w.draft.modules[0],course]});w=await publish(w);
  assert.notEqual(w.publishedRevisionId,originalRevision);
  sessions.get(sessionA).amount_total=1;await assert.rejects(()=>complete(sessionA),e=>e.status===409);sessions.get(sessionA).amount_total=1900;
  sessions.get(sessionA).livemode=true;await assert.rejects(()=>complete(sessionA),e=>e.status===403);sessions.get(sessionA).livemode=false;
  const orders=await Promise.all(Array.from({length:5},()=>complete(sessionA))),orderA=orders[0];
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders WHERE id=?').get(sessionA).n,1);
  assert.equal(orderA.sale_revision_id,originalRevision,'Completing A after publishing B must grant A');
  let access=await sale.resolveFileSaleAccess(product(w.product.id),String(orderA.token),null);
  assert.deepEqual(access.modules.map(m=>m.kind),['downloads']);assert.equal(access.uploads[0].id,first);
  const stored=await storage.BUCKET.get(sql.prepare('SELECT object_key FROM uploads WHERE id=?').get(first).object_key);
  assert.deepEqual(Buffer.from(await new Response(stored.body).arrayBuffer()),pdf,'Original PDF bytes are preserved');
  await assert.rejects(()=>sale.resolveFileSaleAccess(product(w.product.id),undefined,other),e=>e.status===403);
  await assert.rejects(()=>sale.resolveFileSaleAccess(product(w.product.id),'not-a-valid-access-link',null),e=>e.status===403);
  assert.equal((await sale.resolveFileSaleAccess(product(w.product.id),undefined,buyer)).modules.length,1,'Signed-in purchase email recovers access without email delivery');
  const second=await upload(w.product.id,fileSalePdfFixture('Updated FiveGen synthetic playbook fixture'));
  w=await save(w,{...w.draft,modules:[{...w.draft.modules[0],uploadIds:[second]},w.draft.modules[1]]});w=await publish(w);
  access=await sale.resolveFileSaleAccess(product(w.product.id),String(orderA.token),null);
  assert.deepEqual(access.modules.map(m=>m.kind),['downloads'],'PDF updates do not silently add Course');
  assert.equal(access.modules[0].uploadIds[0],second,'Existing buyers receive future PDF updates');
  assert.equal(await sale.fileSaleUploadAllowed(product(w.product.id),first,String(orderA.token),null),true,'The original purchased file remains authorized');
  assert.equal(await sale.fileSaleUploadAllowed(product(w.product.id),missing,String(orderA.token),null),false,'Unincluded draft files remain private');
  w=await save(w,{...w.draft,description:w.draft.description+' Now with an optional course.'});w=await publish(w,['course']);
  assert.deepEqual((await sale.resolveFileSaleAccess(product(w.product.id),String(orderA.token),null)).modules.map(m=>m.kind).sort(),['course','downloads'],'An explicit grant includes Course for existing buyers');
  w=await save(w,{...w.draft,modules:[w.draft.modules[0]]});w=await publish(w);
  assert.equal((await sale.resolveFileSaleAccess(product(w.product.id),String(orderA.token),null)).modules.length,2,'Hiding a feature from new offers does not revoke purchased access');
  const observedBeforePublicRead=readinessEventCount();account.charges_enabled=false;assert.equal((await sale.getPublishedFileSale(w.product.slug)).readiness.ready,false);
  assert.equal(readinessEventCount(),observedBeforePublicRead,'A public sales-page readiness check never writes owner-observation telemetry');
  await assert.rejects(()=>checkOut(w),e=>e.status===409);
  assert.ok(await sale.fileSaleUploadAllowed(product(w.product.id),first,String(orderA.token),null),'Provider revocation leaves historical access intact');
  enabled=false;assert.equal((await sale.resolveFileSaleAccess(product(w.product.id),undefined,buyer)).modules.length,2,'Feature rollback preserves buyer access');enabled=true;account.charges_enabled=true;
  await complete(sessionA);assert.equal((await sale.resolveFileSaleAccess(product(w.product.id),String(orderA.token),null)).modules.length,2,'Replayed old payment does not remove later explicit grants');
  const eventBody=JSON.stringify({id:'evt_fixture_'+randomUUID(),type:'checkout.session.completed',livemode:false,account:'acct_fixture',data:{object:sessions.get(sessionA)}}),timestamp=Math.floor(Date.now()/1000),signature=createHmac('sha256','whsec_fixture').update(`${timestamp}.${eventBody}`).digest('hex');
  const delivery=()=>new Request('http://localhost:5184/api/webhooks/stripe',{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${signature}`},body:eventBody});
  assert.equal((await webhook.POST(delivery())).status,200,'Actual raw-body webhook verifier routes a signed fixture to fulfillment');
  assert.equal((await webhook.POST(delivery())).status,200,'Duplicate webhook delivery is safe');
  assert.equal((await webhook.POST(new Request('http://localhost:5184/api/webhooks/stripe',{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${signature}`},body:eventBody+' '}))).status,400,'A tampered body is not acknowledged');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders WHERE id=?').get(sessionA).n,1);
  await sale.fileSaleEvent(w.product.id,owner,'preview_opened',{stage:'review',email:'private@example.test',token:'secret',state:'https://unsafe.example'},'safe-fixture-event');
  assert.equal(sql.prepare('SELECT detail FROM file_sale_events WHERE id=?').get('safe-fixture-event').detail,'{"stage":"review"}');
  const legacy=randomUUID();sql.prepare("INSERT INTO products (id,owner,slug,title,description,audience,format,color,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'Guide','orange',?,'published',?,?)").run(legacy,owner,'legacy-fixture','Legacy guide','Legacy content remains unchanged','Test',JSON.stringify({sections:[{title:'Original',body:'Prior content'}],benefits:[],launch:''}),Date.now(),Date.now());
  assert.equal(await sale.resolveFileSaleAccess(product(legacy),undefined,null),null,'Legacy products stay on their existing access adapter');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM file_sale_events WHERE event=? AND product_id=?').get('checkout_completed',w.product.id).n,1);
  // Each available presentation preset exercises its real supported family.
  // Legacy persisted labels have a complete adapter, including unavailable
  // service/community families; unsupported new starters remain unavailable.
  assert.deepEqual(Object.keys(deps.legacyProductFamilies).sort(),[...deps.formats].sort());
  const testedPresets=[];
  for(const preset of deps.productPresets){
    if(!preset.available){await assert.rejects(()=>sale.createFileSale(owner,{preset:preset.id}),e=>e.status===400);continue;}
    let current=await sale.createFileSale(owner,{preset:preset.id,requestId:randomUUID()});
    assert.equal(current.product.format,preset.format);assert.equal(current.draft.modules[0].kind,preset.family);
    const fixtureBytes=fileSalePdfFixture(`FiveGen ${preset.id} original document fixture`);
    const fileId=preset.family==='downloads'?await upload(current.product.id,fixtureBytes):null;
    const module={...current.draft.modules[0],included:true,uploadIds:fileId?[fileId]:[],sections:preset.family==='course'?[{id:randomUUID(),title:`First ${preset.label} lesson`,body:`A finished ${preset.label} lesson with a concrete exercise and instructions.`}]:[]};
    current=await save(current,{...current.draft,title:`Fixture ${preset.label}`,description:`A complete ${preset.label} for testing the ${preset.family} buyer experience.`,priceCents:1900,modules:[module]});
    const resumed=await sale.getFileSale(current.product.id,owner);assert.deepEqual(resumed.draft,current.draft,`${preset.id} saves and resumes`);assert.equal(resumed.readiness.ready,true);
    for(const check of resumed.readiness.checks.filter(c=>['details','downloads','course','price'].includes(c.key)))assert.doesNotMatch(check.message,/^(Add |Include at least |Finish |Set a )/,`${preset.id} ready checks describe success`);
    current=await publish(resumed);
    const preview=await sale.getPublishedFileSale(current.product.slug);assert.equal(preview.snapshot.modules.length,1);assert.equal(preview.snapshot.modules[0].kind,preset.family);
    const checkoutId=randomUUID();await checkOut(current,checkoutId);const paidOrder=await complete(sessionFor(checkoutId));
    const delivered=await sale.resolveFileSaleAccess(product(current.product.id),String(paidOrder.token),null);
    assert.equal(delivered.modules.length,1);assert.equal(delivered.modules[0].kind,preset.family,`${preset.id} delivers its intended family`);
    assert.equal((await sale.resolveFileSaleAccess(product(current.product.id),undefined,buyer)).modules[0].kind,preset.family);
    await assert.rejects(()=>sale.resolveFileSaleAccess(product(current.product.id),undefined,other),e=>e.status===403);
    if(fileId){
      assert.equal(delivered.modules[0].sections.length,0,`${preset.id} has no compulsory lesson`);
      assert.equal(await sale.fileSaleUploadAllowed(product(current.product.id),fileId,String(paidOrder.token),null),true);
      const object=await storage.BUCKET.get(sql.prepare('SELECT object_key FROM uploads WHERE id=?').get(fileId).object_key);
      assert.deepEqual(Buffer.from(await new Response(object.body).arrayBuffer()),fixtureBytes,`${preset.id} preserves original PDF bytes`);
    }else{assert.equal(delivered.modules[0].sections[0].body,module.sections[0].body);assert.equal(delivered.modules[0].uploadIds.length,0,`${preset.id} supports text lessons without requiring files or a recording`);}
    testedPresets.push(preset.id);
  }
  assert.equal(testedPresets.length,deps.productPresets.filter(p=>p.available).length);
  telemetryFailure=true;
  try{
    let isolated=await sale.createFileSale(owner,{preset:'playbook',requestId:randomUUID()});
    const id=await upload(isolated.product.id);
    isolated=await save(isolated,{...isolated.draft,title:'Telemetry unavailable fixture',description:'Saved content must survive unavailable analytics.',priceCents:1900,modules:[{...isolated.draft.modules[0],included:true,uploadIds:[id]}]});
    assert.equal(isolated.version,2,'A telemetry failure does not turn a saved draft into an error');
    isolated=await publish(isolated);assert.ok(isolated.publishedRevisionId,'A committed publication succeeds without analytics');
    const requestId=randomUUID();await checkOut(isolated,requestId);const order=await complete(sessionFor(requestId));
    assert.equal((await sale.resolveFileSaleAccess(product(isolated.product.id),String(order.token),null)).modules[0].uploadIds[0],id,'Paid access is granted even when fulfillment analytics fail');
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM file_sale_events WHERE product_id=?').get(isolated.product.id).n,0,'A failed event write is not falsely reported as recorded');
  }finally{telemetryFailure=false;}
  console.log('Passed: actual SQLite/private blob fixtures, gated test-only selling, provider readiness states, ownership, idempotent create/save/publish/checkout/payment, draft/live isolation, original-byte PDF, missing-file blocks, checkout A/publish B/completion A, future PDF updates, explicit Course grants, retained historical access, rollback, email-independent recovery, sanitized telemetry and legacy isolation.');
  console.log('Telemetry verified: observed payment-state transitions deduplicate; public reads stay read-only; atomic publication failures are recorded; analytics failures do not fail saved drafts, publications or paid fulfillment.');
  console.log('Verified preset create/save/resume/publish/synthetic-checkout/access paths: '+testedPresets.join(', ')+'. All persisted formats have an explicit legacy family adapter.');
  console.log('Provider calls were synthetic. No sandbox account, real payment, email, or production deployment was used.');
  console.log('Retained QA records: '+root);
}finally{storage.close();}
