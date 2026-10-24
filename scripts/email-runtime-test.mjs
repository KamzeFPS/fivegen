import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {loopbackRequest} from '../runtime/render/loopback-http.mjs';
import {startPurchaseEmailWorker} from '../runtime/render/purchase-email-worker.mjs';

// The real built app, canonical HTTPS host boundary and native HTTP transport.
// This fixture has no provider keys, purchase rows or external network access.
const root=resolve('outputs/email-runtime-qa',randomUUID());
const probe=createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));
const port=probe.address().port;await new Promise(done=>probe.close(done));
const canonical='https://www.fivegen.test',base=`http://127.0.0.1:${port}`;
for(const key of Object.keys(process.env))if(/^(STRIPE_|PADDLE_|OPENAI_|ANTHROPIC_|FAL_|RESEND_|EMAIL_|AUTH_EMAIL_|PURCHASE_EMAIL_|AUTOMATION_)/.test(key))delete process.env[key];
Object.assign(process.env,{NODE_ENV:'production',APP_ORIGIN:canonical,PORT:String(port),FIVEGEN_RUNTIME:'render',FIVEGEN_DATA_DIR:root,GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',CREDENTIAL_ENCRYPTION_KEY:'email-runtime-fixture-key-'.repeat(3),RENDER_EXTERNAL_URL:'',RENDER:'',PRODUCT_DOMAIN:'',PADDLE_ENVIRONMENT:'sandbox',STRIPE_MODE:'test',STRIPE_COMMERCE_ENABLED:'false',AUTOMATIONS_WORKER_ENABLED:'false'});
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{const target=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname),'No external provider call is permitted');return originalFetch(input,options);};
const {start}=await import('../runtime/render/server.mjs');const app=await start();
const logs=[],worker=startPurchaseEmailWorker({origin:canonical,port},{log:(...parts)=>logs.push(parts)});
try{
  const host={Host:'www.fivegen.test'};
  assert.equal((await originalFetch(base+'/api/purchase-emails/dispatch',{method:'POST'})).status,421,'Unrecognized public authority remains rejected');
  assert.equal((await loopbackRequest(base+'/api/purchase-emails/dispatch',{headers:host})).status,401,'Canonical Host alone grants no dispatcher access');
  await worker.tick();assert.deepEqual(logs,[],'Actual default purchase transport passes Host and private Bearer through the real built route');
  assert.equal((await loopbackRequest(base+'/api/auth/email-delivery',{headers:host,body:'{}'})).status,401,'Authentication mail remains private');
  const body=JSON.stringify({to:'fixture@example.test',name:'Synthetic fixture',kind:'verify',token:randomBytes(32).toString('base64url'),id:randomBytes(32).toString('base64url')});
  const response=await loopbackRequest(base+'/api/auth/email-delivery',{headers:{...host,'Content-Type':'application/json',Authorization:'Bearer '+process.env.AUTH_EMAIL_DISPATCH_SECRET},body});
  assert.equal(response.status,503,'Auth bridge reaches the verified private route and correctly refuses absent email configuration, rather than failing host routing');
  assert.equal(app.storage.sqlite.prepare('SELECT COUNT(*) n FROM purchase_emails').get().n,0,'No historical or synthetic purchase email was created');
  await assert.rejects(loopbackRequest('https://example.test/private'),/local server/,'Shared transport cannot target an external service');
  console.log(`Email runtime passed: native canonical Host delivery, real private routes and random credentials, missing-provider refusal, unchanged public host rejection and no historical mail. No external email or payment. Fixtures retained: ${root}`);
}finally{worker.stop();await new Promise(done=>{app.server.close(done);app.server.closeIdleConnections();});app.storage.close();globalThis.fetch=originalFetch;}
