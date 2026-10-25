import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import ts from 'typescript';
import {z} from 'zod';
import {createStorage} from '../runtime/render/storage.mjs';

// Actual server sources and production migrations, with synthetic data only.
// The harness has no environment files, credentials or provider access.
const fixture=resolve('outputs/product-deletion-test',randomUUID());
const storage=createStorage(fixture),sql=storage.sqlite;
const owner='delete-owner',foreignOwner='another-owner',now=Date.now();
let actor={userId:owner,email:'delete-owner@example.test'},beforeBatch=null,beforeStatement=null;
const deletedObjects=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Network/provider calls are forbidden in product deletion tests.');};
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const database={
 prepare(statement){const wrap=prepared=>({...prepared,bind:(...values)=>wrap(prepared.bind(...values)),async run(){if(beforeStatement?.match.test(statement)){const hook=beforeStatement;beforeStatement=null;await hook.work();}return prepared.run();}});return wrap(storage.DB.prepare(statement));},
 async batch(statements){if(beforeBatch){const hook=beforeBatch;beforeBatch=null;await hook();}return storage.DB.batch(statements);},
};
const deps={z,ApiError,env:{BUCKET:{...storage.BUCKET,delete:async key=>{deletedObjects.push(key);await storage.BUCKET.delete(key);}}},database:()=>database,
 identity:async()=>{if(!actor)throw new ApiError('Sign in',401);return actor;},
 ownedProduct:async(id,who)=>{const row=sql.prepare('SELECT * FROM products WHERE id=? AND owner=?').get(id,who);if(!row)throw new ApiError('Product not found.',404);return row;},
 sameOrigin:req=>{if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new ApiError('This request is not allowed.',403);},
 failure:error=>Response.json({error:error.issues?'Please check your inputs and try again.':error.message},{status:error.status||(error.issues?400:500)}),
};
async function load(path,functions){const key='deletion'+randomUUID().replaceAll('-','');globalThis[key]=deps;let source=readFileSync(path,'utf8');if(functions){const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);source=parsed.statements.filter(statement=>ts.isFunctionDeclaration(statement)&&functions.includes(statement.name?.text)).map(statement=>statement.getText(parsed)).join('\n');assert.ok(source,'The selected production functions exist');}else source=source.replace(/^import[\s\S]*?;\r?\n/gm,'');const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;try{return await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}finally{delete globalThis[key];}}
let fixtureSerial=0;
function insert(table,values={}){const columns=sql.prepare(`PRAGMA table_info("${table}")`).all(),record=Object.fromEntries(Object.entries(values).filter(([name])=>columns.some(column=>column.name===name)));for(const column of columns){if(record[column.name]===undefined&&(column.notnull||column.pk)&&column.dflt_value===null)record[column.name]=/INT|REAL/i.test(column.type)?column.name==='size'?16:now+(++fixtureSerial):randomUUID();}const names=Object.keys(record);sql.prepare(`INSERT INTO "${table}"(${names.map(name=>'"'+name+'"').join(',')}) VALUES(${names.map(()=>'?').join(',')})`).run(...names.map(name=>record[name]));return record;}
function product(title='Disposable course',who=owner){return insert('products',{id:randomUUID(),owner:who,slug:'delete-'+randomUUID(),title,description:'Creator material',audience:'Creators',format:'Book',price:4900,color:'orange',content:'{"sections":[],"files":[]}',created_at:now,updated_at:now});}
const count=(table,id)=>Number(sql.prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE product_id=?`).get(id).n);
const allRows=table=>JSON.stringify(sql.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all());
const ctx=id=>({params:Promise.resolve({id})});
const request=(body,origin='https://fivegen.test')=>new Request('https://fivegen.test/api/products/fixture',{method:'DELETE',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});

function seedDraft(p){
 const scope={product_id:p.id,owner:p.owner};
 for(const table of ['product_builder_workspaces','product_builder_revisions','file_sale_drafts','file_sale_revisions','product_builder_publications','product_marketing_plugins','product_pages','product_page_revisions','connected_marketing_launches','marketing_draft_versions','campaign_email_imports','page_copy_proposals','growth_funnel_drafts','creator_reply_templates','creator_product_context','creator_context_proposals','creator_launch_journeys'])insert(table,{...scope,data:'{}',draft:'{}',content_snapshot:'{}',public_snapshot:'{}',...(table==='product_builder_publications'?{slug:'publication-'+p.id}:{}),...(table==='marketing_draft_versions'?{kind:'growth'}:{})});
 insert('product_editorial_reviews',{...scope,mode:'test'});
 insert('growth_asset_proposals',{...scope,asset:'vsl'});
 insert('growth_plan_reviews',{...scope,asset_key:'offer'});
 const page=insert('public_page_records',{...scope,purpose:'lead',name:'Disposable waitlist',draft:'{}',published:'{}',public_product:'{}',published_at:now});
 insert('public_page_revisions',{...scope,page_id:page.id,config:'{}'});
 insert('public_page_form_receipts',{...scope,page_id:page.id,marketing:0});
 const campaign=insert('marketing_campaigns',{...scope,title:'Disposable launch'});
 insert('marketing_campaign_selection',{...scope,campaign_id:campaign.id});
 insert('campaign_versions',{...scope,campaign_id:campaign.id});
 insert('campaign_email_links',{...scope,campaign_id:campaign.id});
 const grant=insert('creator_collaborators',{...scope,role:'editor',status:'revoked'});
 insert('creator_collaboration_events',{...scope,collaborator_id:grant.id,kind:'content',status:'saved'});
 insert('product_page_experiments',{...scope,draft:'{}'});
 const run=insert('product_page_experiment_runs',{...scope,closed_at:now});
 const assignment=insert('product_page_experiment_assignments',{...scope,run_id:run.id,variant:'a'});
 insert('growth_funnels',{...scope,slug:'funnel-'+p.id,landing:'{}'});
 insert('offer_experiments',{...scope,slug:'offer-'+p.id,draft:'{}'});
 for(const table of ['visits','growth_events','offer_responses','offer_visitors','offer_rounds','leads','growth_leads','booking_slots','commerce_slots','product_share_links','product_journey_events','file_sale_events'])insert(table,scope);
 insert('generation',{...scope,status:'completed',lease:0});
 insert('growth_workspaces',{...scope,brief:'{}',assets:'{}',lease:0});
 insert('creator_campaigns',{...scope,title:'Legacy campaign',lease:0});
 insert('studio_conversations',{...scope,title:'Archived planning',messages:'[]',lease:0});
 insert('automation_sequences',{...scope,status:'draft',trigger:'lead',draft:'{}'});
 const asset=insert('assets',{...scope,status:'completed',kind:'image',object_key:'assets/'+p.id});
 const upload=insert('uploads',{...scope,status:'completed',mime:'video/mp4',size:16,object_key:'classes/'+p.id});
 return {page,campaign,asset,upload};
}

try{
 Object.assign(deps,await load('lib/product.ts'));
 Object.assign(deps,await load('lib/product-deletion-server.ts'));
 const route=await load('app/api/products/[id]/route.ts');
 const reviewRoute=await load('app/api/products/[id]/deletion/route.ts');
 const survivor=product('Keep my other product'),foreign=product('Private foreign product',foreignOwner);
 const survivorDraft=seedDraft(survivor),foreignDraft=seedDraft(foreign);
 const first=product(),firstDraft=seedDraft(first);
 for(const item of [firstDraft,survivorDraft,foreignDraft])for(const record of [item.asset,item.upload])await storage.BUCKET.put(record.object_key,'synthetic-media');
 const review=await deps.getProductDeletion(first.id,owner);
 const confirmation={title:first.title,expectedUpdatedAt:first.updated_at,revision:review.revision};
 assert.deepEqual(review.product,{id:first.id,title:first.title,updatedAt:first.updated_at});
 assert.match(review.revision,/^[a-f0-9]{64}$/,'Review binds the exact related-data inventory');
 assert.equal(review.canDelete,true);assert.deepEqual(review.blockers,[]);
 assert.ok(!JSON.stringify(review).includes('synthetic-media'),'Review never exposes private file content');
 await assert.rejects(()=>deps.getProductDeletion(foreign.id,owner),error=>error.status===404);
 await assert.rejects(()=>deps.deleteProduct(foreign.id,owner,{title:foreign.title,expectedUpdatedAt:foreign.updated_at,revision:review.revision}),error=>error.status===404);
 await assert.rejects(()=>deps.deleteProduct(randomUUID(),owner,confirmation),error=>error.status===404);
 for(const data of [{...confirmation,title:'Wrong product'},{...confirmation,expectedUpdatedAt:first.updated_at-1},{...confirmation,revision:'0'.repeat(64)}])await assert.rejects(()=>deps.deleteProduct(first.id,owner,data),error=>error.status===409);
 assert.equal(count('public_page_records',first.id),1,'A stale or wrong typed title cannot remove public pages');
 actor=null;assert.equal((await reviewRoute.GET(new Request('https://fivegen.test/api'),ctx(first.id))).status,401);assert.equal((await route.DELETE(request(confirmation),ctx(first.id))).status,401);
 actor={userId:foreignOwner,email:'another-owner@example.test'};assert.equal((await reviewRoute.GET(new Request('https://fivegen.test/api'),ctx(first.id))).status,404);assert.equal((await route.DELETE(request(confirmation),ctx(first.id))).status,404);
 actor={userId:owner,email:'delete-owner@example.test'};assert.equal((await route.DELETE(request(confirmation,'https://untrusted.example'),ctx(first.id))).status,403);assert.equal((await route.DELETE(request({title:first.title}),ctx(first.id))).status,400);

 const edited=product('Another tab is editing this draft');seedDraft(edited);
 const oldReview=await deps.getProductDeletion(edited.id,owner);
 sql.prepare('UPDATE product_builder_workspaces SET data=?,version=version+1 WHERE product_id=?').run('{"title":"Fresh teaching content"}',edited.id);
 assert.equal(sql.prepare('SELECT updated_at FROM products WHERE id=?').get(edited.id).updated_at,edited.updated_at,'Builder revisions need not update the root product timestamp');
 await assert.rejects(()=>deps.deleteProduct(edited.id,owner,{title:edited.title,expectedUpdatedAt:edited.updated_at,revision:oldReview.revision}),error=>error.status===409,'A changed builder draft invalidates a previously reviewed inventory');
 assert.equal(count('product_builder_workspaces',edited.id),1);

 // The product and every draft remain unchanged when a protected relationship exists.
 const protectedCases=[
  ['legacy order','orders',{provider:'stripe',amount:4900,email:'buyer@example.test'}],
  ['pending checkout','commerce_orders',{status:'pending',mode:'test',email:'buyer@example.test',amount:4900,currency:'usd',title:'Protected purchase'}],
  ['paid purchase','commerce_orders',{status:'paid',mode:'live',email:'buyer@example.test',amount:4900,currency:'usd',title:'Protected purchase'}],
  ['legacy booking','bookings',{status:'confirmed',email:'buyer@example.test'}],
  ['commerce booking','commerce_bookings',{status:'confirmed',mode:'live',email:'buyer@example.test'}],
 ];
 for(const [label,table,values] of protectedCases){const p=product(label);insert('product_builder_workspaces',{product_id:p.id,owner,data:'{}'});insert(table,{product_id:p.id,owner,...values});const before=allRows(table),state=await deps.getProductDeletion(p.id,owner);assert.equal(state.canDelete,false,label);assert.ok(state.blockers.length,label);await assert.rejects(()=>deps.deleteProduct(p.id,owner,{title:p.title,expectedUpdatedAt:p.updated_at,revision:state.revision}),error=>error.status===409,label);assert.ok(sql.prepare('SELECT id FROM products WHERE id=?').get(p.id),label);assert.equal(count('product_builder_workspaces',p.id),1,label);assert.equal(allRows(table),before,label+' history stays intact');}

 const customer=product('Customer learning and service history');
 const purchase=insert('commerce_orders',{product_id:customer.id,owner,status:'paid',mode:'live',email:'member@example.test',amount:4900,currency:'usd',title:customer.title});
 const purchaseScope={order_id:purchase.id,parent_order_id:purchase.id,product_id:customer.id,owner,mode:'live',email:'member@example.test'};
 for(const table of ['product_enrollments','product_builder_order_snapshots','product_service_sessions','product_learning_progress','product_team_seats','product_bundle_entitlements'])insert(table,purchaseScope);
 const protectedTables=['commerce_orders','product_enrollments','product_builder_order_snapshots','product_service_sessions','product_learning_progress','product_team_seats','product_bundle_entitlements'];
 const customerBefore=Object.fromEntries(protectedTables.map(table=>[table,allRows(table)]));
 const customerReview=await deps.getProductDeletion(customer.id,owner);
 await assert.rejects(()=>deps.deleteProduct(customer.id,owner,{title:customer.title,expectedUpdatedAt:customer.updated_at,revision:customerReview.revision}),error=>error.status===409);
 for(const table of protectedTables)assert.equal(allRows(table),customerBefore[table],table+' survives a rejected deletion with entitlements, progress and bookings intact');

 const busyCases=[
  ['queued generation','generation',{status:'queued',lease:0}],
  ['live generation lease','generation',{status:'failed',lease:now+600000}],
  ['queued media generation','assets',{status:'queued'}],
  ['upload in progress','uploads',{status:'uploading'}],
  ['active email sequence','automation_sequences',{status:'active'}],
  ['queued email','automation_jobs',{status:'pending'}],
  ['growth writer','growth_workspaces',{lease:now+600000}],
  ['pending growth attempt','growth_generation_runs',{state:'pending'}],
  ['campaign writer','marketing_campaigns',{title:'Generating campaign',lease:now+600000}],
  ['page-copy writer','page_copy_proposals',{lease:now+600000}],
  ['planning writer','studio_conversations',{lease:now+600000}],
  ['voice transcription','creator_voice_sources',{kind:'video',lease:now+600000}],
 ];
 for(const [label,table,values] of busyCases){const p=product(label);insert(table,{product_id:p.id,owner,...values});const state=await deps.getProductDeletion(p.id,owner);assert.equal(state.canDelete,false,label);await assert.rejects(()=>deps.deleteProduct(p.id,owner,{title:p.title,expectedUpdatedAt:p.updated_at,revision:state.revision}),error=>error.status===409,label);assert.ok(sql.prepare('SELECT id FROM products WHERE id=?').get(p.id),label+' keeps its product');}
 const unsettled=product('Failed attempt with unsettled credits'),unsettledCampaign=insert('marketing_campaigns',{product_id:unsettled.id,owner,title:'Failed campaign attempt'});
 const unsettledRun=insert('creator_ai_runs',{owner,kind:'campaign',target_id:unsettledCampaign.id,state:'failed',cost:8});
 insert('credit_usage',{id:unsettledRun.id,owner,operation:'campaign',cost:8,state:'reserved'});
 const unsettledReview=await deps.getProductDeletion(unsettled.id,owner);
 assert.equal(unsettledReview.canDelete,false,'A failed creator attempt still blocks deletion while its credits await settlement');
 await assert.rejects(()=>deps.deleteProduct(unsettled.id,owner,{title:unsettled.title,expectedUpdatedAt:unsettled.updated_at,revision:unsettledReview.revision}),error=>error.status===409);
 assert.equal(count('marketing_campaigns',unsettled.id),1,'The target needed to settle an interrupted attempt remains intact');

 const stopped=product('Stopped product run'),stoppedRun=insert('ai_product_runs',{owner,product_id:stopped.id,state:'active',mode:'paid'});
 const stoppedReview=await deps.getProductDeletion(stopped.id,owner);
 assert.equal(stoppedReview.canDelete,true,'A historical quota row alone does not make a stopped product undeletable');
 await deps.deleteProduct(stopped.id,owner,{title:stopped.title,expectedUpdatedAt:stopped.updated_at,revision:stoppedReview.revision});
 assert.ok(sql.prepare('SELECT id FROM ai_product_runs WHERE id=?').get(stoppedRun.id),'Historical usage stays charged after removing stopped product content');

 // Changes arriving after the read-only review must abort the entire batch.
 for(const label of ['new checkout','new work lease','renamed product']){
  const p=product('Race: '+label),draft=seedDraft(p);
  const state=await deps.getProductDeletion(p.id,owner);
  const contentBefore=JSON.stringify(sql.prepare('SELECT * FROM product_builder_workspaces WHERE product_id=?').get(p.id));
  beforeBatch=()=>{if(label==='new checkout')insert('commerce_orders',{product_id:p.id,owner,status:'pending',mode:'live',email:'late-buyer@example.test',amount:4900,currency:'usd',title:p.title});else if(label==='new work lease')sql.prepare('UPDATE growth_workspaces SET lease=? WHERE product_id=?').run(Date.now()+600000,p.id);else sql.prepare('UPDATE products SET title=?,updated_at=updated_at+1 WHERE id=?').run('Renamed in another tab',p.id);};
  await assert.rejects(()=>deps.deleteProduct(p.id,owner,{title:p.title,expectedUpdatedAt:p.updated_at,revision:state.revision}),error=>error.status===409,label+' must reject an obsolete confirmation');
  assert.ok(sql.prepare('SELECT id FROM products WHERE id=?').get(p.id));
  assert.equal(JSON.stringify(sql.prepare('SELECT * FROM product_builder_workspaces WHERE product_id=?').get(p.id)),contentBefore,label+' cannot partially delete teaching content');
  assert.equal(count('public_page_records',p.id),1,label+' cannot partially unpublish a page');
  assert.equal(count('marketing_campaigns',p.id),1,label+' cannot partially delete campaign history');
  assert.ok(!deletedObjects.includes(draft.asset.object_key),label+' cannot remove an object before commit');
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }

 // Accounting is deliberately not part of product-content deletion.
 const usage=insert('credit_usage',{owner,operation:'product-generation',cost:8,state:'completed'});
 const productRun=insert('ai_product_runs',{owner,product_id:first.id,state:'completed',mode:'paid'});
 const wallet=insert('wallets',{owner,purchased:73});
 const globalSource=insert('creator_voice_sources',{owner,product_id:'',title:'Reusable creator voice',kind:'text',approved:1,permission:1,transcript:'A reusable authentic story.'});
 const sharedSource=insert('creator_voice_sources',{owner,product_id:first.id,upload_id:firstDraft.upload.id,title:'Story reused in another product',kind:'video',approved:1,permission:1,transcript:'This source must stay usable after removing its original product.'});
 sql.prepare('UPDATE creator_product_context SET source_ids=? WHERE product_id=?').run(JSON.stringify([sharedSource.id]),survivor.id);
 const sharedUploadBefore=JSON.stringify(sql.prepare('SELECT * FROM uploads WHERE id=?').get(firstDraft.upload.id));
 for(const path of ['lib/public-pages.ts','lib/service-applications.ts','lib/product-page.ts'])Object.assign(deps,await load(path));
 deps.storageLimit=2*1024*1024*1024;
 const brand=await load('lib/page-template-server.ts');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4XkAAAAASUVORK5CYII=','base64');
 const brandUpload=insert('uploads',{product_id:first.id,owner,name:'Reusable brand.png',mime:'image/png',size:png.length,object_key:'classes/brand/'+first.id,status:'completed',sha256:createHash('sha256').update(png).digest('hex')});
 await storage.BUCKET.put(brandUpload.object_key,png);
 const pageBase=deps.defaultProductPageConfig();
 const savedBrand=(await brand.saveBrandPreset(owner,{name:'Reusable personal brand',brand:pageBase.brand,sourceProductId:first.id,iconUploadId:brandUpload.id,links:[{label:'Creator support',url:'https://creator.example.test/help'}]}))[0];
 const accountTables=['credit_usage','ai_product_runs','wallets','creator_voice_sources','page_brand_presets'];
 const accountBefore=Object.fromEntries(accountTables.map(table=>[table,allRows(table)]));
 const scopeTables=sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name).filter(table=>sql.prepare(`PRAGMA table_info("${table}")`).all().some(column=>column.name==='product_id'));
 const survivorBefore=Object.fromEntries(scopeTables.map(table=>[table,JSON.stringify(sql.prepare(`SELECT * FROM "${table}" WHERE product_id IN (?,?) ORDER BY rowid`).all(survivor.id,foreign.id))]));
 const finalReview=await deps.getProductDeletion(first.id,owner);
 const deleted=await route.DELETE(request({...confirmation,revision:finalReview.revision}),ctx(first.id));assert.equal(deleted.status,200,await deleted.clone().text());assert.deepEqual(await deleted.json(),{deleted:true});
 assert.equal(sql.prepare('SELECT id FROM products WHERE id=?').get(first.id),undefined);
 for(const table of scopeTables.filter(table=>!['ai_product_runs','growth_generation_runs','creator_ai_runs','creator_voice_sources','uploads'].includes(table)))assert.equal(count(table,first.id),0,table+' removes only deleted product data');
 assert.equal(count('creator_voice_sources',first.id),1,'Reusable library sources retain their immutable origin UUID');
 assert.equal(JSON.stringify(sql.prepare('SELECT * FROM uploads WHERE id=?').get(firstDraft.upload.id)),sharedUploadBefore,'Library recording metadata remains available');
 assert.ok(await storage.BUCKET.get(firstDraft.upload.object_key),'Reusable library recording bytes remain available');
 assert.ok(!deletedObjects.includes(firstDraft.upload.object_key),'No shared library recording is removed from storage');
 for(const table of accountTables)assert.equal(allRows(table),accountBefore[table],table+' remains unchanged');
 for(const table of scopeTables)assert.equal(JSON.stringify(sql.prepare(`SELECT * FROM "${table}" WHERE product_id IN (?,?) ORDER BY rowid`).all(survivor.id,foreign.id)),survivorBefore[table],table+' keeps other products');
 assert.equal((await brand.getBrandPresets(owner))[0].sourceProductId,first.id,'A saved brand retains its immutable icon origin after deleting that product');
 const applied=await brand.applyBrandPreset(survivor.id,owner,{presetId:savedBrand.id,base:pageBase,affected:{brand:true,icon:true,links:true}});
 assert.notEqual(applied.config.iconUploadId,brandUpload.id,'Applying a retained brand copies its icon into the selected product');
 const copiedIcon=sql.prepare('SELECT * FROM uploads WHERE id=?').get(applied.config.iconUploadId);
 assert.equal(copiedIcon.product_id,survivor.id);assert.equal(copiedIcon.owner,owner);assert.equal(copiedIcon.status,'completed');assert.equal(copiedIcon.sha256,createHash('sha256').update(png).digest('hex'));
 const iconObject=await storage.BUCKET.get(copiedIcon.object_key);
 assert.deepEqual(Buffer.from(await new Response(iconObject.body).arrayBuffer()),png,'The copied icon has the original verified PNG bytes');
 assert.deepEqual(applied.config.links,savedBrand.links);assert.equal(applied.persisted,false);
 assert.equal(allRows('page_brand_presets'),accountBefore.page_brand_presets,'Applying does not rewrite the global brand preset');
 const uploadRoute=await load('app/api/uploads/[id]/route.ts');
 let media=await uploadRoute.GET(new Request('https://fivegen.test/api/uploads/'+firstDraft.upload.id),ctx(firstDraft.upload.id));
 assert.equal(media.status,200,'A retained creator recording still plays for its owner after product deletion');
 assert.equal(await media.text(),'synthetic-media');
 assert.equal(media.headers.get('cache-control'),'private, no-store');
 actor={userId:foreignOwner,email:'another-owner@example.test'};
 assert.equal((await uploadRoute.GET(new Request('https://fivegen.test/api/uploads/'+firstDraft.upload.id),ctx(firstDraft.upload.id))).status,404,'Retained recordings remain private to their owner');
 actor=null;assert.equal((await uploadRoute.GET(new Request('https://fivegen.test/api/uploads/'+firstDraft.upload.id),ctx(firstDraft.upload.id))).status,401);
 actor={userId:owner,email:'delete-owner@example.test'};
 assert.equal((await uploadRoute.DELETE(request({}),ctx(firstDraft.upload.id))).status,409,'A source recording cannot be deleted while retained by Creator Library');
 Object.assign(deps,await load('lib/creator-voice.ts'));
 deps.recoverCreatorRuns=async()=>{};
 const voice=await load('lib/creator-voice-server.ts');
 const retained=await voice.getVoiceSource(sharedSource.id,owner);
 assert.equal(retained.uploadAvailable,true);
 const sourceUpdate={productId:first.id,title:retained.title,kind:retained.kind,transcript:retained.transcript+' Added creator context.',evidence:retained.evidence,uploadId:retained.uploadId,permission:true,approved:true,expectedUpdatedAt:retained.updatedAt};
 assert.equal((await voice.saveVoiceSource(sharedSource.id,owner,sourceUpdate)).productId,first.id,'A retained source stays editable with its immutable originating product UUID');
 await assert.rejects(()=>voice.saveVoiceSource(sharedSource.id,owner,{...sourceUpdate,productId:survivor.id}),error=>error.status===409,'An orphan origin does not permit moving a source into another product');
 await assert.rejects(()=>voice.saveVoiceSource(null,owner,{...sourceUpdate,expectedUpdatedAt:0}),error=>error.status===404,'Creating a new source still requires an existing owned product');
 assert.equal((await route.DELETE(request(confirmation),ctx(first.id))).status,404,'Repeated deletion cannot target a different product');

 // Exercise the actual checkout services when deletion wins immediately before
 // their reservation INSERT. Readiness is synthetic; no SDK/network is allowed.
 let checkoutProviderCalls=0;
 deps.assertEnabled=()=>{};deps.commerceMode=()=> 'test';
 deps.commerceStripe=()=>({checkout:{sessions:{create:async()=>{checkoutProviderCalls++;throw new Error('A deleted product must never open a provider checkout.');}}}});
 deps.assertCommerceContent=async()=>{};deps.commerceAccount=async()=>({ready:true});
 deps.creatorPlan=async()=>({id:'free',commissionBps:500});deps.commerceCommission=amount=>Math.round(amount*.05);
 deps.commerceProvider=async(_operation,work)=>work();
 const legacyCheckout=await load('lib/commerce-v2-server.ts',['publicCommerceRow','commerceHash','cookieValue','cookieOwns','commerceCookie','createCommerceCheckout']);
 const legacyProduct=product('Deleting before legacy checkout reservation');
 sql.prepare("UPDATE products SET status='published' WHERE id=?").run(legacyProduct.id);
 insert('commerce_accounts',{owner,key:'test:'+owner,mode:'test',account_id:'acct_deletion_fixture',status:'ready'});
 insert('commerce_offers',{owner,product_id:legacyProduct.id,enabled:1,enabled_mode:'test',amount:4900,currency:'usd',updated_at:now});
 insert('growth_funnels',{owner,product_id:legacyProduct.id,slug:legacyProduct.slug,title:legacyProduct.title,landing:'{}',published_at:now});
 let legacyDeleted=false;
 beforeStatement={match:/INSERT INTO commerce_orders/,work:async()=>{const state=await deps.getProductDeletion(legacyProduct.id,owner);await deps.deleteProduct(legacyProduct.id,owner,{title:legacyProduct.title,expectedUpdatedAt:legacyProduct.updated_at,revision:state.revision});legacyDeleted=true;}};
 await assert.rejects(()=>legacyCheckout.createCommerceCheckout(new Request('https://fivegen.test/api/commerce/checkout'),{slug:legacyProduct.slug,email:'buyer@example.test',requestId:randomUUID()}),error=>error.status===409&&/removed|changed/.test(error.message));
 assert.equal(legacyDeleted,true,'The legacy checkout reached the reservation before deletion won');
 assert.equal(count('commerce_orders',legacyProduct.id),0,'Deletion prevents an orphaned legacy pending order');
 assert.equal(checkoutProviderCalls,0,'No Stripe checkout session opens for a deleted legacy product');

 deps.requireFileSales=()=>{};deps.commissionAmount=amount=>Math.round(amount*.05);
 deps.stripe=async()=>{checkoutProviderCalls++;throw new Error('A deleted file sale must never open a provider checkout.');};
 const fileProduct=product('Deleting before file-sale reservation'),revisionId=randomUUID();
 sql.prepare("UPDATE products SET status='published' WHERE id=?").run(fileProduct.id);
 insert('file_sale_revisions',{id:revisionId,product_id:fileProduct.id,version:1,snapshot:'{}'});
 insert('file_sale_drafts',{product_id:fileProduct.id,version:1,data:'{}',published_revision_id:revisionId});
 insert('sellers',{owner,stripe_account:'acct_deletion_fixture'});
 deps.getPublishedFileSale=async()=>({product:fileProduct,snapshot:{title:fileProduct.title,priceCents:4900},revisionId,readiness:{ready:true,checks:[]}});
 const fileCheckout=await load('lib/file-sales.ts',['startFileSaleCheckout']);
 let fileDeleted=false;
 beforeStatement={match:/INSERT OR IGNORE INTO checkout_intents/,work:async()=>{const state=await deps.getProductDeletion(fileProduct.id,owner);await deps.deleteProduct(fileProduct.id,owner,{title:fileProduct.title,expectedUpdatedAt:fileProduct.updated_at,revision:state.revision});fileDeleted=true;}};
 await assert.rejects(()=>fileCheckout.startFileSaleCheckout(new Request('https://fivegen.test/api/checkout'),{slug:fileProduct.slug,expectedRevisionId:revisionId,requestId:randomUUID(),email:'buyer@example.test'}),error=>error.status===409&&/removed|changed/.test(error.message));
 assert.equal(fileDeleted,true,'The file-sale checkout reached the reservation before deletion won');
 assert.equal(count('checkout_intents',fileProduct.id),0,'Deletion prevents an orphaned file-sale checkout intent');
 assert.equal(checkoutProviderCalls,0,'Neither deleted-product path opens a provider checkout session');
 assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 console.log('Product deletion passed: exact-title/version confirmation, authentication/owner/CSRF boundaries, historical-order and booking preservation, in-flight work/email blockers, isolated full-content cleanup across real production migrations, accounting/global-library retention, retained brand icon copying, late checkout-reservation races with zero provider sessions, and foreign-key integrity. No provider calls. Fixture: '+fixture);
}finally{storage.close();globalThis.fetch=originalFetch;}
