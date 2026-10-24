import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import { createStorage } from '../runtime/render/storage.mjs';

const root = resolve('outputs/checkout-recovery-qa', randomUUID()), storage = createStorage(root);
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const configuration = { APP_ORIGIN: 'https://fivegen.test', EMAIL_FROM: 'verified@fivegen.test', AUTOMATION_DISPATCH_SECRET: 'isolated-test-secret-never-used-for-real-sends' };
let owner = 'creator-a', ready = true, failNext = false, duringProviderKey = null, networkCalls = 0;
const accepted = new Map(), requests = [];
const realFetch = globalThis.fetch, realNow = Date.now; let now = realNow(); Date.now = () => now;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.resend.com/emails'); networkCalls++;
  const key = options.headers['Idempotency-Key'], body = String(options.body); requests.push({ key, body: JSON.parse(body) });
  if (accepted.has(key)) { assert.equal(accepted.get(key).body, body, 'A retry must use exactly the same approved payload'); return Response.json({ id: accepted.get(key).id }); }
  const id = randomUUID(); accepted.set(key, { id, body });
  if (failNext) { failNext = false; throw new Error('Connection lost after provider accepted message'); }
  return Response.json({ id });
};
const deps = {
  z, ApiError, database: () => storage.DB, binding: name => configuration[name] || '',
  providerSettings: async () => ({ config: { emailFrom: configuration.EMAIL_FROM }, connected: { resend: ready } }),
  providerKey: async () => { if (duringProviderKey) { const callback = duringProviderKey; duringProviderKey = null; await callback(); } return 'isolated-test-key'; },
  identity: async () => { if (!owner) throw new ApiError('Sign in', 401); return { userId: owner }; },
  sameOrigin: request => { const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) throw new ApiError('Origin rejected', 403); },
  failure: error => Response.json({ error: error.message }, { status: error.status || 400 }),
  ownedProduct: async (id, user) => { const row = await storage.DB.prepare('SELECT * FROM products WHERE id=? AND owner=?').bind(id, user).first(); if (!row) throw new ApiError('Product not found', 404); return row; },
};
async function load(path) {
  const key = 'test' + randomUUID().replaceAll('-', ''); globalThis[key] = { ...deps };
  const source = fs.readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(deps).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); delete globalThis[key]; return result;
}
Object.assign(deps, await load('lib/creator-context-contract.ts'));
Object.assign(deps,await load('lib/marketing-destination.ts'));
Object.assign(deps, await load('lib/automation.ts'));
Object.assign(deps,await load('lib/reply-template-server.ts'));
deps.listMarketingDestinations=async()=>[];deps.resolveMarketingDestination=async(product,owner,value)=>{if(!storage.sqlite.prepare('SELECT 1 FROM product_pages WHERE product_id=? AND owner=? AND published_at IS NOT NULL').get(product,owner))throw new ApiError('Destination unavailable',409);return value;};deps.destinationGuard=()=>({sql:'',values:[]});
Object.assign(deps,await load('lib/purchase-email.ts'));
Object.assign(deps, await load('lib/checkout-recovery-eligibility.ts'));
Object.assign(deps, await load('lib/automation-server.ts'));
const api = await load('app/api/automations/route.ts'), worker = await load('app/api/automations/dispatch/route.ts'), unsubscribe = await load('app/api/automations/unsubscribe/route.ts');
const base = 'https://fivegen.test';
const request = (path, method = 'GET', body, headers = {}) => new Request(base + path, { method, headers: { 'Content-Type': 'application/json', origin: base, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const productId = randomUUID(), productB = randomUUID();
function product(id, user) { storage.sqlite.prepare('INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,commerce,experience,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, user, id, 'Workshop', 'Private notes', 'Audience', 'Video course', 9900, 'orange', JSON.stringify({ sections: [{ title: 'Private lesson', body: 'Never put lessons in emails' }], benefits: [], launch: '' }), 'draft', '{}', '{}', now, now); }
function lead(email, marketing = 1, id = randomUUID(), user = owner, product = productId) { storage.sqlite.prepare('INSERT INTO growth_leads (id,owner,product_id,email,name,marketing,consent_text,consent_at,source,last_source,status,notes,created_at,last_seen_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, user, product, email, 'Alex', marketing, marketing ? 'Agreed' : '', marketing ? now : null, '/g/test', '/g/test', 'new', '', now, now, now); return id; }
function purchase(email, status = 'paid', mode = 'live', user = owner, product = productId) { const id = randomUUID(); storage.sqlite.prepare('INSERT INTO commerce_orders (id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, user, product, 'acct_test', mode, email, 9900, 'usd', 'Workshop', status, 'not-an-access-token-' + id, now, status === 'paid' ? now : null); return id; }
const jobs = email => storage.sqlite.prepare('SELECT j.* FROM automation_jobs j JOIN automation_enrollments e ON e.id=j.enrollment_id WHERE e.email=? ORDER BY j.step_index').all(email);
const save = (trigger, draft, expectedRevision = 0, headers) => api.POST(request('/api/automations', 'POST', { productId, trigger, draft, expectedRevision, action: 'save' }, headers));
const status = (trigger, expectedRevision, action = 'activate') => api.POST(request('/api/automations', 'POST', { productId, trigger, expectedRevision, action }));
try {
  product(productId, owner); product(productB, 'creator-b');
  storage.sqlite.prepare('INSERT INTO product_pages(product_id,owner,draft,published,public_product,published_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(productId,owner,'{}','{}','{}',now,now);
  const initial=deps.defaultAutomation('checkout-recovery','Creator');
  let draft={...initial,destination:{pageId:productId,productId,purpose:'sales',version:1,path:'/product/'+productId,title:'Workshop'},replyTo:'creator@example.test',postalAddress:'100 Creator Street',steps:[{...initial.steps[0],delayHours:48}]};
  assert.equal((await save('checkout-recovery',{...draft,steps:[...draft.steps,{...draft.steps[0],id:randomUUID()}]})).status,400,'Recovery has exactly one reminder');
  assert.equal((await save('checkout-recovery',{...draft,steps:[{...draft.steps[0],delayHours:0}]})).status,400,'Immediate recovery cannot be saved');
  assert.equal((await save('checkout-recovery',{...draft,steps:[{...draft.steps[0],delayHours:169}]})).status,400,'Recovery expires after seven days');
  assert.equal((await save('checkout-recovery',{...draft,steps:[{...draft.steps[0],kind:'launch'}]})).status,400,'Only reviewed reminder purpose is accepted');
  assert.equal((await save('checkout-recovery',draft)).status,200);
  assert.equal((await status('checkout-recovery',1)).status,200);
  const activeAt=now;
  function intent(email,{consent=true,mode='live',session=true,amount=9900,at=now,user=owner,product=productId}={}){
    if(consent)lead(email,1,randomUUID(),user,product);
    const id=purchase(email,'pending',mode,user,product);
    storage.sqlite.prepare('UPDATE commerce_orders SET session_id=?,amount=?,created_at=? WHERE id=?').run(session?'cs_fixture_'+id:null,amount,at,id);
    return id;
  }
  now+=10;
  const live=intent('eligible@example.test'),created=now;
  assert.equal(await deps.checkoutRecoveryEligibility(live),null,'Cannot enroll before 24-hour delay');
  const unconsented=intent('no-consent@example.test',{consent:false}),testMode=intent('test-mode@example.test',{mode:'test'}),typedOnly=intent('no-session@example.test',{session:false}),zero=intent('no-charge@example.test',{amount:0});
  const lateConsent=intent('late-consent@example.test',{consent:false});now++;lead('late-consent@example.test');
  const before=intent('before@example.test',{at:activeAt-1});
  const wrongProduct=intent('wrong-product@example.test',{consent:false});lead('wrong-product@example.test',1,randomUUID(),owner,productB);
  now=created+86400000;
  for(const id of [unconsented,testMode,typedOnly,zero,lateConsent,wrongProduct]){await deps.enrollAutomationCheckoutRecovery(id);assert.equal(storage.sqlite.prepare('SELECT COUNT(*) n FROM automation_enrollments WHERE order_id=?').get(id).n,0);}
  await deps.enrollAutomationCheckoutRecovery(before);assert.equal(jobs('before@example.test').length,0,'Activation never backfills older checkout intents');
  await Promise.all([deps.enrollAutomationCheckoutRecovery(live),deps.enrollAutomationCheckoutRecovery(live)]);
  assert.equal(jobs('eligible@example.test').length,1,'Concurrent delivery catch-up cannot duplicate the same intent');
  assert.equal(jobs('eligible@example.test')[0].due_at,created+48*3600000,'Reviewed delay is measured from actual checkout intent');
  await deps.dispatchAutomations();assert.equal(networkCalls,0,'A 48-hour approved wait cannot send at the 24-hour scan');
  // The approved recipient snapshot is retained even if the creator edits the next version.
  draft={...draft,steps:[{...draft.steps[0],body:'UNAPPROVED replacement must never send'}]};assert.equal((await save('checkout-recovery',draft,1)).status,200);
  now=created+48*3600000;await deps.dispatchAutomations();
  assert.equal(jobs('eligible@example.test')[0].status,'sent');assert.equal(requests.length,1);assert.ok(!requests[0].body.text.includes('UNAPPROVED'));
  assert.match(requests[0].body.text,/https:\/\/fivegen\.test\/product\//);assert.match(requests[0].body.text,/Unsubscribe/);assert.doesNotMatch(requests[0].body.text,/cs_fixture_|not-an-access-token/,'Recovery never exposes checkout/buyer bearer credentials');
  const again=intent('eligible@example.test',{consent:false});now+=86400000;await deps.enrollAutomationCheckoutRecovery(again);assert.equal(jobs('eligible@example.test').length,1,'Rolling 30-day person/product cap applies across different checkout intents');
  // Re-approve revision two for future recipients, while existing immutable snapshots stay intact.
  assert.equal((await status('checkout-recovery',2)).status,200);
  const purchased=intent('purchased@example.test');now+=86400000;await deps.enrollAutomationCheckoutRecovery(purchased);assert.equal(jobs('purchased@example.test').length,1);
  const paidId=purchase('purchased@example.test');await deps.enrollAutomationPurchase(paidId);assert.equal(jobs('purchased@example.test')[0].status,'cancelled','A verified purchase immediately cancels pending recovery');
  const revoked=intent('revoked-recovery@example.test');now+=86400000;await deps.enrollAutomationCheckoutRecovery(revoked);storage.sqlite.prepare('UPDATE growth_leads SET marketing=0 WHERE email=?').run('revoked-recovery@example.test');now+=86400000;
  const beforeRevoked=networkCalls;await deps.dispatchAutomations();assert.equal(jobs('revoked-recovery@example.test')[0].status,'cancelled');assert.equal(networkCalls,beforeRevoked,'Consent is checked at dispatch, not only enrollment');
  const paused=intent('paused-recovery@example.test');now+=86400000;await deps.enrollAutomationCheckoutRecovery(paused);await deps.setAutomationStatus(productId,owner,'checkout-recovery','pause',2);now+=86400000;const beforePaused=networkCalls;await deps.dispatchAutomations();assert.equal(networkCalls,beforePaused);assert.equal(jobs('paused-recovery@example.test')[0].status,'pending');
  now+=7*86400000;await deps.setAutomationStatus(productId,owner,'checkout-recovery','activate',2);await deps.dispatchAutomations();assert.equal(jobs('paused-recovery@example.test')[0].status,'cancelled','Expired recovery cannot be revived by pause/resume');
  const race=intent('race-recovery@example.test');now+=86400000;await deps.enrollAutomationCheckoutRecovery(race);now+=86400000;duringProviderKey=()=>storage.sqlite.prepare('UPDATE growth_leads SET marketing=0 WHERE email=?').run('race-recovery@example.test');const beforeRace=networkCalls;await deps.dispatchAutomations();assert.equal(networkCalls,beforeRace);assert.equal(jobs('race-recovery@example.test')[0].status,'cancelled','Consent is rechecked after async provider credentials');
  const a=intent('cap-race@example.test'),b=intent('cap-race@example.test',{consent:false});now+=86400000;await Promise.all([deps.enrollAutomationCheckoutRecovery(a),deps.enrollAutomationCheckoutRecovery(b)]);assert.equal(jobs('cap-race@example.test').length,1,'Atomic cap prevents simultaneous distinct-intent enrollment');
  const removed=intent('removed-page@example.test');now+=86400000;await deps.enrollAutomationCheckoutRecovery(removed);storage.sqlite.prepare('UPDATE product_pages SET published_at=NULL WHERE product_id=?').run(productId);now+=86400000;await deps.dispatchAutomations();assert.equal(jobs('removed-page@example.test')[0].status,'cancelled','Removing the public destination stops the immutable recovery snapshot');assert.ok(!requests.some(r=>r.body.to.includes('removed-page@example.test')));const unavailable=intent('no-public-page@example.test');now+=86400000;await deps.enrollAutomationCheckoutRecovery(unavailable);assert.equal(jobs('no-public-page@example.test').length,0,'Never enroll a reminder with a nonexistent public offer destination');
  console.log('Passed: real SQLite checkout recovery activation/review snapshots, real live intent and prior consent, 24-hour minimum/7-day expiry, exact intent and 30-day person caps, immutable copy, safe public restart link, unsubscribe footer, pause, purchase/consent exit and final permission checks. All provider requests mocked; no external sends.');
  console.log('QA records retained: '+root);
}finally{globalThis.fetch=realFetch;Date.now=realNow;storage.close();}
