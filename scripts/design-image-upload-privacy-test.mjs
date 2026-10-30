import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Run the real upload route and buyer access functions against a legitimate
// product purchase. A private candidate must never inherit broad file access.
const product={id:'product-one',owner:'owner@example.test',status:'published',commerce:'{}'};
let actor={userId:product.owner,email:product.owner},bucketReads=0,orderChecks=0;
const upload={id:'candidate-one',owner:product.owner,product_id:product.id,object_key:'design-images/owner/product/run/candidate.png',mime:'image/png',name:'Generated artwork.png',size:3,status:'completed'};
const database=()=>({prepare(query){return{bind(){return{first:async()=>query.includes('FROM uploads')?upload:query.includes('FROM products')?product:null,all:async()=>({results:query.includes('FROM orders')?[{id:'order-one',owner:product.owner,product_id:product.id,email:'buyer@example.test',status:'paid'}]:[]})};}};}});
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const identity=async()=>{if(!actor)throw new ApiError('Sign in.',401);return actor;};
const scope={database,ApiError,identity,assertSubscriptionAccess:async()=>{orderChecks++;},orderItems:()=>[],failure:error=>Response.json({error:error.message},{status:error.status||500}),env:{BUCKET:{get:async()=>{bucketReads++;return{body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2,3]));controller.close();}})};}}}};
function load(source){const out={};new Function('exports',...Object.keys(scope),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,...Object.values(scope));Object.assign(scope,out);return out;}
const fileSource=fs.readFileSync('lib/file-sales.ts','utf8'),ast=ts.createSourceFile('file-sales.ts',fileSource,ts.ScriptTarget.Latest,true);
load(ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&['resolveFileSaleAccess','fileSaleUploadAllowed'].includes(node.name?.text)).map(node=>node.getText(ast)).join('\n'));
load(fs.readFileSync('lib/access.ts','utf8').replace(/^import[^\n]*\n/gm,''));
const route=load(fs.readFileSync('app/api/uploads/[id]/route.ts','utf8').replace(/^import[^\n]*\n/gm,'')),get=()=>route.GET(new Request('http://localhost/api/uploads/candidate-one'),{params:Promise.resolve({id:upload.id})});
let response=await get();assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,3);assert.match(response.headers.get('Cache-Control'),/private/);
actor={userId:'buyer',email:'buyer@example.test'};const before=bucketReads;response=await get();assert.equal(response.status,404,'Even a legitimate product purchaser cannot fetch an unapplied design original');assert.equal(bucketReads,before,'Denied buyers never read original bytes');assert.equal(orderChecks,0,'Design originals do not inherit broad product purchase access');
actor=null;assert.equal((await get()).status,401);assert.equal(bucketReads,before);
actor={userId:'outsider',email:'outsider@example.test'};assert.equal((await get()).status,404);assert.equal(bucketReads,before);
upload.object_key='classes/owner/product/explicit-image';actor={userId:'buyer',email:'buyer@example.test'};response=await get();assert.equal(response.status,200,'The existing ordinary product-image pipeline retains its authorized buyer access');assert.equal(orderChecks,1,'The control case exercises the actual purchase entitlement check');
console.log('Design image upload privacy passed: owner preview, anonymous/foreign/purchaser denial before storage access, and preserved ordinary product-file entitlement. Actual route and access functions; no provider calls.');
