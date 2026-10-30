import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {resolve,sep} from 'node:path';
import ts from 'typescript';
import {z} from 'zod';

// Local fixture process only. Inherited production credentials/configuration are
// discarded before seeding or loading the application. No dotenv is loaded.
assert.ok(!process.env.RENDER,'Run the synthetic design studio locally, never on Render.');
const safeEnvironment=new Set(['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL','LC_CTYPE','TZ','SystemRoot','SYSTEMROOT','WINDIR']);
for(const key of Object.keys(process.env))if(!safeEnvironment.has(key))delete process.env[key];
const appRoot=resolve(process.cwd()),appPort=5248,entryPort=5249,owner='synthetic-design-preview',email='creator@example.test';
const originalFetch=globalThis.fetch,require=createRequire(import.meta.url),local=host=>['localhost','127.0.0.1','[::1]','::1'].includes(host);
function load(path,deps={}){const source=readFileSync(resolve(appRoot,path),'utf8').replace(/^import[^\n]*\n/gm,''),exports={};new Function('exports',...Object.keys(deps),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,...Object.values(deps));return exports;}
const contract=load('lib/design-document.ts',{z}),templates=load('lib/design-templates.ts');
let interceptedCalls=0;
function deterministicDesign(request){
 const spec=z.object({kind:z.enum(contract.designKinds),pageCount:z.number().int().min(1).max(6),width:z.number().int().min(240).max(4096),height:z.number().int().min(240).max(4096),prompt:z.string()}).parse(request.designRequest);
 const templateId=({'colouring-book':'woodland-colouring',poster:'event-poster',worksheet:'reflection-worksheet',social:'social-launch',blank:'reflection-worksheet',invitation:'wedding-garden'})[spec.kind],first=templates.createDesignFromTemplate(templateId),second=spec.kind==='invitation'?templates.createDesignFromTemplate('birthday-confetti'):first;
 const sourcePages=spec.kind==='invitation'?[first.pages[0],second.pages[0]]:first.pages;
 const document=contract.designDocumentSchema.parse({...first,title:'LOCAL DEMO · '+first.title,kind:spec.kind,pages:Array.from({length:spec.pageCount},(_,index)=>{
  const page=structuredClone(sourcePages[index%sourcePages.length]),sx=spec.width/page.width,sy=spec.height/page.height,scale=Math.min(sx,sy);
  return {...page,id:randomUUID(),name:page.name+' · '+(index+1),width:spec.width,height:spec.height,elements:page.elements.map(element=>({...element,id:randomUUID(),x:element.x*sx,y:element.y*sy,width:Math.max(1,element.width*sx),height:Math.max(1,element.height*sy),...(element.type==='text'?{fontSize:Math.max(6,Math.min(600,element.fontSize*scale))}:{strokeWidth:Math.min(100,element.strokeWidth*scale)})}))};
 })});
 // The real provider schema excludes identities; the real server assigns them.
 return {...document,pages:document.pages.map(({id,...page})=>{void id;return {...page,elements:page.elements.map(({id,...element})=>{void id;return element;})};})};
}
async function guardedFetch(input,init){
 const target=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(local(target.hostname))return originalFetch(input,init);
 if(target.href==='https://api.openai.com/v1/responses'){
  assert.equal(init?.method||(input instanceof Request?input.method:'GET'),'POST','Only the synthetic design generation POST is intercepted.');
  const raw=typeof init?.body==='string'?init.body:input instanceof Request?await input.clone().text():'',body=JSON.parse(raw);
  assert.ok(typeof body.instructions==='string'&&body.instructions.includes("You are FiveGen's editable visual design artist."),'Other AI tasks are disabled in this synthetic preview.');
  assert.equal(typeof body.input,'string');const marker='\n\nRequest:\n',index=body.input.lastIndexOf(marker);assert.ok(index>=0,'Expected the real design generation request envelope.');
  const request=JSON.parse(body.input.slice(index+marker.length));assert.ok(request.designRequest&&request.savedProduct,'Expected a design request and saved product facts.');
  assert.equal(request.status,'Private editable design proposal. Apply or append requires creator review; nothing is published.');
  interceptedCalls++;
  if(String(request.designRequest.prompt).includes('[fixture-fail]'))return Response.json({error:{code:'synthetic_design_failure',message:'Local synthetic failure. No provider request occurred.'}},{status:503});
  const result=deterministicDesign(request);
  return Response.json({id:'resp_synthetic_editable_design',object:'response',status:'completed',output:[{id:'msg_synthetic_editable_design',type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:JSON.stringify(result),annotations:[]}]}],usage:{input_tokens:0,output_tokens:0,total_tokens:0}},{headers:{'x-request-id':'synthetic-local-design-response'}});
 }
 throw new Error('External network is disabled in the synthetic design studio preview.');
}
globalThis.fetch=guardedFetch;
for(const name of ['node:http','node:https']){const transport=require(name);for(const operation of ['request','get']){const original=transport[operation];transport[operation]=function(input,...args){let host;if(typeof input==='string'||input instanceof URL)host=new URL(input).hostname;else{host=String(input?.hostname||input?.host||'localhost');if(host.startsWith('['))host=host.slice(0,host.indexOf(']')+1);else host=host.split(':')[0];}assert.ok(local(host),'External HTTP(S) is disabled in this synthetic preview.');return original.call(this,input,...args);};}}
syncBuiltinESMExports();
const resumeArgument=process.argv.find(value=>value.startsWith('--resume='))||(process.argv.includes('--resume')?'--resume='+process.argv[process.argv.indexOf('--resume')+1]:null);
let fixture,previous,metadataPath;
if(resumeArgument){
 metadataPath=resolve(resumeArgument.slice('--resume='.length));assert.ok(metadataPath.startsWith(resolve(appRoot,'outputs')+sep+'design-studio-preview-')&&metadataPath.endsWith(sep+'preview-info.json'),'Resume requires this harness’s own synthetic metadata.');
 previous=JSON.parse(readFileSync(metadataPath,'utf8'));assert.equal(previous.synthetic,true);assert.equal(previous.providerCalls,false);assert.equal(previous.harness,'editable-design-studio-v1');
 fixture={synthetic:true,root:previous.dataRoot,productIds:{'template-kit':previous.productId}};
}else{
 const seeded=spawnSync(process.execPath,['scripts/design-refresh-preview.mjs','--seed-only'],{cwd:appRoot,env:{...process.env},encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000});
 assert.equal(seeded.status,0,'Synthetic product seeding failed. No app was started. '+seeded.stderr.slice(-500));const json=seeded.stdout.trim().split('\n').findLast(line=>line.startsWith('{'));assert.ok(json,'Seed metadata is missing.');fixture=JSON.parse(json);
 const evidenceRoot=resolve(appRoot,'outputs',`design-studio-preview-${Date.now()}`);mkdirSync(evidenceRoot,{recursive:true});metadataPath=resolve(evidenceRoot,'preview-info.json');
}
const dataRoot=resolve(fixture.root);assert.equal(fixture.synthetic,true);assert.ok(dataRoot.startsWith(resolve(appRoot,'outputs')+sep+'design-refresh-preview-'));assert.match(readFileSync(resolve(dataRoot,'fixture-only.txt'),'utf8'),/All users, money, files and products are local fixtures/);
const productId=fixture.productIds['template-kit'];assert.match(productId,/^[a-f0-9-]{36}$/);
Object.assign(process.env,{FIVEGEN_RUNTIME:'render',NODE_ENV:'production',FIVEGEN_DATA_DIR:dataRoot,APP_ORIGIN:`http://localhost:${appPort}`,DOCS_ORIGIN:`http://docs.localhost:${appPort}`,PORT:String(appPort),ADMIN_EMAILS:email,FIVEGEN_FILE_SALES_ENABLED:'false',STRIPE_COMMERCE_ENABLED:'false',STRIPE_WALLET_CHECKOUT_ENABLED:'false',AUTOMATIONS_WORKER_ENABLED:'false',PURCHASE_EMAILS_WORKER_ENABLED:'false',PRODUCT_REMINDERS_WORKER_ENABLED:'false',SERVICE_INTEGRATIONS_WORKER_ENABLED:'false',STRIPE_MODE:'test',PADDLE_ENVIRONMENT:'sandbox',RENDER_EXTERNAL_URL:'',PRODUCT_DOMAIN:'',GOOGLE_CLIENT_ID:'synthetic-design-studio-preview',GOOGLE_CLIENT_SECRET:'synthetic-design-studio-preview',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),OPENAI_API_KEY:'synthetic-no-provider-key'});
const {createStorage}=await import('../runtime/render/storage.mjs'),storage=createStorage(dataRoot),db=storage.sqlite,session=randomBytes(32).toString('base64url'),now=Date.now();
assert.ok(db.prepare('SELECT id FROM products WHERE id=? AND owner=?').get(productId,owner));
db.prepare('INSERT INTO render_sessions(hash,user_id,email,name,expires) VALUES(?,?,?,?,?)').run(createHash('sha256').update(session).digest('base64url'),owner,email,'Alex Morgan',now+86400000);storage.close();
const info={...previous,synthetic:true,harness:'editable-design-studio-v1',providerCalls:false,entryURL:`http://localhost:${entryPort}/design-preview`,appURL:`http://localhost:${appPort}/build/${productId}?area=design`,productId,dataRoot,metadataPath,note:'Isolated synthetic records. Only editable design generation is intercepted using local vector templates. No real AI, payment, email or external requests. Prompt [fixture-fail] simulates provider failure and refund. Set page count2 for a two-page colouring-book or invitation proposal.'};
if(process.argv.includes('--verify')){
 const envelope=spec=>({instructions:"You are FiveGen's editable visual design artist.",input:'Return only JSON.\n\nRequest:\n'+JSON.stringify({designRequest:{kind:'colouring-book',pageCount:2,width:794,height:1123,prompt:'Two original woodland colouring pages',...spec},savedProduct:{title:'Local demo',language:'English'},status:'Private editable design proposal. Apply or append requires creator review; nothing is published.'})});
 for(const kind of ['colouring-book','invitation']){const response=await guardedFetch('https://api.openai.com/v1/responses',{method:'POST',body:JSON.stringify(envelope({kind}))}),payload=await response.json(),document=JSON.parse(payload.output[0].content[0].text);assert.equal(document.pages.length,2);assert.equal(document.kind,kind);assert.ok(document.pages.every(page=>!('id'in page)&&page.elements.length>10&&page.elements.every(element=>!('id'in element)&&element.type!=='image')));}
 assert.equal((await guardedFetch('https://api.openai.com/v1/responses',{method:'POST',body:JSON.stringify(envelope({prompt:'[fixture-fail]'}))})).status,503);
 await assert.rejects(guardedFetch('https://api.stripe.com/v1/accounts'),/disabled/);await assert.rejects(guardedFetch('https://api.openai.com/v1/responses',{method:'POST',body:JSON.stringify({instructions:'Other AI task'})}),/Other AI tasks/);assert.throws(()=>require('node:https').request('https://example.test/private'),/disabled/);
 info.selfCheck='Passed: schema-valid2pagecolouring/invitationvectorfixtures withoutproviderIDs, failure503, all other provider/payment/network boundaries blocked.';
}
writeFileSync(metadataPath,JSON.stringify(info,null,2));
if(!process.argv.includes('--seed-only')&&!process.argv.includes('--verify')){
 const previousLog=console.log;try{console.log=()=>{};await (await import('../runtime/render/server.mjs')).start();}finally{console.log=previousLog;}
 const entry=createServer((req,res)=>{if(req.headers.host!==`localhost:${entryPort}`||req.url!=='/design-preview'||req.method!=='GET'){res.writeHead(404,{'Cache-Control':'no-store'});res.end('Synthetic editable design preview entry only.');return;}res.writeHead(303,{'Set-Cookie':`fivegen-local-session=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,Location:info.appURL,'Cache-Control':'no-store'});res.end();});await new Promise((done,reject)=>{entry.once('error',reject);entry.listen(entryPort,'127.0.0.1',done);});
 if(process.argv.includes('--check')){
  // Real HTTP API checks use a separate product so browser edits survive checks.
  const request=async(path,options={})=>{const response=await guardedFetch(`http://localhost:${appPort}`+path,{...options,headers:{Cookie:`fivegen-local-session=${session}`,Origin:`http://localhost:${appPort}`,'Content-Type':'application/json',...options.headers}});return response;};
  const json=async(path,options={})=>{const response=await request(path,options),body=await response.json();assert.ok(response.ok,path+': '+JSON.stringify(body));return body;};
  const checkProductId=randomUUID(),checkWorkspace=await json('/api/builder',{method:'POST',body:JSON.stringify({type:'template-kit',source:'manual',requestId:checkProductId})}),beforeCredits=(await json('/api/credits')).balance.total;
  const generation={expectedVersion:checkWorkspace.version,requestId:randomUUID(),maxCredits:10,prompt:'Two original woodland colouring pages',kind:'colouring-book',pageCount:2,width:794,height:1123},result=await json(`/api/builder/${checkProductId}/design/generate`,{method:'POST',body:JSON.stringify(generation)});
  assert.equal(result.document.pages.length,2);assert.equal(result.spent,10);assert.equal((await json(`/api/builder/${checkProductId}`)).version,checkWorkspace.version);assert.deepEqual((await json(`/api/builder/${checkProductId}`)).draft,checkWorkspace.draft,'Proposal HTTP route cannot apply a design');assert.equal((await json('/api/credits')).balance.total,beforeCredits-10);
  const calls=interceptedCalls;assert.deepEqual(await json(`/api/builder/${checkProductId}/design/generate`,{method:'POST',body:JSON.stringify({...generation,maxCredits:0})}),result);assert.equal(interceptedCalls,calls);assert.equal((await json('/api/credits')).balance.total,beforeCredits-10);
  const failed=await request(`/api/builder/${checkProductId}/design/generate`,{method:'POST',body:JSON.stringify({...generation,requestId:randomUUID(),prompt:'[fixture-fail]'})});assert.equal(failed.status,502);assert.equal((await json('/api/credits')).balance.total,beforeCredits-10,'Synthetic provider failure refunds its debit');
  await json(`/api/builder/${checkProductId}`,{method:'PATCH',body:JSON.stringify({expectedVersion:checkWorkspace.version,draft:{...checkWorkspace.draft,studio:{...checkWorkspace.draft.studio,design:result.document}}})});
  const exports={};for(const format of ['json','svg','pdf','zip']){const response=await request(`/api/builder/${checkProductId}/design/export?format=${format}`);assert.equal(response.status,200,format+' export failed');assert.equal(response.headers.get('cache-control'),'private, no-store');const bytes=new Uint8Array(await response.arrayBuffer());assert.ok(bytes.length>100);if(format==='pdf')assert.equal(Buffer.from(bytes.subarray(0,5)).toString(),'%PDF-');if(format==='zip')assert.equal(Buffer.from(bytes.subarray(0,2)).toString(),'PK');exports[format]=bytes.length;}
  info.httpCheck={passed:true,checkProductId,generationPages:2,spent:10,duplicateCalls:0,failureRefunded:true,exports};writeFileSync(metadataPath,JSON.stringify(info,null,2));
 }
}
console.log(JSON.stringify(info));
