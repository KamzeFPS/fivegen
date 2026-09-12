import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { createStorage } from '../runtime/render/storage.mjs';
import { digest } from '../runtime/render/auth.mjs';

// Run after build:render. No external Paddle calls or payments. Keep all rows.
const root=resolve('outputs/paddle-runtime-qa',randomUUID());
const portProbe=createServer();
await new Promise(done=>portProbe.listen(0,'127.0.0.1',done));
const port=portProbe.address().port;
await new Promise(done=>portProbe.close(done));
const base=`http://127.0.0.1:${port}`;
const secret='pdl_ntfset_local_runtime_fixture';
Object.assign(process.env,{
  NODE_ENV:'production',APP_ORIGIN:base,PORT:String(port),FIVEGEN_RUNTIME:'render',FIVEGEN_DATA_DIR:root,
  GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',CREDENTIAL_ENCRYPTION_KEY:'test-only-encryption-value-'.repeat(2),
  RENDER_EXTERNAL_URL:'',RENDER:'',PRODUCT_DOMAIN:'',PADDLE_ENVIRONMENT:'sandbox',
  PADDLE_API_KEY:'pdl_sdbx_apikey_fixture',PADDLE_WEBHOOK_SECRET:secret,
});
const seed=createStorage(root),token=randomBytes(32).toString('base64url'),owner='paddle-runtime-fixture',now=new Date().toISOString();
seed.sqlite.prepare('INSERT INTO render_sessions VALUES (?,?,?,?,?)').run(digest(token),owner,'runtime@example.test','Runtime test',Date.now()+3600000);
seed.sqlite.prepare('INSERT INTO terms_acceptances VALUES (?,?,?,?,?)').run(randomUUID(),owner,'2026-09-11-credits','runtime@example.test',Date.now());
seed.sqlite.prepare('INSERT INTO paddle_customers (customer_id,environment,email,owner,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('ctm_runtime','sandbox','runtime@example.test',owner,now,now);
seed.sqlite.prepare('INSERT INTO paddle_test_wallets VALUES (?,?)').run(owner,1000);
seed.sqlite.prepare('INSERT INTO paddle_transactions (transaction_id,environment,customer_id,owner,status,currency,total,credits,credited,created_at,updated_at,event_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run('txn_runtime','sandbox','ctm_runtime',owner,'completed','USD','1500',1000,1,now,now,Date.now());
seed.close();
const {start}=await import('../runtime/render/server.mjs');
const app=await start();
try {
  const headers={cookie:'fivegen-local-session='+token};
  const page=await fetch(base+'/account/billing',{headers});
  const html=await page.text();
  assert.equal(page.status,200);
  assert.ok(html.includes('Manage billing')&&html.includes('Recent credit purchases')&&!html.includes('We couldn’t load this page'), 'Authenticated billing SSR must render actual SQLite account data');
  assert.equal((await fetch(base+'/api/paddle/account')).status,401);
  assert.equal((await fetch(base+'/api/paddle/portal',{method:'POST',body:'{"customerId":"ctm_runtime"}'})).status,401);
  const account=await (await fetch(base+'/api/paddle/account',{headers})).json();
  assert.equal(account.sandboxCredits,1000);assert.equal(account.payments[0].transaction_id,'txn_runtime');
  const raw=JSON.stringify({event_id:'evt_runtime',event_type:'customer.created',occurred_at:now,data:{id:'ctm_webhook_runtime',email:'webhook@example.test',status:'active',created_at:now,updated_at:now}});
  const ts=Math.floor(Date.now()/1000),signature=`ts=${ts};h1=${createHmac('sha256',secret).update(`${ts}:${raw}`).digest('hex')}`;
  assert.equal((await fetch(base+'/api/webhooks/paddle',{method:'POST',body:raw})).status,400);
  assert.equal((await fetch(base+'/api/webhooks/paddle',{method:'POST',headers:{'paddle-signature':signature},body:raw})).status,200);
  assert.equal((await fetch(base+'/api/webhooks/paddle',{method:'POST',headers:{'paddle-signature':signature},body:raw+' '})).status,400);
  console.log('Paddle production-runtime checks passed: authenticated billing SSR, protected API routes, real SDK raw-body verification, and persisted account data.');
  console.log('Runtime QA database retained: '+root);
} finally {
  await new Promise(done=>{app.server.close(done);app.server.closeIdleConnections();});
  app.storage.close();
}
