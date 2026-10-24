import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import ts from 'typescript';
import {z} from 'zod';
import {unzipSync} from 'fflate';
import {createStorage} from '../runtime/render/storage.mjs';
import {fileSalePdfFixture} from './file-sale-pdf-fixture.mjs';
import {approveCurrentEditorialForFixture} from './product-editorial-fixture.mjs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Execute the actual builder services against the additive production migrations
// and private storage. No env file, real identity, provider call or email is used.
// All synthetic state is retained for investigation.
const root=resolve('outputs/product-builder-qa',randomUUID()),storage=createStorage(root),sql=storage.sqlite;
const owner='builder-qa-owner',outsider='builder-qa-outsider';
let providerCalls=0;
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const deps={
 z,createHash,unzipSync,ApiError,env:{BUCKET:storage.BUCKET},database:()=>storage.DB,
 binding:name=>name==='STRIPE_MODE'?'test':'',
 identity:async()=>({userId:owner,email:'builder-fixture@example.test'}),
 sameOrigin:()=>{},
 failure:error=>Response.json({error:error.message},{status:error.status||400}),
 ownedProduct:async(id,who)=>{const row=await storage.DB.prepare('SELECT * FROM products WHERE id=? AND owner=?').bind(id,who).first();if(!row)throw new ApiError('Product not found.',404);return row;},
 Stripe:class{constructor(){providerCalls++;throw new Error('The fixture must never construct a payment client.');}},
 enrollAutomationPurchase:async()=>{throw new Error('The fixture must never send or enroll in email.');},
};
async function load(path,selectedExports){
 const key='builderQa'+randomUUID().replaceAll('-','');globalThis[key]={...deps};
 let source=readFileSync(path,'utf8');
 if(selectedExports){const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);source=parsed.statements.filter(statement=>ts.isFunctionDeclaration(statement)&&selectedExports.includes(statement.name?.text)).map(statement=>statement.getText(parsed)).join('\n');assert.ok(source,'Actual source exports are present');}
 else source=source.replace(/^import[\s\S]*?;\r?\n/gm,'');
 const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 const result=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete globalThis[key];return result;
}
for(const path of ['lib/commerce.ts','lib/experience.ts','lib/product-curriculum.ts','lib/product-decision-contract.ts','lib/product-community-tier-contract.ts','lib/product-community-tiers.ts','lib/product-studio-contract.ts','lib/product-document-archive.ts','lib/product.ts','lib/commerce-v2.ts','lib/creator-plans.ts','lib/creator-plan-server.ts','lib/builder-contract.ts','lib/builder-assistant-contract.ts','lib/builder-revision-contract.ts','lib/product-readiness.ts','lib/builder-publication-contract.ts','lib/upload-validation.ts','lib/builder-delivery-server.ts','lib/service-integrations-crypto.ts','lib/service-integrations-oauth.ts','lib/service-integrations-server.ts','lib/commerce-v2-server.ts','lib/product-service-fulfillment.ts','lib/product-studio-commerce.ts'])Object.assign(deps,await load(path));
Object.assign(deps,await load('lib/server.ts',['productFromRow']));
for(const path of ['lib/product-editorial-review.ts','lib/product-editorial-review-server.ts'])Object.assign(deps,await load(path));
for(const path of ['lib/creator-voice.ts','lib/creator-voice-server.ts','lib/creator-context-contract.ts','lib/creator-context-server.ts'])Object.assign(deps,await load(path));
const builder=await load('lib/product-builder-server.ts');Object.assign(deps,builder);
const publication=await load('lib/product-builder-publication.ts');Object.assign(deps,publication);
async function reviewedPublish(id,who,input){await approveCurrentEditorialForFixture(deps,id,who);return publication.publishBuilderProduct(id,who,input);}
const legacyDownload=await load('app/api/download/[slug]/route.ts'),legacyOffers=await load('lib/offers-server.ts'),uploadRoute=await load('app/api/uploads/[id]/route.ts');
const coverRoute=await load('app/api/builder-cover/[slug]/route.ts');

