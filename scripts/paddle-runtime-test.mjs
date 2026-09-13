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
const live=process.argv.includes('--live');
Object.assign(process.env,{
  NODE_ENV:'production',APP_ORIGIN:base,PORT:String(port),FIVEGEN_RUNTIME:'render',FIVEGEN_DATA_DIR:root,
  GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',CREDENTIAL_ENCRYPTION_KEY:'test-only-encryption-value-'.repeat(2),
  RENDER_EXTERNAL_URL:'',RENDER:'',PRODUCT_DOMAIN:'',PADDLE_ENVIRONMENT:live?'production':'sandbox',
  PADDLE_API_KEY:live?'pdl_live_apikey_fixture':'pdl_sdbx_apikey_fixture',PADDLE_WEBHOOK_SECRET:secret,
  PADDLE_CLIENT_TOKEN:live?'live_fixture':'test_fixture',PADDLE_LIVE_RELEASE:'staging',PADDLE_WEBHOOK_IP_MODE:'direct',
  PADDLE_PRICE_STARTER:'pri_'+'a'.repeat(26),PADDLE_PRICE_PRO:'pri_'+'b'.repeat(26),PADDLE_PRICE_ADVANCED:'pri_'+'c'.repeat(26),
});
const seed=createStorage(root),token=randomBytes(32).toString('base64url'),owner='paddle-runtime-fixture',now=new Date().toISOString();
seed.sqlite.prepare('INSERT INTO render_sessions VALUES (?,?,?,?,?)').run(digest(token),owner,'runtime@example.test','Runtime test',Date.now()+3600000);
seed.sqlite.prepare('INSERT INTO terms_acceptances VALUES (?,?,?,?,?)').run(randomUUID(),owner,'2026-09-13-studio','runtime@example.test',Date.now());
seed.sqlite.prepare('INSERT INTO paddle_customers (customer_id,environment,email,owner,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('ctm_runtime','sandbox','runtime@example.test',owner,now,now);
seed.sqlite.prepare('INSERT INTO paddle_test_wallets VALUES (?,?)').run(owner,1000);
seed.sqlite.prepare('INSERT INTO paddle_transactions (transaction_id,environment,customer_id,owner,status,currency,total,credits,credited,created_at,updated_at,event_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run('txn_runtime','sandbox','ctm_runtime',owner,'completed','USD','1500',1000,1,now,now,Date.now());
const customerId='ctm_'+'a'.repeat(26),otherCustomerId='ctm_'+'b'.repeat(26);
if(live){
  seed.sqlite.prepare('INSERT INTO paddle_customers (customer_id,environment,email,owner,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(customerId,'production','runtime@example.test',owner,now,now);
  seed.sqlite.prepare('INSERT INTO paddle_customers (customer_id,environment,email,owner,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(otherCustomerId,'production','other@example.test','other-owner',now,now);
}
seed.close();
const {start}=await import('../runtime/render/server.mjs');
const app=await start();
try {
  const headers={cookie:'fivegen-local-session='+token};
  const page=await fetch(base+'/account/billing',{headers});
  const html=await page.text();
  assert.equal(page.status,200);
  assert.ok(html.includes('Manage billing')&&html.includes('Recent purchases')&&!html.includes('We couldn’t load this page'), 'Authenticated billing SSR must render actual SQLite account data');
  assert.equal((await fetch(base+'/api/paddle/account')).status,401);
  assert.equal((await fetch(base+'/api/paddle/portal',{method:'POST',body:'{"customerId":"ctm_runtime"}'})).status,401);
  const account=await (await fetch(base+'/api/paddle/account',{headers})).json();
  if(live){
    assert.equal(account.payments.length,0,'Sandbox purchases must not appear as live purchases');
    const pricing=await (await fetch(base+'/pricing',{headers})).text();
    assert.ok(pricing.includes(customerId),'Retain receives the signed-in owner’s live Paddle customer');
    assert.ok(!pricing.includes(otherCustomerId)&&!pricing.includes('ctm_runtime'),'Other owners and sandbox identities never reach Retain');
    const anonymous=await (await fetch(base+'/pricing')).text();
    assert.ok(!anonymous.includes(customerId),'Anonymous pricing does not expose a customer identity');
    const checkout=await fetch(base+'/api/paddle/checkout',{method:'POST',headers:{...headers,origin:base,'content-type':'application/json'},body:JSON.stringify({priceId:process.env.PADDLE_PRICE_STARTER})});
    assert.equal(checkout.status,503,'Signed-in callers cannot bypass the staging purchase lock');
    assert.equal(app.storage.sqlite.prepare('SELECT COUNT(*) AS n FROM paddle_checkout_intents').get().n,0);
    const source=(await (await fetch('https://api.paddle.com/ips')).json()).data.ipv4_cidrs[0].split('/')[0];
    for(const path of ['/api/webhooks/paddle','/api/webhooks/paddle/','/api/webhooks/%70addle']){
      const delivery=await fetch(base+path,{method:'POST',headers:{'x-forwarded-for':source,'cf-ray':'forged'},body:'{}',redirect:'manual'});
      assert.equal(delivery.status,403,'A forged IP header must not bypass the live network boundary at '+path);
    }
    assert.equal(app.storage.sqlite.prepare('SELECT COUNT(*) AS n FROM paddle_webhook_events').get().n,0);
    for(const [path,title] of [['/terms','Terms &amp; Conditions'],['/refund','Refund &amp; Cancellation Policy']]){
      const page=await fetch(base+path);assert.equal(page.status,200);assert.ok((await page.text()).includes(title));
    }
    const alias=await fetch(base+'/refunds');assert.equal(alias.status,200);assert.ok(alias.url.endsWith('/refund'));
    console.log('Live Node runtime passed: server purchase lock, scoped Retain identity, anonymous isolation, forged webhook source rejection, and public policy routes.');
  }else{
  for(const path of ['/p/example','/f/example','/r/example','/invite/example','/partners','/api/checkout','/api/quote','/api/connect/stripe','/api/referrals','/api/leads','/api/crm','/api/products/example/slots','/%70/example','/api/%63heckout']) {
    assert.equal((await fetch(base+path)).status,410,'Retired commerce must be unavailable at '+path);
  }
  const privateHome=await (await fetch(base+'/',{headers})).text();
  assert.ok(privateHome.includes('Create with AI')&&privateHome.includes('Opening your creative workspace'));
  assert.ok(!privateHome.includes('Connect Stripe')&&!privateHome.includes('Revenue analytics'));
  const jsonHeaders={...headers,origin:base,'content-type':'application/json'},created=[];
  for(const format of ['Guide','Mini course','Template kit','Challenge','Playbook','Custom product']){
    const response=await fetch(base+'/api/products',{method:'POST',headers:jsonHeaders,body:JSON.stringify({title:format+' runtime draft',description:'A private manually written resource for an isolated runtime test.',audience:'Runtime test audience',format,price:0,color:'orange',generationMode:'manual'})});
    assert.equal(response.status,200);const {product}=await response.json();created.push(product);assert.equal(product.status,'draft');assert.equal(product.price,0);
  }
  assert.equal(new Set(created.map(p=>p.id)).size,6,'Every format receives an independent private product');
  const draft=created[0],{commerce,experience,...editable}=draft;
  const patch={...editable,content:{...draft.content,sections:[{title:'An actual saved section',body:'A practical handoff checklist written manually in this isolated test.'}]},expectedUpdatedAt:draft.updatedAt};
  const saved=await fetch(base+'/api/products/'+draft.id,{method:'PATCH',headers:jsonHeaders,body:JSON.stringify(patch)});assert.equal(saved.status,200);const updated=(await saved.json()).product;
  assert.equal((await fetch(base+'/api/products/'+draft.id,{method:'PATCH',headers:jsonHeaders,body:JSON.stringify(patch)})).status,409,'A stale editor must not overwrite newer content');
  assert.equal((await fetch(base+'/api/products/'+draft.id,{method:'PATCH',headers:jsonHeaders,body:JSON.stringify({...patch,expectedUpdatedAt:updated.updatedAt,status:'published'})})).status,410,'A direct API caller cannot publish a storefront');
  assert.equal((await fetch(base+'/api/products/'+draft.id+'/bundle')).status,401,'Private exports require sign-in');
  assert.equal((await fetch(base+'/api/products/'+draft.id+'/bundle',{headers})).status,200,'The owner can export saved work');
  assert.equal(account.sandboxCredits,1000);assert.equal(account.payments[0].transaction_id,'txn_runtime');
  const raw=JSON.stringify({event_id:'evt_runtime',event_type:'customer.created',occurred_at:now,data:{id:'ctm_webhook_runtime',email:'webhook@example.test',status:'active',created_at:now,updated_at:now}});
  const ts=Math.floor(Date.now()/1000),signature=`ts=${ts};h1=${createHmac('sha256',secret).update(`${ts}:${raw}`).digest('hex')}`;
  assert.equal((await fetch(base+'/api/webhooks/paddle',{method:'POST',body:raw})).status,400);
  assert.equal((await fetch(base+'/api/webhooks/paddle',{method:'POST',headers:{'paddle-signature':signature},body:raw})).status,200);
  assert.equal((await fetch(base+'/api/webhooks/paddle',{method:'POST',headers:{'paddle-signature':signature},body:raw+' '})).status,400);
  console.log('Paddle production-runtime checks passed: authenticated billing SSR, protected API routes, real SDK raw-body verification, and persisted account data.');
  }
  console.log('Runtime QA database retained: '+root);
} finally {
  await new Promise(done=>{app.server.close(done);app.server.closeIdleConnections();});
  app.storage.close();
}
