import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import ts from 'typescript';
import {z} from 'zod';
import {createStorage} from '../runtime/render/storage.mjs';

// Retained synthetic data only. Exercise the actual paid-order authentication,
// presentation schemas and private storage response without provider traffic.
const root=resolve('outputs/customer-media-qa',randomUUID()),storage=createStorage(root),sql=storage.sqlite;
const owner='customer-media-creator',buyerEmail='buyer@example.test';
let user=null,mode='test',objectReads=0;
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const deps={
 z,createHash,ApiError,database:()=>storage.DB,binding:key=>key==='STRIPE_MODE'?mode:'',
 env:{BUCKET:{get:async(...args)=>{objectReads++;return storage.BUCKET.get(...args);}}},
 identity:async()=>{if(!user)throw new ApiError('Sign in.',401);return user;},
 ownedProduct:async(id,who)=>{const row=sql.prepare('SELECT * FROM products WHERE id=? AND owner=?').get(id,who);if(!row)throw new ApiError('Product unavailable.',404);return row;},
 failure:error=>Response.json({error:error instanceof ApiError?error.message:'Invalid request.'},{status:error instanceof ApiError?error.status:400}),
};
async function load(path,selected){
 const key='customerMediaQA'+randomUUID().replaceAll('-','');globalThis[key]={...deps};
 let source=readFileSync(path,'utf8');
 if(selected){const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);source=parsed.statements.filter(statement=>ts.isFunctionDeclaration(statement)&&selected.includes(statement.name?.text)).map(statement=>statement.getText(parsed)).join('\n');}
 else source=source.replace(/^import[\s\S]*?;\r?\n/gm,'');
 const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 const loaded=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete globalThis[key];return loaded;
}
for(const path of ['lib/commerce.ts','lib/experience.ts','lib/product.ts','lib/builder-contract.ts','lib/builder-publication-contract.ts','lib/upload-validation.ts','lib/builder-delivery-server.ts','lib/purchase-email.ts'])Object.assign(deps,await load(path));
Object.assign(deps,await load('lib/commerce-v2-server.ts',['commerceMode','commerceHash','cookieValue','cookieOwns','customerOrder','safeDeliveryUrl','getCommerceOffer','customerProduct','customerCover']));
const coverRoute=await load('app/api/commerce/customer/[id]/cover/route.ts'),productRoute=await load('app/api/commerce/customer/[id]/route.ts');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7koAAAAASUVORK5CYII=','base64');
const revisedPng=Buffer.concat([png,Buffer.from('retained revised promotional cover')]);
const base='https://customer.example.test';
const request=(cookie='')=>new Request(base+'/api/commerce/customer/cover',{headers:cookie?{cookie}:{}});
const context=id=>({params:Promise.resolve({id})});
function product(format='Book',who=owner){
 const id=randomUUID(),content={sections:[{title:'Legacy private chapter',body:'Original legacy purchased text.'}],files:[],benefits:[],launch:''};
 sql.prepare("INSERT INTO products(id,owner,slug,title,description,audience,format,price,color,content,status,commerce,experience,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,who,'media-'+id,'Private draft title','PRIVATE DRAFT DESCRIPTION','Private draft audience',format,1900,'orange',JSON.stringify(content),'draft','{}','{}',Date.now(),Date.now());
 return id;
}
async function upload(productId,{who=owner,mime='image/png',bytes=png,status='completed',hash=true,key,missing=false,size=bytes.length}={}){
 const id=randomUUID(),objectKey=key||`customer-media/${id}`;
 if(!missing)await storage.BUCKET.put(objectKey,bytes);
 sql.prepare('INSERT INTO uploads (id,owner,product_id,name,mime,size,object_key,status,sha256,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,who,productId,'cover.png',mime,size,objectKey,status,hash?createHash('sha256').update(bytes).digest('hex'):null,Date.now(),Date.now());
 return id;
}
function snapshot(type='book',extra={}){
 const info=deps.builderTypeDetails[type];
 return deps.builderDeliverySnapshotSchema.parse({
  title:`Purchased ${info.name}`,format:info.format,builderType:type,deliveryFamily:info.family,
  description:'Reviewed product description.',sections:[{title:'Purchased original section',body:'Only the originally purchased content.'}],files:[],uploadIds:[],
  meetingUrl:'https://meeting.example.test/private',intakePrompt:'What would you like to work on?',
  communityUrl:'https://community.example.test/private-members',serviceScope:'One private portfolio review.',preparation:'Bring your portfolio.',
  welcome:'Welcome to the purchased community.',rules:'Respect fellow members.',usageInstructions:'Copy and customize your files.',compatibleTools:'A spreadsheet editor.',
  dailyTime:'Twenty minutes daily.',completionCriteria:'Complete the activity and reflection.',...extra,
 });
}
async function order(productId,delivery,{status='paid',who=owner,email=buyerEmail,version=1,createdAt=Date.now()}={}){
 const id=randomUUID(),token=randomUUID()+randomUUID();
 sql.prepare("INSERT INTO commerce_orders(id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at,paid_at) VALUES(?,?,?,'acct_fixture','test',?,1900,'usd',?,?,?,?,?)").run(id,who,productId,email,'Purchased product',status,await deps.commerceHash(token),createdAt,status==='paid'?createdAt:null);
 if(delivery)sql.prepare('INSERT INTO product_builder_order_snapshots(order_id,product_id,publication_version,snapshot,created_at) VALUES(?,?,?,?,?)').run(id,productId,version,JSON.stringify(delivery),Date.now());
 return {id,cookie:`fivegen_purchase_${id.replaceAll('-','')}=${token}`,productId};
}
function publication(productId,content,{version=1,who=owner,hasCover=true,description='Reviewed historical description.'}={}){
 const page={title:'Reviewed public title',description,audience:'Creators',format:'Book',benefits:[],outline:[],priceCents:1900,currency:'usd',hasCover};
 sql.prepare(`INSERT INTO product_builder_publications(product_id,owner,version,slug,public_snapshot,content_snapshot,upload_ids,published_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET owner=excluded.owner,version=excluded.version,public_snapshot=excluded.public_snapshot,content_snapshot=excluded.content_snapshot`).run(productId,who,version,'cover-'+productId,JSON.stringify(page),JSON.stringify(content),'[]',Date.now(),Date.now());
}
async function responseFor(purchase){return coverRoute.GET(request(purchase.cookie),context(purchase.id));}
async function assertCover(purchase,bytes=png){
 const response=await responseFor(purchase);assert.equal(response.status,200,await response.clone().text());
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);assert.equal(response.headers.get('content-type'),'image/png');
 assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');
}
try{
 const firstProduct=product(),originalCover=await upload(firstProduct),first=await order(firstProduct,snapshot('book',{coverUploadId:originalCover}));
 const originalSnapshot=sql.prepare('SELECT snapshot FROM product_builder_order_snapshots WHERE order_id=?').get(first.id).snapshot;
 await assertCover(first);
 const data=await deps.customerProduct(request(first.cookie),first.id);
 assert.equal(data.coverUrl,`/api/commerce/customer/${first.id}/cover`);assert.equal(data.builderType,'book');assert.equal(data.description,'Reviewed product description.');assert.equal(data.deliveryEmail,null);
 assert.equal(JSON.stringify(data).includes(originalCover),false,'Customer metadata does not reveal the underlying cover upload ID');
 assert.equal(JSON.stringify(data).includes('PRIVATE DRAFT'),false,'Current private product fields cannot replace frozen buyer presentation');
 const readsBeforeDenials=objectReads;
 for(const cookie of ['',first.cookie+'wrong']){
  const result=await coverRoute.GET(request(cookie),context(first.id));assert.equal(result.status,403);assert.equal(result.headers.get('cache-control'),'private, no-store');
  assert.equal((await productRoute.GET(request(cookie),context(first.id))).status,403);
 }
 user={userId:'wrong-buyer',email:'other@example.test'};assert.equal((await coverRoute.GET(request(),context(first.id))).status,403);user=null;
 mode='live';assert.equal((await responseFor(first)).status,404);mode='test';
 const pending=await order(firstProduct,snapshot('book',{coverUploadId:originalCover}),{status:'pending'});
 const revoked=await order(firstProduct,snapshot('book',{coverUploadId:originalCover}),{status:'revoked'});
 assert.equal((await responseFor(pending)).status,403);assert.equal((await responseFor(revoked)).status,403);
 assert.equal(objectReads,readsBeforeDenials,'Unauthorized or unpaid requests cannot read private object storage');
 const expired=await order(firstProduct,snapshot('book',{coverUploadId:originalCover}),{createdAt:Date.now()-31*86400000});
 assert.equal((await responseFor(expired)).status,403);user={userId:'email-recovery-buyer',email:buyerEmail.toUpperCase()};await assertCover({...expired,cookie:''});user=null;

 // All eleven purchased types retain their correct semantics, even if current
 // product metadata is subsequently changed to another kind of product.
 for(const type of deps.builderTypes){
  const id=product('Custom product'),cover=await upload(id),frozen=snapshot(type,{coverUploadId:cover}),purchase=await order(id,frozen);
  const result=await deps.customerProduct(request(purchase.cookie),purchase.id);
  assert.equal(result.builderType,type);assert.equal(result.deliveryFamily,deps.builderTypeDetails[type].family);
  for(const field of ['description','welcome','rules','usageInstructions','compatibleTools','dailyTime','completionCriteria'])assert.equal(result[field],frozen[field],`${type}: ${field}`);
  assert.equal(result.service,['consulting','coaching'].includes(type));await assertCover(purchase);
 }
 const customCourse=await order(product(),snapshot('custom',{format:'Mini course',deliveryFamily:'course'}));
 assert.equal((await deps.customerProduct(request(customCourse.cookie),customCourse.id)).builderType,'custom');
 assert.equal((await deps.customerProduct(request(customCourse.cookie),customCourse.id)).deliveryFamily,'course');

 // Old checkout serialization stripped these presentation fields. Recover only
 // the exact reviewed version while preserving original files and lessons.
 const historicalProduct=product(),historicalCover=await upload(historicalProduct),historical=snapshot();
 for(const field of ['builderType','description','coverUploadId','welcome','rules','usageInstructions','compatibleTools','dailyTime','completionCriteria'])delete historical[field];
 const oldPurchase=await order(historicalProduct,historical);
 const reviewed={...historical,draft:{type:'book',description:'Reviewed historical description.',coverUploadId:historicalCover,fields:{welcome:'Published welcome.',rules:'Published rules.',instructions:'PRIVATE AUTHORING PROMPT'}}};
 publication(historicalProduct,reviewed);
 sql.prepare('INSERT INTO product_builder_workspaces(product_id,owner,version,data,updated_at) VALUES(?,?,2,?,?)').run(historicalProduct,owner,JSON.stringify({coverUploadId:originalCover,description:'PRIVATE UNPUBLISHED DESCRIPTION'}),Date.now());
 let recovered=await deps.customerProduct(request(oldPurchase.cookie),oldPurchase.id);
 assert.equal(recovered.description,'Reviewed historical description.');assert.equal(recovered.welcome,'Published welcome.');assert.equal(JSON.stringify(recovered).includes('PRIVATE'),false);assert.deepEqual(recovered.sections,historical.sections);await assertCover(oldPurchase);
 const newPublicCover=await upload(historicalProduct,{bytes:revisedPng});
 publication(historicalProduct,{...reviewed,sections:[{title:'New unpaid course',body:'Must remain unavailable.'}],draft:{type:'video-course',coverUploadId:newPublicCover,fields:{welcome:'New version private welcome.'}}},{version:2,description:'New version description.'});
 recovered=await deps.customerProduct(request(oldPurchase.cookie),oldPurchase.id);
 assert.equal(recovered.description,'','A different current publication cannot rewrite the purchase description');
 assert.equal(recovered.welcome,'');assert.deepEqual(recovered.sections,historical.sections);
 await assertCover(oldPurchase,revisedPng); // Promotional public-cover fallback only.
 publication(historicalProduct,{draft:{coverUploadId:newPublicCover}},{version:3,hasCover:false});
 assert.equal((await responseFor(oldPurchase)).status,404,'A current cover not marked public cannot be borrowed by a historical purchase');
 const frozenNext=await upload(firstProduct,{bytes:revisedPng});publication(firstProduct,{draft:{coverUploadId:frozenNext}},{version:2});await assertCover(first);
 const coverless=await order(firstProduct,snapshot('book'));assert.equal((await responseFor(coverless)).status,404,'A modern coverless purchase does not borrow a future cover');
 assert.equal(sql.prepare('SELECT snapshot FROM product_builder_order_snapshots WHERE order_id=?').get(first.id).snapshot,originalSnapshot,'Presentation recovery never mutates purchased snapshots');

 // References cannot cross owner/product boundaries, include draft/voice
 // sources, or serve active content masquerading as a cover.
 const foreignProduct=product('Book','other-creator');
 const invalid=[
  await upload(firstProduct,{who:'other-creator'}),await upload(foreignProduct,{who:owner}),
  await upload(firstProduct,{status:'processing'}),await upload(firstProduct,{hash:false}),
  await upload(firstProduct,{mime:'image/svg+xml',bytes:Buffer.from('<svg onload="alert(1)"/>')}),
  await upload(firstProduct,{mime:'image/png',bytes:Buffer.from('<html><script>alert(1)</script></html>')}),
  await upload(firstProduct,{key:'voice/'+randomUUID()}),await upload(firstProduct,{missing:true}),
  await upload(firstProduct,{size:png.length+100}),
 ];
 const voice=await upload(firstProduct);
 sql.prepare("INSERT INTO creator_voice_sources(id,owner,product_id,title,kind,upload_id,updated_at) VALUES(?,?,?,'Private voice source','upload',?,?)").run(randomUUID(),owner,firstProduct,voice,Date.now());invalid.push(voice);
 for(const cover of invalid){const purchase=await order(firstProduct,snapshot('book',{coverUploadId:cover}));assert.equal((await responseFor(purchase)).status,404,'Invalid cover remains private: '+cover);}
 const foreignPublication=product();publication(foreignPublication,{draft:{coverUploadId:originalCover}},{who:'other-creator'});const foreignOrder=await order(foreignPublication,historical);assert.equal((await responseFor(foreignOrder)).status,404);
 const legacy=await order(product('Book / Ebook'),null),legacyData=await deps.customerProduct(request(legacy.cookie),legacy.id);
 assert.equal(legacyData.builderType,'book');assert.equal(legacyData.deliveryFamily,'document');assert.equal(legacyData.description,'');assert.equal(legacyData.coverUrl,null);assert.equal(legacyData.sections[0].body,'Original legacy purchased text.','Existing non-builder delivery stays unchanged');
 assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
 console.log('Customer media tests passed: all 11 product types, frozen presentation, exact-version historical recovery, public-only promotional fallback, paid/mode/email/cookie authorization, cross-owner/product denial, voice/draft/active-content rejection, original cover preservation, and unchanged legacy delivery.');
 console.log('Synthetic fixtures retained: '+root);
}finally{storage.close();}