async function upload(productId,{who=owner,mime='application/pdf',bytes=fileSalePdfFixture('Builder original PDF'),name='original.pdf',status='completed',hash=true,key}={}){
 const id=randomUUID(),objectKey=key||`builder-fixtures/${productId}/${id}`;
 await storage.BUCKET.put(objectKey,bytes);
 sql.prepare('INSERT INTO uploads (id,owner,product_id,name,mime,size,object_key,status,sha256,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,who,productId,name,mime,bytes.length,objectKey,status,hash?createHash('sha256').update(bytes).digest('hex'):null,Date.now(),Date.now());
 return id;
}
const save=(workspace,draft,who=owner)=>builder.saveBuilderWorkspace(workspace.product.id,who,{expectedVersion:workspace.version,draft});
const section=(name='A finished resource')=>({id:randomUUID(),title:name,body:'PRIVATE CONTENT: A specific process with concrete preparation, a worked example, practical steps and a complete exercise.'});
function completeDraft(workspace){
 const draft=structuredClone(workspace.draft),info=deps.builderTypeDetails[draft.type];
 Object.assign(draft,{title:`Specific ${info.name} for freelance designers`,description:'A practical original resource helping freelance designers complete a defined customer project.',audience:'Freelance designers preparing their first client project',priceCents:1900});
 Object.assign(draft.fields,{outcome:'Complete a scoped client project with clear next actions',serviceScope:'One 45 minute portfolio review and a written action plan',preparation:'Bring one portfolio and a specific question',memberPromise:'Members exchange a weekly practical critique',welcome:'Welcome to our weekly portfolio practice group.',rules:'Respect privacy, be constructive and stay on topic.',compatibleTools:'Any text editor',usageInstructions:'Copy the template, replace example values and follow its field instructions.'});
 draft.sections=[section(`${info.unit} one`)];
 if(info.family==='templates')draft.files=[{name:'project-template.csv',content:'Task,Owner,Status\nBrief,Creator,Pending\n',description:'An editable client project template'}];
 return draft;
}
function publishedReady(workspace,label){assert.equal(workspace.readiness.publishReady,true,label+': '+workspace.readiness.checks.filter(check=>!check.ready).map(check=>check.message).join('; '));}
try{
 assert.equal(deps.builderTypes.length,11,'All supported product types have a builder');
 const workspaces=[];
 for(const type of deps.builderTypes){
  const requestId=randomUUID();let workspace=await builder.createBuilderWorkspace(owner,{type,source:'manual',requestId});
  assert.equal(workspace.draft.type,type);assert.equal(workspace.draft.source,'manual');assert.equal(workspace.publication,null);assert.equal(workspace.selling,false);
  assert.equal(workspace.readiness.publishReady,false,`${type}: blank products cannot publish`);
  const duplicate=await builder.createBuilderWorkspace(owner,{type,source:'manual',requestId});assert.equal(duplicate.product.id,workspace.product.id,`${type}: retry reuses the same product`);
  const initialVersion=workspace.version,draft=completeDraft(workspace);workspace=await save(workspace,draft);
  assert.ok(workspace.version>initialVersion,`${type}: edited draft advances its version`);
  const resumed=await builder.getBuilderWorkspace(workspace.product.id,owner);assert.deepEqual(resumed.draft,draft,`${type}: the exact type-specific draft resumes`);
  publishedReady(resumed,type);assert.equal(resumed.payments.ready,false,`${type}: publication can be ready before payments`);assert.equal(resumed.selling,false);
  await assert.rejects(()=>builder.getBuilderWorkspace(workspace.product.id,outsider),e=>e.status===404,`${type}: ownership prevents another user reading the builder`);
  await assert.rejects(()=>save(workspace,draft,outsider),e=>e.status===404,`${type}: ownership prevents another user editing the builder`);
  await assert.rejects(()=>builder.saveBuilderWorkspace(workspace.product.id,owner,{expectedVersion:initialVersion,draft:{...draft,title:'A conflicting title'}}),e=>e.status===409,`${type}: a stale tab cannot overwrite saved work`);
  // The service and community builders do not require pretend lessons or an
  // uploaded PDF to publish their complete, relevant service/member details.
  if(['consulting','coaching','community'].includes(type)){workspace=await save(workspace,{...workspace.draft,sections:[]});publishedReady(workspace,`${type} without forced lessons`);}
  workspaces.push(workspace);
 }
 // A finished existing document is the product. No dummy chapters/lessons are
 // required to turn an original PDF into a publishable book, guide or playbook.
 for(const type of ['book','guide','playbook','template-kit']){
  let workspace=await builder.createBuilderWorkspace(owner,{type,source:'upload',requestId:randomUUID()});const original=await upload(workspace.product.id);
  const draft=completeDraft(workspace);Object.assign(draft,{sections:[],files:[],uploadIds:[original]});workspace=await save(workspace,draft);
  assert.equal(workspace.draft.sections.length,0);publishedReady(workspace,`${type} original upload`);
  if(type==='book')await assert.rejects(()=>publication.publishBuilderProduct(workspace.product.id,owner,{expectedVersion:workspace.version}),error=>error.status===409&&/editorial review/i.test(error.message),'A complete product still needs a deliberate version-bound editorial review');
  workspace=await reviewedPublish(workspace.product.id,owner,{expectedVersion:workspace.version});
  const purchasedPresentation=(await deps.builderPublishedDelivery(workspace.product.id)).snapshot;
  assert.equal(purchasedPresentation.builderType,type,'Published delivery freezes the dedicated builder type');
  assert.equal(purchasedPresentation.description,workspace.draft.description,'Published delivery includes the reviewed product description');
  assert.equal(purchasedPresentation.usageInstructions,workspace.draft.fields.usageInstructions,'Buyer instructions survive publication serialization');
  const publicPage=await publication.getPublicBuilderProduct(workspace.product.slug);assert.equal(JSON.stringify(publicPage).includes(original),false,`${type}: the original file identity is private`);
  const missingDraft={...workspace.draft,uploadIds:[]};const missing=await save(workspace,missingDraft);assert.equal(missing.readiness.publishReady,false,`${type}: removing its sole original blocks publication`);
 }
 for(const type of ['mini-course','video-course']){
  let workspace=await builder.createBuilderWorkspace(owner,{type,source:'upload',requestId:randomUUID()});
  const recording=await upload(workspace.product.id,{mime:'video/mp4',name:'lesson.mp4',bytes:Buffer.from('synthetic completed private recording')});
  const draft=completeDraft(workspace);draft.sections=[{id:randomUUID(),title:'A recorded practical lesson',body:'',videoId:recording}];workspace=await save(workspace,draft);publishedReady(workspace,`${type}: a completed recording needs no placeholder lesson text`);
  workspace=await reviewedPublish(workspace.product.id,owner,{expectedVersion:workspace.version});assert.equal(JSON.stringify(await publication.getPublicBuilderProduct(workspace.product.slug)).includes(recording),false,'Private lesson recording IDs never appear publicly');
  const unfinished=await save(workspace,{...workspace.draft,sections:[{...workspace.draft.sections[0],videoId:undefined}]});assert.equal(unfinished.readiness.publishReady,false,'A lesson without a recording or text blocks publication');
 }
 // Structural upload completion is not enough: missing hashes and corrupted
 // stored bytes must stop publication while preserving the editable draft.
 let integrity=await builder.createBuilderWorkspace(owner,{type:'book',source:'upload',requestId:randomUUID()});
 const unhashed=await upload(integrity.product.id,{hash:false});integrity=await save(integrity,{...completeDraft(integrity),sections:[],files:[],uploadIds:[unhashed]});assert.equal(integrity.readiness.publishReady,false,'An unverified older upload cannot publish');
 await assert.rejects(()=>publication.publishBuilderProduct(integrity.product.id,owner,{expectedVersion:integrity.version}),e=>e.status===409,'Publishing refuses an unverified upload');
 const valid=await upload(integrity.product.id);integrity=await save(integrity,{...integrity.draft,uploadIds:[valid]});publishedReady(integrity,'Valid original before integrity corruption');
 const stored=sql.prepare('SELECT object_key,size FROM uploads WHERE id=?').get(valid),corruptKey=`builder-fixtures/corrupt/${randomUUID()}`;
 // Use a separate fixture object: Windows may still be closing a canceled
 // readiness stream. Real uploads use immutable keys, so never overwrite it.
 await storage.BUCKET.put(corruptKey,Buffer.alloc(stored.size,120));sql.prepare('UPDATE uploads SET object_key=? WHERE id=?').run(corruptKey,valid);
 await assert.rejects(()=>publication.publishBuilderProduct(integrity.product.id,owner,{expectedVersion:integrity.version}),e=>e.status===409,'Same-size corruption is detected by the publication hash check');
 assert.equal((await builder.getBuilderWorkspace(integrity.product.id,owner)).publication,null,'Failed integrity verification creates no public page');
 // A whole drafting stub is not finished content. Explanatory code markers
 // and intentional reusable template fields are still valid content.
 let placeholder=await builder.createBuilderWorkspace(owner,{type:'book',source:'manual',requestId:randomUUID()});
 placeholder=await save(placeholder,{...completeDraft(placeholder),sections:[{id:randomUUID(),title:'The first real chapter',body:'[Insert chapter content here]'}]});
 assert.equal(placeholder.readiness.publishReady,false,'Obvious whole-chapter placeholders block publication on the server');
 await assert.rejects(()=>publication.publishBuilderProduct(placeholder.product.id,owner,{expectedVersion:placeholder.version}),e=>e.status===409,'A client cannot bypass the placeholder check');
 placeholder=await save(placeholder,{...placeholder.draft,sections:[{...placeholder.draft.sections[0],body:'This lesson explains how TODO comments work in a real code review. Use one to record a specific deferred task, then include the issue reference and responsible owner.'}]});publishedReady(placeholder,'Explanatory TODO discussion');
 let templatePlaceholder=await builder.createBuilderWorkspace(owner,{type:'template-kit',source:'manual',requestId:randomUUID()});templatePlaceholder=await save(templatePlaceholder,{...completeDraft(templatePlaceholder),files:[{name:'client-template.md',description:'A reusable client brief',content:'[insert content]'}]});publishedReady(templatePlaceholder,'Intentional reusable template placeholders');
 // The AI source follows the same editing contract. This never invokes an AI
 // provider; it verifies reviewed AI output can be saved and resumed normally.
 let ai=await builder.createBuilderWorkspace(owner,{type:'book',source:'ai',requestId:randomUUID()});ai=await save(ai,completeDraft(ai));publishedReady(ai,'Reviewed AI manuscript');assert.equal(ai.draft.source,'ai');
 // Generation is staged separately from the builder. Editing metadata after a
 // completed run must not erase the result before the creator chooses Apply.
 const existingOriginal=await upload(ai.product.id);ai=await save(ai,{...ai.draft,uploadIds:[existingOriginal]});
 const generatedSections=[{id:randomUUID(),title:'The completed generated chapter',body:'COMPLETE GENERATED RESULT: An original practical chapter that must survive manual metadata saves.'}],generatedFiles=[{name:'ai-workbook.md',content:'# A complete original workbook\n\nA usable exercise.',description:'The generated exercise workbook'}];
 const generatedContent={sections:generatedSections,files:generatedFiles,benefits:['A specific practical outcome'],launch:'An honest launch draft'};
 sql.prepare('UPDATE products SET content=? WHERE id=? AND owner=?').run(JSON.stringify(generatedContent),ai.product.id,owner);
 sql.prepare("INSERT INTO generation (product_id,owner,brief,stage,status,lease,updated_at) VALUES (?,?,?,3,'completed',0,?)").run(ai.product.id,owner,JSON.stringify(deps.builderBrief(ai.draft)),Date.now());
 const beforeMetadata=ai.version,originalDraftSections=structuredClone(ai.draft.sections);ai=await save(ai,{...ai.draft,title:'The creator’s revised book title'});
 assert.deepEqual(ai.draft.sections,originalDraftSections,'The original draft remains editable before Apply');
 const frozen=JSON.parse(sql.prepare('SELECT brief FROM generation WHERE product_id=?').get(ai.product.id).brief).builderResult;assert.deepEqual(frozen.sections,generatedSections,'A metadata save retains the completed AI result independently');
 await assert.rejects(()=>builder.syncGeneratedBuilderContent(ai.product.id,owner,beforeMetadata),e=>e.status===409,'A stale generation review cannot replace newer edits');
 ai=await builder.syncGeneratedBuilderContent(ai.product.id,owner,ai.version);assert.deepEqual(ai.draft.sections,generatedSections);assert.deepEqual(ai.draft.files,generatedFiles);assert.deepEqual(ai.draft.uploadIds,[existingOriginal]);assert.equal(ai.draft.title,'The creator’s revised book title','Applying generated content keeps the creator’s metadata');
 for(let index=0;index<workspaces.length;index++){
  let workspace=workspaces[index],type=workspace.draft.type;
  workspace=await reviewedPublish(workspace.product.id,owner,{expectedVersion:workspace.version});
  assert.equal(workspace.product.status,'published',`${type}: the page publishes without connected payments`);
  assert.equal(workspace.selling,false,`${type}: publishing never enables selling`);
  assert.equal(workspace.publication.version,workspace.version);
  const publicPage=await publication.getPublicBuilderProduct(workspace.product.slug),json=JSON.stringify(publicPage);
  assert.equal(publicPage.selling,false);assert.equal(publicPage.snapshot.title,workspace.draft.title);
  assert.equal(json.includes('PRIVATE CONTENT'),false,`${type}: public pages never contain lesson/chapter bodies`);
  assert.equal(Object.hasOwn(publicPage.snapshot,'sections'),false);assert.equal(Object.hasOwn(publicPage.snapshot,'uploadIds'),false);assert.equal(Object.hasOwn(publicPage.snapshot,'meetingUrl'),false);
  sql.prepare('UPDATE product_editorial_reviews SET approved_at=NULL WHERE product_id=?').run(workspace.product.id);
  const again=await publication.publishBuilderProduct(workspace.product.id,owner,{expectedVersion:workspace.version});assert.equal(again.publication.version,workspace.version,`${type}: retrying publication is idempotent`);
  await assert.rejects(()=>publication.publishBuilderProduct(workspace.product.id,outsider,{expectedVersion:workspace.version}),e=>e.status===404,`${type}: another user cannot publish the page`);
  await assert.rejects(()=>publication.setBuilderSelling(workspace.product.id,owner,{enabled:true,expectedVersion:workspace.version}),e=>[409,503].includes(e.status),`${type}: selling stays blocked without payments`);
  assert.equal((await publication.getPublicBuilderProduct(workspace.product.slug)).selling,false);
  workspaces[index]=workspace;
 }
 // A draft edit cannot leak into the previously published offer. Publication
 // checks the draft version, and the creator must deliberately publish changes.
 let revised=workspaces[0],oldTitle=revised.draft.title,oldVersion=revised.version;
 revised=await save(revised,{...revised.draft,title:'An edited book that is still private'});
 assert.equal((await publication.getPublicBuilderProduct(revised.product.slug)).snapshot.title,oldTitle);
 await assert.rejects(()=>publication.publishBuilderProduct(revised.product.id,owner,{expectedVersion:oldVersion}),e=>e.status===409,'A stale review cannot publish a newer draft');
 await assert.rejects(()=>publication.setBuilderSelling(revised.product.id,owner,{enabled:true,expectedVersion:revised.version}),e=>e.status===409,'Unpublished edits cannot start selling');
 revised=await reviewedPublish(revised.product.id,owner,{expectedVersion:revised.version});assert.equal((await publication.getPublicBuilderProduct(revised.product.slug)).snapshot.title,revised.draft.title);
 // Publishing a complete free-to-preview page is independent of entering an
 // offer price. It never turns this page into free access to private content.
 let noPrice=await builder.createBuilderWorkspace(owner,{type:'guide',source:'manual',requestId:randomUUID()});noPrice=await save(noPrice,{...completeDraft(noPrice),priceCents:0});noPrice=await reviewedPublish(noPrice.product.id,owner,{expectedVersion:noPrice.version});assert.equal(noPrice.selling,false);assert.equal((await publication.getPublicBuilderProduct(noPrice.product.slug)).snapshot.priceCents,0);
 await assert.rejects(()=>publication.setBuilderSelling(noPrice.product.id,owner,{enabled:true,expectedVersion:noPrice.version}),undefined,'A page without an offer price cannot start selling');
 assert.equal(sql.prepare('SELECT COUNT(*) count FROM commerce_offers WHERE product_id=? AND enabled=1').get(noPrice.product.id).count,0);
 const legacyResponse=await legacyDownload.GET(new Request(`http://localhost/api/download/${noPrice.product.slug}`),{params:Promise.resolve({slug:noPrice.product.slug})});assert.equal(legacyResponse.status,403,'A published zero-price builder cannot expose private content through the historical free download route');
 await assert.rejects(()=>legacyOffers.quoteProduct(noPrice.product.slug),e=>e.status===409,'The historical free checkout cannot quote a builder product');
 // Creator voice material and another product's uploads cannot be attached.
 let secure=revised,foreign=await upload(workspaces[1].product.id),voice=await upload(secure.product.id,{key:`voice/${randomUUID()}`});
 await assert.rejects(()=>save(secure,{...secure.draft,uploadIds:[foreign]}),e=>e.status===403,'Foreign product files are rejected');
 await assert.rejects(()=>save(secure,{...secure.draft,uploadIds:[voice]}),e=>e.status===403,'Private creator voice files stay excluded');
 const retained=await upload(secure.product.id),deleted=await uploadRoute.DELETE(new Request(`http://localhost/api/uploads/${retained}`,{method:'DELETE'}),{params:Promise.resolve({id:retained})});assert.equal(deleted.status,409,'Builder upload objects are retained for published and purchased versions');assert.ok(sql.prepare('SELECT id FROM uploads WHERE id=?').get(retained));
 // Purchased legacy products stay in their original fulfillment path. Merely
 // opening the new editor must never change a customer's existing entitlement.
 for(const purchasePath of ['legacy','commerce']){
  const id=randomUUID(),slug=`purchased-${purchasePath}-${id.slice(0,8)}`;
  sql.prepare('INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) SELECT ?,owner,?,title,description,audience,format,price,color,content,status,created_at,updated_at FROM products WHERE id=?').run(id,slug,secure.product.id);
  if(purchasePath==='legacy')sql.prepare('INSERT INTO orders (id,product_id,owner,email,amount,provider,token,created_at) VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),id,owner,'legacy-buyer@example.test',1900,'stripe',randomUUID(),Date.now());
  else sql.prepare("INSERT INTO commerce_orders (id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at) VALUES (?,?,?,'acct_fixture','test','commerce-buyer@example.test',1900,'usd','Original purchased resource','paid',?,?)").run(randomUUID(),owner,id,randomUUID(),Date.now());
  await assert.rejects(()=>builder.adoptBuilderWorkspace(id,owner),e=>e.status===409,`${purchasePath}: sold products cannot be silently converted`);
  assert.equal(sql.prepare('SELECT COUNT(*) count FROM product_builder_workspaces WHERE product_id=?').get(id).count,0);
 }
 // Publish an actual PDF replacement for a synthetic prior buyer. The original
 // purchase stays immutable; only later PDF updates receive additive grants.
 let updated=await builder.createBuilderWorkspace(owner,{type:'guide',source:'upload',requestId:randomUUID()});
 const originalPdf=await upload(updated.product.id);updated=await save(updated,{...completeDraft(updated),sections:[],files:[],uploadIds:[originalPdf]});updated=await reviewedPublish(updated.product.id,owner,{expectedVersion:updated.version});
 const originalDelivery=sql.prepare('SELECT content_snapshot FROM product_builder_publications WHERE product_id=?').get(updated.product.id).content_snapshot,priorOrder=randomUUID();
 sql.prepare("INSERT INTO commerce_orders (id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at) VALUES (?,?,?,'acct_fixture','test','pdf-buyer@example.test',1900,'usd','Original PDF purchase','paid',?,?)").run(priorOrder,owner,updated.product.id,randomUUID(),Date.now());
 sql.prepare('INSERT INTO product_builder_order_snapshots (order_id,product_id,publication_version,snapshot,created_at) VALUES (?,?,?,?,?)').run(priorOrder,updated.product.id,updated.version,originalDelivery,Date.now());
 const pendingPdfOrder=randomUUID();sql.prepare("INSERT INTO commerce_orders (id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at) VALUES (?,?,?,'acct_fixture','test','pending-pdf-buyer@example.test',1900,'usd','Original pending PDF checkout','pending',?,?)").run(pendingPdfOrder,owner,updated.product.id,randomUUID(),Date.now());sql.prepare('INSERT INTO product_builder_order_snapshots (order_id,product_id,publication_version,snapshot,created_at) VALUES (?,?,?,?,?)').run(pendingPdfOrder,updated.product.id,updated.version,originalDelivery,Date.now());
 const replacement=await upload(updated.product.id,{bytes:fileSalePdfFixture('A deliberate PDF update')}),newCsv=await upload(updated.product.id,{mime:'text/csv',name:'new-template.csv',bytes:Buffer.from('New,Resource\nPrivate,Template\n')});
 updated=await save(updated,{...updated.draft,uploadIds:[replacement,newCsv],sections:[section('New written module that was not originally purchased')]});
 assert.equal(sql.prepare('SELECT COUNT(*) count FROM product_builder_upload_grants WHERE order_id=?').get(priorOrder).count,0,'Private drafts do not grant updates');
 updated=await reviewedPublish(updated.product.id,owner,{expectedVersion:updated.version});
 const granted=sql.prepare('SELECT upload_id FROM product_builder_upload_grants WHERE order_id=?').all(priorOrder).map(row=>row.upload_id);assert.deepEqual(granted,[replacement],'Publishing grants only the replacement PDF');
 assert.equal(sql.prepare('SELECT COUNT(*) count FROM product_builder_upload_grants WHERE order_id=?').get(pendingPdfOrder).count,0,'Actual publication grants paid existing buyers, while pending checkout keeps its approved original offer');
 assert.equal(sql.prepare('SELECT snapshot FROM product_builder_order_snapshots WHERE order_id=?').get(priorOrder).snapshot,originalDelivery,'The purchased snapshot remains unchanged');
 const priorDelivery=await deps.builderOrderDelivery(priorOrder);assert.deepEqual(priorDelivery.uploadIds,[originalPdf]);assert.equal(priorDelivery.sections.length,0,'New written modules are not silently granted');
 const metadata=await deps.builderDownloadMetadata(priorOrder,updated.product.id,owner);assert.deepEqual(new Set(metadata.map(file=>file.id)),new Set([originalPdf,replacement]),'A prior buyer retains the original and the future PDF update');
 // Only an explicitly published, owned image can be requested publicly. Draft
 // cover changes are isolated; invalid media and creator sources stay private.
 let covered=await builder.createBuilderWorkspace(owner,{type:'book',source:'manual',requestId:randomUUID()});
 const pngA=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jm4sAAAAASUVORK5CYII=','base64'),pngB=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
 const coverA=await upload(covered.product.id,{mime:'image/png',name:'published-cover.png',bytes:pngA}),coverB=await upload(covered.product.id,{mime:'image/png',name:'private-cover.png',bytes:pngB});
 const cover=slug=>coverRoute.GET(new Request(`https://fivegen.test/api/builder-cover/${slug}`),{params:Promise.resolve({slug})});
 covered=await save(covered,{...completeDraft(covered),coverUploadId:coverA});assert.equal((await cover(covered.product.slug)).status,404,'Unpublished cover is private');
 covered=await reviewedPublish(covered.product.id,owner,{expectedVersion:covered.version});let coverResponse=await cover(covered.product.slug);assert.equal(coverResponse.status,200);assert.deepEqual(Buffer.from(await coverResponse.arrayBuffer()),pngA);assert.equal(coverResponse.headers.get('Content-Type'),'image/png');assert.match(coverResponse.headers.get('Cache-Control'),/no-store/);
 const coveredPublic=await publication.getPublicBuilderProduct(covered.product.slug);assert.equal(coveredPublic.snapshot.hasCover,true);assert.ok(!JSON.stringify(coveredPublic.snapshot).includes(coverA),'Public metadata exposes only a cover boolean');
 covered=await save(covered,{...covered.draft,coverUploadId:coverB});assert.deepEqual(Buffer.from(await (await cover(covered.product.slug)).arrayBuffer()),pngA,'Private cover changes do not replace the published image');assert.equal((await cover(coverB)).status,404,'An upload identifier is not a public-image URL');
 const coverRow=sql.prepare('SELECT * FROM uploads WHERE id=?').get(coverA);
 for(const [field,value] of [['mime','application/pdf'],['object_key','voice/private-cover'],['sha256',null],['owner',outsider]]){sql.prepare(`UPDATE uploads SET ${field}=? WHERE id=?`).run(value,coverA);coverResponse=await cover(covered.product.slug);assert.equal(coverResponse.status,404,`${field}: invalid or private cover is not exposed`);assert.match(coverResponse.headers.get('Cache-Control'),/no-store/);sql.prepare(`UPDATE uploads SET ${field}=? WHERE id=?`).run(coverRow[field],coverA);}
 sql.prepare('UPDATE uploads SET sha256=? WHERE id=?').run('0'.repeat(64),coverB);publishedReady(await builder.getBuilderWorkspace(covered.product.id,owner),'Same-sized cover passes the inexpensive workspace check');await assert.rejects(()=>publication.publishBuilderProduct(covered.product.id,owner,{expectedVersion:covered.version}),e=>e.status===409,'Publication verifies cover integrity and rejects same-size corruption');assert.deepEqual(Buffer.from(await (await cover(covered.product.slug)).arrayBuffer()),pngA,'A failed cover update preserves the previous public image');
 // Exercise the actual builder payment callbacks without a browser or provider.
 // Status refresh must never autosave or replace an unsaved manuscript.
 const uiSource=ts.createSourceFile('product-builder.tsx',readFileSync('app/product-builder.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),callbacks=[];let paymentSection;
 const visit=node=>{if(ts.isFunctionDeclaration(node)&&['openAccountPayments','refreshPayments','resumePaymentSetup'].includes(node.name?.text))callbacks.push(node.getText(uiSource));if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(uiSource)==='section'&&node.openingElement.attributes.properties.some(property=>ts.isJsxAttribute(property)&&property.name.getText(uiSource)==='className'&&property.initializer&&ts.isStringLiteral(property.initializer)&&property.initializer.text==='pb-card pb-payments'))paymentSection=node.getText(uiSource);ts.forEachChild(node,visit);};visit(uiSource);assert.equal(callbacks.length,3);assert.ok(paymentSection);
 const blockedPayments={configured:true,enabled:false,mode:'live',connected:false,ready:false,accountId:null},pendingDraft={title:'My unsaved title',sections:[{title:'Original chapter',body:'UNSAVED_MANUSCRIPT'}]},reference={current:{product:{id:randomUUID()},version:9,draft:pendingDraft,payments:blockedPayments}},calls=[],notices=[],stages=[],navigation=[];
 let returnedPayments=blockedPayments,shownWorkspace;
 const accountNavigation=[];let saveFailure=false,saveCalls=0;const leavingRef={current:false};
 const location={href:'https://fivegen.test/build/'+reference.current.product.id,assign:path=>accountNavigation.push(path)},history={replaceState:(_state,_unused,path)=>{navigation.push(path);location.href=new URL(path,location.href).href;}};
 const callbackDeps={URL,location,history,encodeURIComponent,leavingRef,saveDraft:async()=>{saveCalls++;if(saveFailure)throw new Error('Save failed');return reference.current;},wsRef:reference,api:async(...args)=>{calls.push(args);assert.deepEqual(args,['/api/commerce/connect'],'Refresh only reads the authenticated connection endpoint');return returnedPayments;},run:async(_label,work)=>work(),setWorkspace:value=>{shownWorkspace=value;},setNotice:value=>notices.push(value),setSurface:value=>{assert.equal(value,'editor');},setStage:value=>stages.push(value)};
 const callbackCode=ts.transpileModule(callbacks.join('\n'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 const paymentCallbacks=new Function(...Object.keys(callbackDeps),callbackCode+';return {openAccountPayments,refreshPayments,resumePaymentSetup};')(...Object.values(callbackDeps));
 await paymentCallbacks.openAccountPayments();assert.equal(saveCalls,1,'Unsaved product changes are saved before opening account payments');assert.equal(accountNavigation.at(-1),'/account/payments?return_to='+encodeURIComponent('/build/'+reference.current.product.id));assert.equal(leavingRef.current,true);assert.equal(calls.length,0,'A product never starts Stripe onboarding or creates its own payment account');
 saveFailure=true;leavingRef.current=false;await assert.rejects(()=>paymentCallbacks.openAccountPayments(),/Save failed/);assert.equal(accountNavigation.length,1,'Failed saves keep the user in the builder');assert.equal(leavingRef.current,false);saveFailure=false;
 await paymentCallbacks.refreshPayments();assert.equal(reference.current.draft,pendingDraft);assert.equal(shownWorkspace.draft,pendingDraft);assert.equal(shownWorkspace.version,9);assert.match(notices.at(-1),/Platform payment setup is still pending/);
 returnedPayments={...blockedPayments,enabled:true};location.href+='?connect=returned&tab=review#payments';await paymentCallbacks.resumePaymentSetup();assert.equal(stages.at(-1),2,'Stripe return opens Publish & sell');assert.equal(reference.current.payments.enabled,true,'Stripe return refreshes the saved platform status');assert.equal(reference.current.draft,pendingDraft,'Stripe return preserves the in-progress manuscript');assert.equal(navigation.at(-1),'/build/'+reference.current.product.id+'?tab=review&area=commerce#payments','The handled Connect marker is removed and the commerce task is restored');assert.match(notices.at(-1),/Set up Seller payments once/);
 const beforeReturnReplay=calls.length;await paymentCallbacks.resumePaymentSetup();assert.equal(calls.length,beforeReturnReplay,'Consumed return markers do not repeatedly refresh');
 location.href='https://fivegen.test/build/'+reference.current.product.id+'?connect=refresh';await paymentCallbacks.resumePaymentSetup();assert.equal(calls.length,beforeReturnReplay,'Expired onboarding links do not create or reconnect an account automatically');assert.match(notices.at(-1),/link expired/);
 returnedPayments={...returnedPayments,connected:true,ready:true,accountId:'acct_fixture'};await paymentCallbacks.refreshPayments();assert.match(notices.at(-1),/connected and ready/);assert.equal(reference.current.draft,pendingDraft);
 const icon=()=>null,viewDeps={React,busy:'',setNotice:()=>{},openAccountPayments:()=>{},refreshPayments:()=>{},ShieldCheck:icon,RefreshCw:icon,ArrowRight:icon};
 const paymentView=ts.transpileModule('function PaymentView({workspace}){return ('+paymentSection+');}',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,PaymentView=new Function(...Object.keys(viewDeps),paymentView+';return PaymentView;')(...Object.values(viewDeps));
 let paymentMarkup=renderToStaticMarkup(React.createElement(PaymentView,{workspace:{payments:blockedPayments}}));assert.ok(paymentMarkup.includes('Refresh connection'),'Refresh remains visible while platform setup is blocked');assert.ok(paymentMarkup.includes('>Set up account payments<'),'The account payment settings remain reachable even when platform setup is blocked');assert.ok(!paymentMarkup.includes('<input'),'The product never asks for a separate business country');
 paymentMarkup=renderToStaticMarkup(React.createElement(PaymentView,{workspace:{payments:{...blockedPayments,enabled:true}}}));assert.ok(paymentMarkup.includes('>Set up account payments<'));assert.ok(paymentMarkup.includes('Refresh connection'));
 paymentMarkup=renderToStaticMarkup(React.createElement(PaymentView,{workspace:{payments:returnedPayments}}));assert.ok(paymentMarkup.includes('>Manage payments<'));assert.ok(paymentMarkup.includes('No separate setup is needed.'));assert.ok(!paymentMarkup.includes('Set up payments later'),'Ready accounts do not repeat payment setup on each product');
 const navSource=ts.createSourceFile('workspace-navigation.tsx',readFileSync('app/workspace-navigation.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),accountItems=[];
 const visitNav=node=>{if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(navSource)==='DropdownMenuItem'&&/Get paid|My FiveGen plan/.test(node.getText(navSource)))accountItems.push(node.getText(navSource));ts.forEachChild(node,visitNav);};visitNav(navSource);assert.equal(accountItems.length,2);
 const navTargets=[],navCode=ts.transpileModule('const items=['+accountItems.join(',')+'];',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
 const menuItems=new Function('React','DropdownMenuItem','Banknote','CreditCard','onVisit',navCode+';return items;')(React,({children})=>React.createElement('button',null,children),icon,icon,path=>navTargets.push(path));menuItems.forEach(item=>item.props.onSelect());assert.deepEqual(navTargets,['/account/payments','/account/billing'],'Seller proceeds and FiveGen subscription billing have distinct account destinations');
 const legacySource=ts.createSourceFile('commerce-panel.tsx',readFileSync('app/commerce-panel.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),legacyCallbacks=[];
 const visitLegacy=node=>{if(ts.isFunctionDeclaration(node)&&['persistOffer','openAccountPayments'].includes(node.name?.text))legacyCallbacks.push(node.getText(legacySource));ts.forEachChild(node,visitLegacy);};visitLegacy(legacySource);assert.equal(legacyCallbacks.length,2);
 const legacyRequests=[],legacyNavigation=[],legacyUpdates=[],legacyProduct={id:randomUUID()},legacyOffer={amount:2500,currency:'usd',enabled:false,updatedAt:10};let legacySaveFailure=false;
 const legacyDeps={dirty:true,offer:legacyOffer,product:legacyProduct,encodeURIComponent,location:{assign:path=>legacyNavigation.push(path)},action:async work=>work(),flushSync:work=>work(),setBusy:()=>{},onBusyChange:()=>{},onDirtyChange:()=>{},setOffer:next=>legacyUpdates.push(next),setSaved:()=>{},fetch:async(path,init)=>{legacyRequests.push({path,init});if(legacySaveFailure)throw new Error('Save failed');return {offer:{...legacyOffer,updatedAt:11}};},commerceResponse:async response=>response};
 const legacyCode=ts.transpileModule(legacyCallbacks.join('\n'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText,openLegacyPayments=new Function(...Object.keys(legacyDeps),legacyCode+';return openAccountPayments;')(...Object.values(legacyDeps));
 await openLegacyPayments();assert.equal(legacyNavigation.at(-1),'/account/payments?return_to='+encodeURIComponent('/?project='+legacyProduct.id+'&area=commerce'));assert.equal(legacyRequests.length,1);assert.equal(legacyRequests[0].path,'/api/commerce/products/'+legacyProduct.id);assert.equal(legacyRequests[0].init.method,'PATCH');assert.deepEqual(JSON.parse(legacyRequests[0].init.body),{...legacyOffer,expectedUpdatedAt:10});assert.equal(legacyUpdates[0].updatedAt,11,'Legacy product pricing is saved before opening account payments');
 legacySaveFailure=true;await assert.rejects(()=>openLegacyPayments(),/Save failed/);assert.equal(legacyNavigation.length,1,'Legacy save failures also prevent navigation and loss of checkout settings');
 // New studio settings remain saveable while a creator types, and the actual
 // publication boundary validates completed delivery rather than UI promises.
 let cloudKit=await builder.createBuilderWorkspace(owner,{type:'template-kit',source:'manual',requestId:randomUUID()});
 cloudKit=await save(cloudKit,{...completeDraft(cloudKit),sections:[],files:[],studio:{templates:{items:[{id:randomUUID(),name:'Client project planner',duplicateUrl:'https://templates.example.test/duplicate/project-planner'}]}}});
 publishedReady(cloudKit,'A usable cloud-only template with instructions');
 assert.equal(deps.evaluateProductReadiness(cloudKit.draft).ready,true,'Cloud templates do not require a redundant uploaded file');
 cloudKit=await reviewedPublish(cloudKit.product.id,owner,{expectedVersion:cloudKit.version});assert.ok(cloudKit.publication);

 let quizOnly=await builder.createBuilderWorkspace(owner,{type:'mini-course',source:'manual',requestId:randomUUID()});
 quizOnly=await save(quizOnly,{...completeDraft(quizOnly),sections:[{id:randomUUID(),title:'Choose a concrete project goal',body:'',studio:{kind:'quiz',quiz:[{question:'Which goal can you verify?',options:['Send one finished project brief','Think about a project'],correctIndex:0,explanation:'A finished brief is a visible result.'}]}}]});
 publishedReady(quizOnly,'Quiz-only learning section');assert.equal(deps.evaluateProductReadiness(quizOnly.draft).ready,true);
 quizOnly=await reviewedPublish(quizOnly.product.id,owner,{expectedVersion:quizOnly.version});assert.ok(quizOnly.publication);

 let audioOnly=await builder.createBuilderWorkspace(owner,{type:'mini-course',source:'manual',requestId:randomUUID()});
 const audioId=await upload(audioOnly.product.id,{mime:'audio/mpeg',name:'original-lesson.mp3',bytes:Buffer.from('ID3 synthetic retained audio fixture')});
 audioOnly=await save(audioOnly,{...completeDraft(audioOnly),uploadIds:[audioId],sections:[{id:randomUUID(),title:'A guided project planning session',body:'',studio:{kind:'audio',audioId}}]});
 publishedReady(audioOnly,'Audio-only section with an owned verified file');assert.equal(deps.evaluateProductReadiness(audioOnly.draft).ready,true);
 audioOnly=await reviewedPublish(audioOnly.product.id,owner,{expectedVersion:audioOnly.version});assert.ok(audioOnly.publication);
 const missingAudio={...audioOnly.draft,sections:[{...audioOnly.draft.sections[0],studio:{kind:'audio',audioId:randomUUID()}}]};
 assert.equal((await builder.builderReadiness(audioOnly.product.id,owner,missingAudio)).publishReady,false,'An arbitrary audio ID cannot pass readiness');

 let incompleteSettings=await builder.createBuilderWorkspace(owner,{type:'guide',source:'manual',requestId:randomUUID()});
 incompleteSettings=await save(incompleteSettings,{...completeDraft(incompleteSettings),studio:{pricing:{coupons:[{code:'',percentOff:0}]}}});
 assert.equal(incompleteSettings.draft.studio.pricing.coupons[0].code,'','Partial settings are retained during autosave');assert.equal(incompleteSettings.readiness.publishReady,false);
 await assert.rejects(()=>publication.publishBuilderProduct(incompleteSettings.product.id,owner,{expectedVersion:incompleteSettings.version}),error=>error.status===409,'Incomplete coupon rows cannot be published');
 incompleteSettings=await save(incompleteSettings,{...incompleteSettings.draft,studio:{templates:{items:'still being edited'}}});
 assert.equal(incompleteSettings.draft.studio.templates.items,'still being edited');assert.equal(incompleteSettings.readiness.publishReady,false,'Malformed bounded settings fail publication readiness without breaking draft save');

 let circular=await builder.createBuilderWorkspace(owner,{type:'mini-course',source:'manual',requestId:randomUUID()});
 const lessonA=randomUUID(),lessonB=randomUUID();
 circular=await save(circular,{...completeDraft(circular),sections:[{...section('Plan your first brief'),id:lessonA,studio:{prerequisiteIds:[lessonB]}},{...section('Review your first brief'),id:lessonB,studio:{prerequisiteIds:[lessonA]}}]});
 assert.equal(circular.readiness.checks.find(check=>check.key==='prerequisites').ready,false,'Indirect prerequisite cycles are rejected');
 await assert.rejects(()=>publication.publishBuilderProduct(circular.product.id,owner,{expectedVersion:circular.version}),error=>error.status===409);
 circular=await save(circular,{...circular.draft,sections:circular.draft.sections.map((item,index)=>({...item,studio:{prerequisiteIds:index?[lessonA]:[]}}))});publishedReady(circular,'An acyclic prerequisite chain');
 assert.equal(providerCalls,0,'Creating, saving and checking publication never contacts a payment provider');
 assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0,'New and retained rows satisfy foreign keys');
 console.log(`Product builder tests passed: all ${deps.builderTypes.length} types, exact resume, original-file readiness, ownership, payment-independent publication, private snapshots and selling gates. Fixtures retained at ${root}`);
}finally{storage.close();}
