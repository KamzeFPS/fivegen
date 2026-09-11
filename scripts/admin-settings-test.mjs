import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const root='.wrangler/state/v3/d1/miniflare-D1DatabaseObject',file=fs.readdirSync(root).find(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite');
const db=new DatabaseSync(root+'/'+file);db.exec('PRAGMA busy_timeout=5000');
const before=db.prepare("SELECT * FROM providers WHERE owner='__fivegen_platform__'").get();
const base='http://localhost:5173',login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
async function req(path,method='GET',body,expected=200){const r=await fetch(base+path,{method,headers:{cookie,origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),d=await r.json();assert.equal(r.status,expected,JSON.stringify(d));return d;}
let productId='';const key='TEST_ONLY_NOT_A_REAL_PROVIDER_KEY_123456789';
try{
 const settings=await req('/api/providers');assert.equal(settings.admin,true,'Temporarily allow local_seedy in local ADMIN_USER_IDS only.');await req('/api/admin');
 await req('/api/providers','PUT',{config:{...settings.config,paused:true,textProvider:'openai',textModel:'gpt-4.1-mini'},openai:key});
 const saved=await req('/api/providers');assert.equal(saved.connected.openai,true);assert.ok(!JSON.stringify(saved).includes(key));
 const record=db.prepare("SELECT * FROM providers WHERE owner='__fivegen_platform__'").get();assert.ok(record.openai);assert.notEqual(record.openai,key);
 const prior=await req('/api/credits');
 const {product}=await req('/api/products','POST',{generationMode:'manual',title:'Local paused AI test',description:'Test the platform kill switch without contacting an AI provider.',audience:'Local QA',format:'Guide',price:0,color:'orange'});productId=product.id;
 await req(`/api/products/${product.id}/generate`,'POST',{},503);
 const after=await req('/api/credits');assert.deepEqual(after.balance,prior.balance,'Paused generation must return reserved credits');assert.equal(after.history[0].state,'refunded');
 await req('/api/providers','PUT',{config:saved.config,remove:'openai'});assert.equal((await req('/api/providers')).connected.openai,false);
 console.log('Passed: admin-only settings, encrypted shared key storage, key redaction, key removal, platform pause, and generation credit return. No provider request made.');
}finally{
 if(productId){db.prepare('DELETE FROM generation WHERE product_id=?').run(productId);db.prepare('DELETE FROM products WHERE id=?').run(productId);}
 db.prepare("DELETE FROM providers WHERE owner='__fivegen_platform__'").run();if(before)db.prepare('INSERT INTO providers (owner,openai,anthropic,fal,config) VALUES (?,?,?,?,?)').run(before.owner,before.openai,before.anthropic,before.fal,before.config);
 db.close();
}
