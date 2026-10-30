import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createStorage } from '../runtime/render/storage.mjs';
import { textCredits,creditPolicy as launchCreditPolicy,creditPacks,monthlyWindow } from '../lib/credit-policy.ts';

const root = resolve('outputs/growth-ai-qa', randomUUID()), storage = createStorage(root);
let owner = 'growth-owner', calls = 0, invalid = false, fail = false, hold, lastSystem, lastPrompt, unlimited = false;
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const generated = { vsl: 'Creator: Here is the honest story behind my offer. [Record your own demonstration.]', landing: { headline: 'A calmer way to onboard clients', subheadline: 'For independent illustrators', body: 'Learn a process from the creator’s real experience.', benefits: ['A clear handoff checklist'], ctaLabel: 'Request details', thankYou: 'Your request has been received.' }, followUp: 'Subject: Your illustration handoff questions\nThanks for requesting details.' };
const deps = {
  z, zodToJsonSchema, ApiError, textCredits,creditPolicy:{...launchCreditPolicy,monthly:0},creditPacks,monthlyWindow, database: () => storage.DB,
  identity: async () => { if (!owner) throw new ApiError('Sign in', 401); return { userId: owner }; },
  sameOrigin: req => { if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) throw new ApiError('Invalid origin', 403); },
  failure: error => Response.json({ error: error.message }, { status: error.status || (error.issues ? 400 : 500) }),
  ownedProduct: async (id, account) => { const row = await storage.DB.prepare('SELECT * FROM products WHERE id=? AND owner=?').bind(id, account).first(); if (!row) throw new ApiError('Product not found.', 404); return row; },
  providerSettings: async () => ({ connected: { openai: true }, config: { textProvider: 'openai', paused: false } }),
  textGeneration: async (_owner, system, prompt, _tokens, schema) => {
    calls++; lastSystem = system; lastPrompt = JSON.parse(prompt);
    assert.equal(schema.name, 'fivegen_growth_copy'); assert.ok(schema.schema);
    if (hold) await hold;
    if (fail) throw new ApiError('Provider failed', 502);
    return invalid ? { ...generated, vsl: '' } : generated;
  },
  hasUnlimitedGeneration: async () => unlimited,
  productAllowance: async () => ({ remaining: 3 }), subscriptionCreditBalance: async () => ({ included: 0 }),
  spendableGrant: () => 'g.remaining>0', mcpCreditLimit: { getStore: () => null },
};
async function load(path) {
  const key = 'growthqa' + randomUUID().replaceAll('-', ''); globalThis[key] = { ...deps };
  const source = fs.readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(deps).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedScript = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); delete globalThis[key]; return loadedScript;
}
Object.assign(deps, await load('lib/growth.ts'));
// Isolate purchased-credit reservations/refunds after the Free pool is exhausted.
Object.assign(deps, await load('lib/credits.ts'));
Object.assign(deps, await load('lib/creator-voice.ts'), await load('lib/campaign-run.ts'));
Object.assign(deps, await load('lib/creator-voice-server.ts'));
Object.assign(deps,await load('lib/creator-context-contract.ts'));
Object.assign(deps,await load('lib/creator-context-server.ts'),await load('lib/marketing-versions-server.ts'));
Object.assign(deps, await load('lib/growth-server.ts'));
Object.assign(deps, await load('lib/creator-context-request.ts'));
const route = await load('app/api/products/[id]/growth/route.ts'), generateRoute = await load('app/api/products/[id]/growth/generate/route.ts');
const id = randomUUID(), otherId = randomUUID();
const product = productId => storage.sqlite.prepare("INSERT INTO products (id,owner,slug,title,description,audience,format,color,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'orange',?,1,1)").run(productId, owner, 'growth-' + productId, 'Illustration handoff', 'A creator-authored illustration offer.', 'Independent illustrators', 'Guide', JSON.stringify({ sections: [], benefits: [], launch: '' }));
product(id); product(otherId);
storage.sqlite.prepare('INSERT INTO wallets (owner,purchased) VALUES (?,100)').run(owner);
const initialCredits=await deps.creditBalance(owner);assert.equal(initialCredits.starter,0,'Purchased-credit fixture starts without Free credits');assert.equal(initialCredits.total,100);
const params = { params: Promise.resolve({ id }) }, url = `http://localhost/api/products/${id}/growth`;
const get = () => route.GET(new Request(url), params);
const patch = (input, headers = {}) => route.PATCH(new Request(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input) }), params);
// Historical internal writer retains its crash/credit regression coverage; the HTTP route only exposes scoped proposals.
const generate=async input=>{try{return Response.json(await deps.generateGrowth(id,owner,input));}catch(error){return deps.failure(error);}};
const publicGenerate=input=>generateRoute.POST(new Request(url+'/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),params);
const balance = () => storage.sqlite.prepare('SELECT purchased FROM wallets WHERE owner=?').get('growth-owner').purchased;
const brief = { icp: 'Independent illustrators', problem: 'Client handoffs take too long', beliefs: 'A professional process must be complicated', story: 'I simplified my own studio handoffs', promise: 'A repeatable process, without a guaranteed financial outcome', proof: 'No proof yet', offer: 'My recorded lessons and a checklist', tone: 'Plain spoken and warm', cta: 'Request details' };
try {
  let response = await get(), current = (await response.json()).growth;
  assert.equal(current.updatedAt, 0); assert.equal(current.assets, null); assert.equal(current.brief.icp, 'Independent illustrators');
  owner = ''; assert.equal((await get()).status, 401); owner = 'other-owner'; assert.equal((await get()).status, 404); owner = 'growth-owner';
  const saveInput = { brief, assets: null, expectedUpdatedAt: 0 };
  assert.equal((await patch(saveInput, { Origin: 'https://attacker.test' })).status, 403);
  response = await patch(saveInput); assert.equal(response.status, 200); current = (await response.json()).growth;
  assert.equal((await patch(saveInput)).status, 409, 'A stale revision cannot overwrite saved answers');
  const input = { expectedUpdatedAt: current.updatedAt, requestId: randomUUID(), maxCredits: 0 };
  assert.equal((await publicGenerate({...input,maxCredits:10})).status,400,'Public HTTP cannot invoke the historical bundled overwrite path');assert.equal(calls,0);assert.equal(balance(),100);
  assert.equal((await generate(input)).status, 402); assert.equal(calls, 0); assert.equal(balance(), 100);
  response = await generate({ ...input, maxCredits: 10 }); assert.equal(response.status, 200); const first = await response.json();
  current = first.growth; assert.equal(first.spent, 10); assert.equal(balance(), 90); assert.equal(calls, 1);
  assert.deepEqual(lastPrompt.brief, brief); assert.match(lastSystem, /Never invent/); assert.match(lastSystem, /creator makes and teaches/);
  assert.equal(storage.sqlite.prepare('SELECT state FROM credit_usage WHERE id=?').get(input.requestId).state, 'completed');
  response = await generate({ ...input, maxCredits: 10 }); assert.deepEqual(await response.json(), first); assert.equal(calls, 1); assert.equal(balance(), 90);
  assert.equal((await generate({ ...input, expectedUpdatedAt: current.updatedAt, maxCredits: 10 })).status, 409, 'An idempotency ID cannot be reused for a different saved brief');
  assert.equal((await generate({ ...input, requestId: randomUUID(), maxCredits: 10 })).status, 409, 'A stale revision cannot spend credits');
  const beforeFailure = current.updatedAt;
  fail = true; const failedId = randomUUID(); response = await generate({ expectedUpdatedAt: current.updatedAt, requestId: failedId, maxCredits: 10 }); assert.equal(response.status, 502); fail = false;
  assert.equal(balance(), 90); assert.equal(storage.sqlite.prepare('SELECT state FROM credit_usage WHERE id=?').get(failedId).state, 'refunded');
  assert.equal((await (await get()).json()).growth.updatedAt, beforeFailure, 'Provider failure preserves existing copy');
  invalid = true; response = await generate({ expectedUpdatedAt: current.updatedAt, requestId: randomUUID(), maxCredits: 10 }); assert.equal(response.status, 502); invalid = false; assert.equal(balance(), 90);
  let release; hold = new Promise(done => { release = done; });
  const activeId = randomUUID(), active = generate({ expectedUpdatedAt: current.updatedAt, requestId: activeId, maxCredits: 10 });
  while (storage.sqlite.prepare('SELECT state FROM growth_generation_runs WHERE id=?').get(activeId)?.state !== 'pending') await new Promise(done => setTimeout(done, 5));
  assert.equal((await patch({ brief, assets: current.assets, expectedUpdatedAt: current.updatedAt })).status, 409, 'Saving cannot overwrite a running generation');
  assert.equal((await generate({ expectedUpdatedAt: current.updatedAt, requestId: randomUUID(), maxCredits: 10 })).status, 409, 'Concurrent generation cannot charge twice');
  release(); response = await active; hold = null; assert.equal(response.status, 200); current = (await response.json()).growth; assert.equal(balance(), 80);
  unlimited = true; response = await generate({ expectedUpdatedAt: current.updatedAt, requestId: randomUUID(), maxCredits: 0 }); assert.equal(response.status, 200); current = (await response.json()).growth; assert.equal(balance(), 80); unlimited = false;
  response = await patch({ brief: { ...brief, promise: '' }, assets: current.assets, expectedUpdatedAt: current.updatedAt }); current = (await response.json()).growth;
  assert.equal((await generate({ expectedUpdatedAt: current.updatedAt, requestId: randomUUID(), maxCredits: 10 })).status, 400, 'Missing core outcome is rejected without a provider call');
  const shortBrief={...deps.emptyGrowthBrief('Independent illustrators'),promise:brief.promise,offer:brief.offer};
  response=await patch({brief:shortBrief,assets:current.assets,expectedUpdatedAt:current.updatedAt});current=(await response.json()).growth;
  unlimited=true;response=await generate({expectedUpdatedAt:current.updatedAt,requestId:randomUUID(),maxCredits:0});assert.equal(response.status,200,'A three-answer brief works without inventing required stories or proof');current=(await response.json()).growth;unlimited=false;
  assert.deepEqual(lastPrompt.brief,shortBrief,'Unknown optional facts stay empty through generation');assert.match(lastSystem,/omit missing personal stories/);assert.equal(balance(),80);
  // A timed-out worker must not overwrite a later manual edit, even after its
  // lease expires while the provider request is still returning.
  response = await patch({ brief, assets: current.assets, expectedUpdatedAt: current.updatedAt }); current = (await response.json()).growth;
  hold = new Promise(done => { release = done; }); const lateId = randomUUID();
  const late = generate({ expectedUpdatedAt: current.updatedAt, requestId: lateId, maxCredits: 10 });
  while (storage.sqlite.prepare('SELECT state FROM growth_generation_runs WHERE id=?').get(lateId)?.state !== 'pending') await new Promise(done => setTimeout(done, 5));
  storage.sqlite.prepare('UPDATE growth_workspaces SET lease=0 WHERE product_id=?').run(id);
  response = await patch({ brief: { ...brief, story: 'My newer creator story' }, assets: { ...current.assets, vsl: 'My latest manual script' }, expectedUpdatedAt: current.updatedAt }); assert.equal(response.status, 200);
  release(); response = await late; hold = null; assert.equal(response.status, 409); assert.equal(balance(), 80);
  current = (await (await get()).json()).growth; assert.equal(current.assets.vsl, 'My latest manual script');
  const abandonedId = randomUUID(), oldTime = Date.now() - 181000;
  await deps.reserveCredits(owner, abandonedId, 'text', 10); assert.equal(balance(), 70);
  storage.sqlite.prepare("INSERT INTO growth_generation_runs (id,owner,product_id,expected_updated_at,state,cost,created_at) VALUES (?,?,?,?,'pending',10,?)").run(abandonedId, owner, id, current.updatedAt, oldTime);
  storage.sqlite.prepare('UPDATE growth_workspaces SET lease=?,lease_id=? WHERE product_id=?').run(oldTime + 180000, abandonedId, id);
  response = await get(); assert.equal(response.status, 200); assert.equal(balance(), 80, 'Reload recovers credits reserved by a crashed worker after its lease expires');
  assert.equal(storage.sqlite.prepare('SELECT state FROM growth_generation_runs WHERE id=?').get(abandonedId).state, 'failed');
  assert.equal(storage.sqlite.prepare('SELECT lease_id FROM growth_workspaces WHERE product_id=?').get(id).lease_id, null);
  await get(); assert.equal(balance(), 80, 'Repeated recovery cannot refund twice');
  assert.equal((await generate({ expectedUpdatedAt: current.updatedAt, requestId: abandonedId, maxCredits: 10 })).status, 409, 'An abandoned request requires a new idempotency ID');
  // Even callers using the historical auto flag get a creator-owned blank
  // workspace. Agreed interview answers survive the planning handoff.
  Object.assign(deps, await load('lib/product.ts'), await load('lib/studio-plan.ts'));
  deps.productFromRow = row => ({ id: row.id, content: JSON.parse(row.content) });
  const createRoute = await load('app/api/products/route.ts');
  const create = body => createRoute.POST(new Request('http://localhost/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  response = await create({ title: 'My creator course', description: 'A course I record and teach myself.', audience: 'Independent illustrators', format: 'Video course', price: 0, color: 'orange', generationMode: 'auto' });
  assert.equal(response.status, 200); const manual = await response.json(); assert.equal(manual.mode, 'manual'); assert.equal(manual.product.content.sections[0].body, '');
  assert.equal(storage.sqlite.prepare('SELECT count(*) n FROM generation WHERE product_id=?').get(manual.product.id).n, 0);
  const conversationId = randomUUID();
  const plan = { title: 'A creator mentorship', description: 'One-to-one advice based on my own studio process.', audience: 'Independent illustrators', format: 'Consulting / Mentorship', language: 'English', duration: 7, deliverables: [{ name: 'Creator sessions', detail: 'The creator delivers three mentorship sessions.' }, { name: 'VSL script', detail: 'An editable script for the creator to record.' }, { name: 'Landing page', detail: 'A lead capture page for interested illustrators.' }], direction: 'An honest creator-led offer with practical growth copy.', assumptions: [], growthBrief: brief };
  storage.sqlite.prepare('INSERT INTO studio_conversations (id,owner,title,plan,updated_at) VALUES (?,?,?,?,1)').run(conversationId, owner, plan.title, JSON.stringify(plan));
  response = await create({ conversationId, expectedUpdatedAt: 1 }); assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, 'manual');
  assert.deepEqual(JSON.parse(storage.sqlite.prepare('SELECT brief FROM growth_workspaces WHERE product_id=?').get(conversationId).brief), brief);
  assert.equal(storage.sqlite.prepare('SELECT count(*) n FROM generation WHERE product_id=?').get(conversationId).n, 0);
  console.log('Passed: growth ownership, same-origin checks, revisions, complete interview, real credit ledger charges/refunds, provider schema validation, idempotency, concurrent runs, stale-worker/crash recovery and creator-authored plan handoff. AI transport uses fixtures.');
  console.log('QA records retained: ' + root);
} finally { storage.close(); }
