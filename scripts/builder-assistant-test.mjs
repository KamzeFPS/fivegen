import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createStorage } from '../runtime/render/storage.mjs';
import { creditPolicy, creditPacks, textCredits, monthlyWindow } from '../lib/credit-policy.ts';

// Real route, persisted conversations, quota and credit ledger. Only the
// identity and AI provider transport use fixtures; no credentials or external calls.
const root = resolve('outputs/builder-assistant-qa', randomUUID()), storage = createStorage(root), sql = storage.sqlite;
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
let owner = 'builder-assistant-fixture', calls = 0, failureMode = '', release = null, held = null, lastInput = null;
const dependencies = {
  z, zodToJsonSchema, ApiError, database: () => storage.DB, binding: () => '', creditPolicy, creditPacks, textCredits, monthlyWindow, planningAllowance: 20, mcpCreditLimit: new AsyncLocalStorage(),
  stripe: () => { throw new Error('Payment transport must never run.'); },
  identity: async () => ({ userId: owner }), sameOrigin: request => { if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('Origin rejected.', 403); },
  failure: error => Response.json({ error: error.message }, { status: error.status || 400 }),
  ownedProduct: async (id, account) => { const row = sql.prepare('SELECT * FROM products WHERE id=? AND owner=?').get(id, account); if (!row) throw new ApiError('Product not found.', 404); return row; },
  providerSettings: async () => ({ connected: { openai: true }, config: { textProvider: 'openai', paused: false } }),
  textGeneration: async (_owner, system, input) => {
    calls++; lastInput = JSON.parse(input); if (held) await held;
    if (failureMode === 'provider') throw new ApiError('Fixture provider unavailable.', 502);
    return { answer: 'Here is a focused outline for your original practical playbook. Review it before applying.', questions: ['What experience should the reader already have?'], suggestion: { summary: 'A four-step process specific to independent illustrators.', title: 'The Illustrator Handoff Playbook', sections: [{ title: 'Prepare the brief', body: failureMode === 'oversized' ? 'A'.repeat(1801) : 'Identify the client, format and intended use.' }, { title: 'Deliver the work', body: 'Use a repeatable handoff checklist.' }] } };
  },
};
async function load(path) {
  const key = `builderAgentQa${randomUUID().replaceAll('-', '')}`; globalThis[key] = { ...dependencies };
  const source = fs.readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); delete globalThis[key]; return result;
}
for (const path of ['lib/generation-access.ts', 'lib/product-allowance.ts', 'lib/subscription-credits.ts', 'lib/credits.ts', 'lib/builder-assistant-contract.ts', 'lib/builder-assistant.ts']) Object.assign(dependencies, await load(path));
const route = await load('app/api/products/[id]/builder-assistant/route.ts');
const productId = randomUUID(), now = Date.now(), initialContent = '{"fixture":"unchanged"}';
sql.prepare("INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) VALUES (?,?,?,'Fixture playbook','A practical creator-owned playbook.','Illustrators','Playbook',0,'orange',?,'draft',?,?)").run(productId, owner, productId, initialContent, now, now);
const context = { type: 'Playbook', title: 'Illustrator Handoff', description: 'A practical creator-owned playbook.', audience: 'Independent illustrators', language: 'English', fields: { outcome: 'A consistent client handoff' }, sections: [] };
const request = (body, origin = 'http://localhost') => new Request(`http://localhost/api/products/${productId}/builder-assistant`, { method: body ? 'POST' : 'GET', headers: { origin, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
const params = { params: Promise.resolve({ id: productId }) }, post = input => route.POST(request(input), params), read = () => route.GET(request(), params);
async function ok(response, status = 200) { const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data; }
const input = { requestId: randomUUID(), message: 'Plan my practical illustrator handoff outline.', expectedUpdatedAt: 0, maxCredits: 0, target: 'outline', context };
try {
  let state = await ok(await read()); assert.equal(state.remaining, 20); assert.equal(state.aiReady, true); assert.equal(state.conversation.messages.length, 0);
  state = await ok(await post(input)); assert.equal(state.remaining, 19); assert.equal(state.spent, 0); assert.equal(calls, 1); assert.equal(state.conversation.messages.length, 2);
  const first = state;
  assert.equal(sql.prepare('SELECT content FROM products WHERE id=?').get(productId).content, initialContent, 'Assistant suggestions never mutate the product');
  await ok(await post(input)); assert.equal(calls, 1, 'Replay returns persisted response without another AI call');
  await ok(await post({ ...input, message: 'Change input using the same request ID' }), 409);
  await ok(await post({ ...input, requestId: randomUUID() }), 409);
  owner = 'outside-workspace'; await ok(await read(), 404); await ok(await post(input), 404); owner = 'builder-assistant-fixture';
  await ok(await route.POST(request({ ...input, requestId: randomUUID() }, 'https://outsider.example'), params), 403);
  const period = new Date().toISOString().slice(0, 7);
  for (let i = 0; i < 19; i++) sql.prepare("INSERT INTO studio_plan_turns (id,owner,conversation_id,prompt,period,mode,state,created_at) VALUES (?,?,?,?,?,'included','completed',?)").run(randomUUID(), owner, 'other-conversation', 'Quota fixture', period, now);
  const paid = { ...input, requestId: randomUUID(), expectedUpdatedAt: first.conversation.updatedAt, message: 'Refine the introduction for beginners.', target: 'refine' };
  await ok(await post(paid), 402); assert.equal(calls, 1, 'No provider call before explicit credit approval');
  await ok(await post({ ...paid, requestId: randomUUID(), maxCredits: 10 }), 402); assert.equal(calls, 1, 'No provider call when wallet is empty');
  sql.prepare('UPDATE wallets SET purchased=100 WHERE owner=?').run(owner);
  state = await ok(await post({ ...paid, requestId: randomUUID(), maxCredits: 10 })); assert.equal(state.spent, 10); assert.equal((await dependencies.creditBalance(owner)).purchased, 90);
  assert.equal(lastInput.target, 'refine'); assert.deepEqual(lastInput.conversation[1].questions, first.conversation.messages[1].questions);
  failureMode = 'provider'; await ok(await post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 10 }), 502); assert.equal((await dependencies.creditBalance(owner)).purchased, 90, 'Provider failure refunds the actual credit ledger');
  failureMode = 'oversized'; await ok(await post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 10 }), 502); assert.equal((await dependencies.creditBalance(owner)).purchased, 90, 'Full content cannot be generated through planning; oversized output is rejected and refunded');
  failureMode = ''; held = new Promise(done => { release = done; });
  const active = post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 10 });
  await new Promise(done => setTimeout(done, 25)); await ok(await post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 10 }), 409); release(); state = await ok(await active); held = null;
  assert.equal((await dependencies.creditBalance(owner)).purchased, 80, 'Only completed requests spend credits');
  const restored = await ok(await read()); assert.deepEqual(restored.conversation, state.conversation, 'Chat and suggestions survive reload');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM ai_product_runs WHERE owner=?').get(owner).n, 0, 'Planning does not create complete-product runs');
  sql.prepare('INSERT INTO terms_acceptances VALUES (?,?,?,?,?)').run(randomUUID(), owner, 'fixture', 'kamzewac@gmail.com', Date.now());
  state = await ok(await post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 0 })); assert.equal(state.spent, 0); assert.equal((await dependencies.creditBalance(owner)).purchased, 80, 'Verified unlimited owner access preserves wallet balance');
  console.log('Passed: product-scoped ownership, same-origin protection, persistence, idempotent replay, optimistic conflict/concurrency, shared planning allowance, explicit paid consent, actual ledger debit/refund, bounded suggestions, and unlimited owner access. No external provider calls.');
  console.log('QA fixtures retained: ' + root);
} finally { storage.close(); }
