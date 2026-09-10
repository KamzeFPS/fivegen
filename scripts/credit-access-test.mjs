import assert from 'node:assert/strict';
const base='http://localhost:5173';
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
async function req(path,method='GET',body,expected=200,auth=true){const r=await fetch(base+path,{method,headers:{...(auth?{cookie}:{}),origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,expected,JSON.stringify(d));return d;}
const settings=await req('/api/providers');assert.equal(settings.admin,false,'Run this customer-access test without granting the local demo account admin access.');
assert.equal(settings.config.textModel,'gpt-4.1-mini');assert.ok(!('row' in settings));assert.equal(typeof settings.connected.openai,'boolean');
await req('/api/providers','PUT',{admin:true,config:settings.config,openai:'not-a-real-key-for-access-test'},403);
await req('/api/admin','GET',null,403);await req('/api/credits','GET',null,401,false);
const credits=await req('/api/credits');assert.ok(credits.balance.starter>=0);assert.equal(credits.balance.media,credits.balance.included+credits.balance.purchased);
await req('/api/credits','POST',{pack:'forged',credits:999999},400);
await req('/api/credits','GET',null,200);await req('/api/credits?session_id=forged','GET',null,400);
console.log('Passed: customers cannot configure master keys or access admin finances; keys are not returned; credits require login; client-supplied pack and session IDs cannot grant balances.');
