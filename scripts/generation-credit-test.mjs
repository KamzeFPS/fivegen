import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import {creditPolicy,creditPacks,textCredits,monthlyWindow} from '../lib/credit-policy.ts';
const sqlite=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const stmt=(sql,args=[])=>({sql,args,bind:(...v)=>stmt(sql,v),first:async()=>sqlite.prepare(sql).get(...args)||null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:sqlite.prepare(sql).run(...args).changes}})});
const db={prepare:stmt,batch:async items=>{sqlite.exec('BEGIN');try{const result=items.map(s=>({meta:{changes:sqlite.prepare(s.sql).run(...s.args).changes}}));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const owner='generation-credits',deps={z,zodToJsonSchema,ApiError,database:()=>db,creditPolicy,creditPacks,textCredits,monthlyWindow,mcpCreditLimit:new AsyncLocalStorage(),binding:()=>'',stripe:()=>{throw Error('No payments in this test');}};
async function load(path){const key='test'+crypto.randomUUID().replaceAll('-','');globalThis[key]={...deps};const source=fs.readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;const loaded=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete globalThis[key];return loaded;}
Object.assign(deps,await load('lib/product.ts'),await load('lib/product-recipes.ts'));
Object.assign(deps,await load('lib/generation-access.ts'));
Object.assign(deps,await load('lib/product-allowance.ts'));
Object.assign(deps,await load('lib/subscription-credits.ts'));
Object.assign(deps,await load('lib/credits.ts'));
let fail=false,providerCalls=0;
Object.assign(deps,{
 identity:async()=>({userId:owner}),sameOrigin:()=>{},failure:e=>Response.json({error:e.message},{status:e.status||500}),
 ownedProduct:async id=>sqlite.prepare('SELECT * FROM products WHERE id=? AND owner=?').get(id,owner),
 productFromRow:r=>({...r,price:r.price/100,content:JSON.parse(r.content),updatedAt:r.updated_at,createdAt:r.created_at}),
 providerSettings:async()=>({config:{textProvider:'openai'}}),productSystem:'test',
 // Only provider transport is replaced; route, schemas, quota, wallets, and SQL are real.
 textGeneration:async(_owner,_system,prompt)=>{providerCalls++;if(fail)throw new ApiError('Provider failure fixture',502);if(prompt.startsWith('Design'))return {sections:[1,2,3].map(n=>({title:'Lesson '+n,objective:'Practice the technique '+n})),benefits:['Understand the inputs','Practice the process','Check your work']};if(prompt.startsWith('Write'))return {body:'A useful concrete exercise with step-by-step instructions. '.repeat(12)};return {launch:'Finished launch material with accurate product descriptions. '.repeat(15),salesCopy:'An honest product description explaining the outcomes and exercises. '.repeat(4),files:[{name:'workbook.md',content:'A completed workbook.',description:'Practice'}],imagePrompt:'Create an original marketing image for this useful product.',videoPrompt:'A cinematic five-second campaign video with an original product identity.'};},
});
const route=await load('app/api/products/[id]/generate/route.ts');
const add=()=>{const id=crypto.randomUUID();sqlite.prepare("INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) VALUES (?,?,?,'Generation test','A useful product with a distinctive audience.','Independent makers','Guide',0,'orange',?,'draft',?,?)").run(id,owner,id,JSON.stringify(deps.emptyContent({format:'Guide'})),Date.now(),Date.now());return id;};
async function step(id,allowCredits=false,status=200){const r=await route.POST(new Request('http://local/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({allowCredits,maxStepCredits:10})}),{params:Promise.resolve({id})});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
for(let n=0;n<3;n++){const id=add();let done=false;while(!done){const d=await step(id);assert.equal(d.mode,'included');done=d.done;}assert.equal((await deps.creditBalance(owner)).total,0);}
assert.equal((await deps.productAllowance(owner)).remaining,0);
const fourth=add(),calls=providerCalls;await step(fourth,false,402);assert.equal(providerCalls,calls,'No provider work before credit confirmation');
await step(fourth,true,402);assert.equal(providerCalls,calls,'No provider work without purchased credits');
sqlite.prepare('UPDATE wallets SET purchased=100 WHERE owner=?').run(owner);
fail=true;await step(fourth,true,502);assert.equal((await deps.creditBalance(owner)).purchased,100,'Failed paid outline is refunded');
fail=false;await step(fourth,true);assert.equal((await deps.creditBalance(owner)).purchased,90);
fail=true;await step(fourth,true,502);assert.equal((await deps.creditBalance(owner)).purchased,90,'Failed section is refunded');
fail=false;let done=false;while(!done)done=(await step(fourth,true)).done;
assert.equal((await deps.creditBalance(owner)).purchased,50,'Only five completed steps cost credits');
await step(fourth,true);assert.equal((await deps.creditBalance(owner)).purchased,50,'Completed job cannot charge twice');
await route.DELETE(new Request('http://local/api/generate',{method:'DELETE'}),{params:Promise.resolve({id:fourth})});
await step(fourth,false,402);assert.equal((await deps.productAllowance(owner)).used,3,'Stopping does not erase used monthly allowance');
sqlite.prepare('INSERT INTO terms_acceptances VALUES (?,?,?,?,?)').run('owner-access',owner,'fixture','kamzewac@gmail.com',Date.now());
const walletBefore=(await deps.creditBalance(owner)).purchased;
for(let n=0;n<2;n++){const id=add();let complete=false;while(!complete){const d=await step(id);assert.equal(d.mode,'unlimited');complete=d.done;}}
assert.equal((await deps.creditBalance(owner)).purchased,walletBefore,'Unlimited full products do not deduct existing credits');
assert.equal((await deps.productAllowance(owner)).used,3,'Previous included usage is retained');
sqlite.close();console.log('Passed: staged generation, normal quotas and credit consent, owner unlimited full products without deductions, refunds, and retries. Provider transport uses isolated fixtures.');
