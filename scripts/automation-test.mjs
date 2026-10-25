import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import { createStorage } from '../runtime/render/storage.mjs';

const root = resolve('outputs/automation-qa', randomUUID()), storage = createStorage(root);
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
deps.listMarketingDestinations=async()=>[];deps.resolveMarketingDestination=async(_product,_owner,value)=>value;deps.destinationGuard=()=>({sql:'',values:[]});
Object.assign(deps,await load('lib/purchase-email.ts'));
Object.assign(deps, await load('lib/checkout-recovery-eligibility.ts'));
Object.assign(deps, await load('lib/automation-server.ts'));
Object.assign(deps, await load('lib/product-archive-server.ts'));
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
  const oldLead = lead('before-activation@example.test'); now += 10;
  let draft = {destination:{pageId:productId,productId,purpose:'sales',version:1,path:'/product/'+productId,title:'Workshop'}, ...deps.defaultAutomation('lead', 'Creator'), replyTo: 'creator@example.test', postalAddress: '100 Creator Street', steps: [{ id: randomUUID(), kind: 'welcome', subject: 'Hello {{name}}', body: 'Original approved copy for {{product}}\n{{funnel_url}}', delayHours: 0 }, { id: randomUUID(), kind: 'launch', subject: 'An invitation', body: 'A second approved email', delayHours: 1 }] };
  let response = await save('lead', draft); assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await save('lead', draft)).status, 409, 'Stale drafts cannot overwrite another revision');
  assert.equal((await save('lead', draft, 1, { origin: 'https://attacker.test' })).status, 403);
  ready = false; assert.equal((await status('lead', 1)).status, 409, 'Missing email configuration blocks activation'); ready = true;
  assert.equal((await status('lead', 1)).status, 200);
  assert.equal((await worker.POST(request('/api/automations/dispatch', 'POST'))).status, 401, 'Worker requires its own secret');
  owner = 'creator-b'; assert.equal((await api.GET(request(`/api/automations?productId=${productId}`))).status, 404); assert.equal((await status('lead', 1)).status, 404); owner = 'creator-a';
  await deps.enrollAutomationLead(productId, owner, 'before-activation@example.test'); assert.equal(jobs('before-activation@example.test').length, 0, 'No silent bulk enrollment of previous contacts'); assert.ok(oldLead);
  lead('unconsented@example.test', 0); await deps.enrollAutomationLead(productId, owner, 'unconsented@example.test'); assert.equal(jobs('unconsented@example.test').length, 0);
  lead('buyer@example.test'); await deps.enrollAutomationLead(productId, owner, 'buyer@example.test'); await deps.enrollAutomationLead(productId, owner, 'buyer@example.test'); assert.equal(jobs('buyer@example.test').length, 2, 'Retrying an event does not duplicate enrollment or jobs');
  draft = { ...draft, steps: draft.steps.map(s => ({ ...s, body: 'Unapproved edits must never send' })) }; assert.equal((await save('lead', draft, 1)).status, 200);
  failNext = true; await deps.dispatchAutomations(); assert.equal(jobs('buyer@example.test')[0].status, 'pending'); assert.equal(accepted.size, 1); assert.ok(requests[0].body.text.includes('Original approved copy')); assert.ok(!requests[0].body.text.includes('Unapproved'));
  now += 120001; await Promise.all([deps.dispatchAutomations(), deps.dispatchAutomations()]); assert.equal(jobs('buyer@example.test')[0].status, 'sent'); assert.equal(accepted.size, 1, 'A connection loss after acceptance does not duplicate email'); assert.equal(requests[0].key, requests[1].key); assert.equal(jobs('buyer@example.test')[1].due_at, now + 3600000, 'Next delay is relative to actual accepted delivery');
  const unsubscribeUrl = requests[0].body.text.match(/https:\/\/fivegen\.test\/unsubscribe#[a-f0-9]{64}/)[0], token = new URL(unsubscribeUrl).hash.slice(1);
  const storedTokens = storage.sqlite.prepare('SELECT * FROM automation_unsubscribe_tokens').all(); assert.equal(storedTokens.length, 1); assert.notEqual(storedTokens[0].hash, token, 'Only token hashes are stored'); assert.ok(!JSON.stringify(storedTokens).includes(token));
  const order = purchase('buyer@example.test'); await deps.enrollAutomationPurchase(order); assert.equal(jobs('buyer@example.test')[1].status, 'cancelled', 'Verified purchase stops remaining sales emails');
  let purchaseDraft = { ...deps.defaultAutomation('purchase', 'Creator'), replyTo: 'creator@example.test' }; assert.equal((await save('purchase', purchaseDraft)).status, 200); assert.equal((await status('purchase', 1)).status, 200);
  const testOrder = purchase('stripe-test@example.test', 'paid', 'test'); await deps.enrollAutomationPurchase(testOrder); assert.equal(jobs('stripe-test@example.test').length, 0, 'Stripe test purchases never send real email');
  const pendingOrder = purchase('unpaid@example.test', 'pending'); await deps.enrollAutomationPurchase(pendingOrder); assert.equal(jobs('unpaid@example.test').length, 0);
  now += 1; const onboardingOrder = purchase('customer@example.test'); await deps.enrollAutomationPurchase(onboardingOrder); assert.equal(jobs('customer@example.test').length, 1); await deps.dispatchAutomations(); assert.equal(jobs('customer@example.test')[0].status, 'sent'); assert.ok(!requests.at(-1).body.text.includes('unsubscribe'), 'Transactional onboarding uses verified live orders');
  response = await unsubscribe.POST(request('/api/automations/unsubscribe', 'POST', { token })); assert.equal(response.status, 200); assert.equal((await unsubscribe.POST(request('/api/automations/unsubscribe', 'POST', { token }))).status, 200, 'Unsubscribe is idempotent');
  assert.equal(storage.sqlite.prepare('SELECT marketing FROM growth_leads WHERE email=?').get('buyer@example.test').marketing, 0);
  assert.equal(storage.sqlite.prepare('SELECT COUNT(*) AS count FROM automation_suppressions').get().count, 1);
  const unsubscribedCalls = networkCalls; now += 3600001; await deps.dispatchAutomations(); assert.equal(networkCalls, unsubscribedCalls);
  // Unsubscribe applies across products for the same creator, but not other creators.
  const sameOwnerProduct = randomUUID(); product(sameOwnerProduct, owner); await deps.saveAutomation(sameOwnerProduct, owner, 'lead', draft, 0); await deps.setAutomationStatus(sameOwnerProduct, owner, 'lead', 'activate', 1);
  lead('buyer@example.test', 1, randomUUID(), owner, sameOwnerProduct); await deps.enrollAutomationLead(sameOwnerProduct, owner, 'buyer@example.test'); assert.equal(storage.sqlite.prepare('SELECT COUNT(*) AS count FROM automation_enrollments WHERE product_id=?').get(sameOwnerProduct).count, 0);
  // Pause is rechecked after asynchronous credential resolution, before network IO.
  lead('paused@example.test'); await deps.enrollAutomationLead(productId, owner, 'paused@example.test');
  duringProviderKey = () => deps.setAutomationStatus(productId, owner, 'lead', 'pause', 2); const beforePause = networkCalls; await deps.dispatchAutomations(); assert.equal(networkCalls, beforePause); assert.equal(jobs('paused@example.test')[0].status, 'pending');
  now += 2 * 86400000; assert.equal((await status('lead', 2)).status, 200); await deps.dispatchAutomations(); assert.equal(jobs('paused@example.test')[0].status, 'sent', 'A paused job never attempted before can resume after several days');
  lead('revoked@example.test'); await deps.enrollAutomationLead(productId, owner, 'revoked@example.test');
  storage.sqlite.prepare('UPDATE growth_leads SET marketing=0 WHERE email=?').run('revoked@example.test'); const beforeRevoke = networkCalls; await deps.dispatchAutomations(); assert.equal(networkCalls, beforeRevoke); assert.equal(jobs('revoked@example.test')[0].status, 'cancelled');
  lead('crash@example.test'); await deps.enrollAutomationLead(productId, owner, 'crash@example.test'); const crashJob = jobs('crash@example.test')[0];
  storage.sqlite.prepare("UPDATE automation_jobs SET status='sending',lease=?,first_attempt_at=? WHERE id=?").run(now - 1, now - 24 * 3600000, crashJob.id); const beforeCrash = networkCalls; await deps.dispatchAutomations(); assert.equal(jobs('crash@example.test')[0].status, 'failed'); assert.equal(networkCalls, beforeCrash, 'Expired provider idempotency windows cannot accidentally duplicate emails');
  lead('catchup@example.test'); await deps.dispatchAutomations(); assert.equal(jobs('catchup@example.test')[0].status, 'sent', 'Worker recovers enrollment after signup persistence without a hook');
  const revoked = purchase('refunded@example.test'); await deps.enrollAutomationPurchase(revoked); storage.sqlite.prepare("UPDATE commerce_orders SET status='revoked' WHERE id=?").run(revoked); const beforeRefund = networkCalls; await deps.dispatchAutomations(); assert.equal(networkCalls, beforeRefund); assert.equal(jobs('refunded@example.test')[0].status, 'cancelled');
  response = await api.GET(request(`/api/automations?productId=${productId}`)); assert.equal(response.status, 200); const state = await response.json(); assert.ok(state.counts.sent >= 1); assert.ok(state.logs.some(log => log.status === 'failed')); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.ok(!JSON.stringify(state).includes(configuration.AUTOMATION_DISPATCH_SECRET));
  lead('archived-before-send@example.test');await deps.enrollAutomationLead(productId,owner,'archived-before-send@example.test');
  let archive;duringProviderKey=async()=>{archive=await deps.setProductArchive(productId,owner,{action:'archive',expectedUpdatedAt:Number(storage.sqlite.prepare('SELECT updated_at FROM products WHERE id=?').get(productId).updated_at)});};
  const beforeArchiveSend=networkCalls;await deps.dispatchAutomations();assert.equal(networkCalls,beforeArchiveSend,'An archive during asynchronous preparation is rechecked before provider I/O');assert.equal(jobs('archived-before-send@example.test')[0].status,'pending','Unsent marketing is held behind a paused sequence');
  await deps.setProductArchive(productId,owner,{action:'restore',expectedUpdatedAt:archive.product.updatedAt});await deps.dispatchAutomations();assert.equal(networkCalls,beforeArchiveSend,'Restoring a product does not silently resume its held email queue');
  console.log('Passed: real SQLite sequences, optimistic edits, immutable approval, missing-config gates, owner isolation, CSRF, worker authentication, consent, activation windows, event dedupe, purchase stop rules, test/live isolation, paid onboarding, retry idempotency, leases, relative delays, pause/revoke rechecks, hashed unsubscribe and creator-wide suppression, catch-up enrollment, expired retry windows and refund cancellation. All email requests mocked; no external sends.');
  console.log('QA records retained: ' + root);
} finally { globalThis.fetch = realFetch; Date.now = realNow; storage.close(); }
