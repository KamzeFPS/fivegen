import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { defaultCommerce, initialBlocks } from '../lib/commerce.ts';
import { unzipSync, strFromU8 } from 'fflate';
const base='http://localhost:5173',root='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const file=fs.readdirSync(root).find(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite');
assert.ok(file,'Run against the local development database only');
const db=new DatabaseSync(root+'/'+file);db.exec('PRAGMA busy_timeout=5000');
const statePath='outputs/commerce-qa.json';
function cleanup(state){
 for(const id of state.ids){db.prepare('DELETE FROM orders WHERE product_id=?').run(id);db.prepare('DELETE FROM checkout_intents WHERE product_id=?').run(id);db.prepare('DELETE FROM generation WHERE product_id=?').run(id);db.prepare('DELETE FROM visits WHERE product_id=?').run(id);db.prepare('DELETE FROM products WHERE id=?').run(id);}
 if(state.owner){db.prepare('DELETE FROM memberships WHERE owner=?').run(state.owner);if(state.membership){const r=state.membership;db.prepare('INSERT INTO memberships (owner,customer_id,subscription_id,status,interval,period_end,cancel_at_period_end,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(r.owner,r.customer_id,r.subscription_id,r.status,r.interval,r.period_end,r.cancel_at_period_end,r.updated_at);}}
}
if(process.argv.includes('--cleanup')){cleanup(JSON.parse(fs.readFileSync(statePath,'utf8')));fs.unlinkSync(statePath);console.log('Local commerce fixtures removed; previous membership restored.');process.exit();}
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
async function call(path,method='GET',body,expected=200,auth=true){const r=await fetch(base+path,{method,headers:{...(auth?{cookie}:{}),'Content-Type':'application/json',origin:base},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,expected,`${method} ${path}: ${JSON.stringify(data).slice(0,250)}`);return data;}
const state={ids:[],owner:null,membership:null};let keep=false;
try{
 const ws=await call('/api/workspace');assert.ok(ws.plan.used<7,'Use a local account with room for test products');
 const brief={generationMode:'manual',title:'Launch Studio — local commerce test',description:'A complete local QA product to test pricing and secure digital delivery.',audience:'Local testing only',format:'Guide',price:49,color:'orange'};
 async function create(title,price){const {product}=await call('/api/products','POST',{...brief,title,price});state.ids.push(product.id);await call(`/api/products/${product.id}/generate`,'DELETE');product.content.sections[0].body='Completed local test content for checkout and delivery verification.';return product;}
 let main=await create(brief.title,49),bonus=await create('Bonus workbook — local test',19),extra=await create('Creator toolkit — local test',29);
 state.owner=db.prepare('SELECT owner FROM products WHERE id=?').get(main.id).owner;state.membership=db.prepare('SELECT * FROM memberships WHERE owner=?').get(state.owner)||null;
 db.prepare('DELETE FROM memberships WHERE owner=?').run(state.owner);
 for(const p of [main,bonus,extra])await call(`/api/products/${p.id}`,'PATCH',{...p,status:'published'});
 main={...main,status:'published'};bonus={...bonus,status:'published'};extra={...extra,status:'published'};
 const premium=defaultCommerce();premium.deal={...premium.deal,type:'bogo',productId:bonus.id};premium.upsell={...premium.upsell,enabled:true,productId:extra.id,price:9};premium.funnel={...premium.funnel,enabled:true,blocks:initialBlocks(main.title,main.description,main.content.benefits)};
 await call(`/api/products/${main.id}`,'PATCH',{...main,commerce:premium},403);
 // The product quota is enforced by an atomic conditional INSERT, including concurrent requests.
 const count=db.prepare('SELECT COUNT(*) n FROM products WHERE owner=?').get(state.owner).n;
 const fillers=[];
 for(let i=count;i<9;i++){const id=crypto.randomUUID();fillers.push(id);state.ids.push(id);db.prepare('INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) SELECT ?,owner,?,title,description,audience,format,price,color,content,status,created_at,updated_at FROM products WHERE id=?').run(id,'qa-'+id,main.id);}
 const attempts=await Promise.all([0,1].map(async i=>{const r=await fetch(base+'/api/products',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({...brief,title:'Quota race '+i})});const d=await r.json();if(d.product){state.ids.push(d.product.id);fillers.push(d.product.id);}return r.status;}));
 assert.deepEqual(attempts.sort(),[200,403]);
 for(const id of fillers){db.prepare('DELETE FROM generation WHERE product_id=?').run(id);db.prepare('DELETE FROM products WHERE id=?').run(id);}
 db.prepare("INSERT INTO memberships(owner,status,interval,period_end,cancel_at_period_end,updated_at) VALUES (?,'active','month',?,0,?)").run(state.owner,Math.floor(Date.now()/1000)+86400,Date.now());
 const changed=await call(`/api/products/${main.id}`,'PATCH',{...main,commerce:premium});main=changed.product;
 let q=await call('/api/quote','POST',{slug:main.slug},200,false);assert.equal(q.total,4900);assert.ok(q.items.some(i=>i.id===bonus.id));assert.equal(q.items.length,2);
 q=await call('/api/quote','POST',{slug:main.slug,addUpsell:true},200,false);assert.equal(q.total,5800);assert.equal(q.items.length,3);
 await call('/api/quote','POST',{slug:main.slug,quantity:0},400,false);
 const foreign=crypto.randomUUID();state.ids.push(foreign);db.prepare('INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) SELECT ?,?, ?,title,description,audience,format,price,color,content,status,created_at,updated_at FROM products WHERE id=?').run(foreign,'other-local-owner','qa-'+foreign,main.id);
 await call(`/api/products/${main.id}`,'PATCH',{...main,commerce:{...premium,deal:{...premium.deal,productId:foreign}}},400);
 const mark='PRIVATE_CONTENT_'+crypto.randomUUID();main.content.sections[0].body=mark;
 main=(await call(`/api/products/${main.id}`,'PATCH',main)).product;
 const funnel=await fetch(base+'/f/'+main.slug);assert.equal(funnel.status,200);assert.ok(!(await funnel.text()).includes(mark),'Funnel HTML/RSC must not expose paid content');
 assert.ok(!JSON.stringify(await call('/api/quote','POST',{slug:main.slug},200,false)).includes(mark),'Public quotes must not expose paid content');
 await call(`/api/products/${main.id}`,'PATCH',main,401,false);
 await call(`/api/products/${main.id}`,'PATCH',{...main,commerce:{...premium,funnel:{...premium.funnel,blocks:[{...premium.funnel.blocks[0],image:'javascript:alert(1)'},premium.funnel.blocks[2]]}}},400);
 const recurring={...premium,billing:'month',deal:defaultCommerce().deal,upsell:defaultCommerce().upsell};
 await call(`/api/products/${main.id}`,'PATCH',{...main,commerce:recurring});
 assert.equal((await call('/api/quote','POST',{slug:main.slug},200,false)).billing,'month');
 await call('/api/quote','POST',{slug:main.slug,quantity:2},409,false);
 await call(`/api/products/${main.id}`,'PATCH',{...main,price:0,commerce:recurring},400);
 db.prepare("UPDATE memberships SET status='canceled' WHERE owner=?").run(state.owner);
 await call('/api/quote','POST',{slug:main.slug},409,false);
 db.prepare("UPDATE memberships SET status='active' WHERE owner=?").run(state.owner);
 // A 100%-off offer requires a valid code and issues access only to purchased items.
 const freeOffer={...premium,deal:{...premium.deal,type:'percentage',value:100,productId:'',code:'QA100'},upsell:{...premium.upsell,enabled:false}};
 await call(`/api/products/${main.id}`,'PATCH',{...main,commerce:freeOffer});
 await call('/api/quote','POST',{slug:main.slug,code:'WRONG'},409,false);
 q=await call('/api/quote','POST',{slug:main.slug,code:'QA100'},200,false);assert.equal(q.total,0);
 await call('/api/checkout','POST',{slug:main.slug,expectedTotal:0},409,false);
 const purchase=await call('/api/checkout','POST',{slug:main.slug,code:'QA100'},200,false);const token=new URL(purchase.url).searchParams.get('token');assert.ok(token);
 const download=await fetch(base+'/api/download/'+main.slug+'?token='+token);assert.equal(download.status,200);const files=unzipSync(new Uint8Array(await download.arrayBuffer()));assert.ok(Object.values(files).some(b=>strFromU8(b).includes(mark)));
 assert.equal((await fetch(base+'/api/download/'+extra.slug+'?token='+token)).status,403,'Purchase token must not unlock an unrelated product');
 db.prepare("UPDATE memberships SET status='canceled' WHERE owner=?").run(state.owner);
 assert.equal((await fetch(base+'/f/'+main.slug)).status,404,'Downgrade pauses funnels');
 assert.equal((await call('/api/quote','POST',{slug:main.slug},200,false)).total,4900,'Downgrade removes advanced deals');
 assert.equal((await fetch(base+'/api/download/'+main.slug+'?token='+token)).status,200,'One-time purchases remain accessible after creator downgrade');
 db.prepare("UPDATE memberships SET status='active' WHERE owner=?").run(state.owner);
 await call(`/api/products/${main.id}`,'PATCH',{...main,commerce:premium});
 console.log('Passed: Free/Pro authorization, concurrent 10-product cap, cross-owner protection, BOGO delivery pricing, opt-in upsell, code validation, free offer delivery, private content isolation, token isolation, and downgrade behavior.');
 if(process.argv.includes('--keep-ui')){fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync(statePath,JSON.stringify(state));keep=true;console.log('Local fixtures retained for UI QA; run with --cleanup afterward.');}
}finally{if(!keep)cleanup(state);db.close();}
