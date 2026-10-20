import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import ts from 'typescript';
import {z} from 'zod';

// Execute the actual private Resend bridge with synthetic configuration and
// mocked delivery. No credential files, provider requests or real emails.
const secret='auth-mail-fixture-secret-at-least-32-characters',configuration={AUTH_EMAIL_DISPATCH_SECRET:secret,APP_ORIGIN:'https://fivegen.test'},calls=[];let ready=true,accepted=true;
const dependencies={z,binding:key=>configuration[key]||'',transactionalEmailConfiguration:async()=>({ready,from:'purchases@fivegen.test'}),sendTransactionalEmail:async(payload,id)=>{calls.push({payload,id});return {sent:accepted};}};
const source=readFileSync('app/api/auth/email-delivery/route.ts','utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),key='authMailQa'+randomUUID().replaceAll('-','');globalThis[key]=dependencies;
const module=await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));delete globalThis[key];
const token=randomBytes(32).toString('base64url'),id=randomBytes(32).toString('base64url');
async function send(data,authorization='Bearer '+secret,headers={}){return module.POST(new Request('https://fivegen.test/api/auth/email-delivery',{method:'POST',headers:{'content-type':'application/json',authorization,...headers},body:JSON.stringify(data)}));}
const payload={to:'recipient@example.test',name:'A <script> private name',kind:'verify',token,id};
assert.equal((await send(payload,'')).status,401);assert.equal((await send(payload,'Bearer different-fixture-secret-at-least-32-characters')).status,401);assert.equal((await send(payload,'',{cookie:'fixture-admin-session'})).status,401);assert.equal(calls.length,0,'Cookies or a different worker key cannot send authentication mail');
let response=await send(payload);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(calls.length,1);assert.equal(calls[0].payload.to[0],payload.to);assert.equal(calls[0].payload.from,'FiveGen <purchases@fivegen.test>');assert.ok(calls[0].payload.text.includes('https://fivegen.test/verify-email?token='+token));assert.ok(calls[0].payload.text.includes('24 hours'));assert.ok(calls[0].payload.text.includes('password you chose'));assert.ok(!calls[0].payload.html.includes('<script>'));assert.equal(calls[0].id,'fivegen-auth/verify/'+id);
await send({...payload,kind:'reset'});assert.ok(calls.at(-1).payload.text.includes('/reset-password?token='+token));assert.ok(calls.at(-1).payload.text.includes('30 minutes'));assert.equal(calls.at(-1).payload.subject,'Reset your FiveGen password');
await send({to:payload.to,name:'Recipient',kind:'changed',id});assert.ok(calls.at(-1).payload.text.includes('previous browser sessions'));assert.ok(!calls.at(-1).payload.text.includes('token='));assert.ok(calls.at(-1).payload.text.includes('https://fivegen.test/forgot-password'));
const beforeInvalid=calls.length;assert.equal((await send({...payload,password:'Must never enter a mail payload'})).status,503);assert.equal((await send({...payload,token:'wrong'})).status,503);configuration.APP_ORIGIN='https://attacker.example/redirect';assert.equal((await send(payload)).status,503);configuration.APP_ORIGIN='ftp://localhost';assert.equal((await send(payload)).status,503);configuration.APP_ORIGIN='https://fivegen.test';ready=false;assert.equal((await send(payload)).status,503);assert.equal(calls.length,beforeInvalid,'Invalid origin/schema/provider configuration fails before transport');ready=true;accepted=false;assert.equal((await send(payload)).status,503,'Provider rejection is never reported as a sent verification');
console.log('Authentication mail bridge passed: private worker authentication, canonical expiring links, password-proof wording, reset security notice, no plaintext password, strict schemas, no-store responses and truthful provider errors. All sends mocked.');
