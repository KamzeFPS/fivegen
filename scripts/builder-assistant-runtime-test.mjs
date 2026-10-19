import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {createStorage} from '../runtime/render/storage.mjs';
import {digest} from '../runtime/render/auth.mjs';

// Built-app HTTP regression: production authentication, SQLite migrations,
// allowance, wallet and the actual lib/ai.ts HTTP transport. The provider below
// is a synthetic Responses API fixture; no real key or external fetch is used.
const root = resolve('outputs/builder-assistant-runtime-qa', randomUUID());
const probe = createServer();
await new Promise(done => probe.listen(0, '127.0.0.1', done));
const port = probe.address().port;
await new Promise(done => probe.close(done));
const base = `http://127.0.0.1:${port}`;
const fixtureKey = 'fixture-only-builder-assistant-provider-key';
Object.assign(process.env, {
  NODE_ENV: 'production', APP_ORIGIN: base, PORT: String(port), FIVEGEN_RUNTIME: 'render', FIVEGEN_DATA_DIR: root,
  GOOGLE_CLIENT_ID: 'fixture', GOOGLE_CLIENT_SECRET: 'fixture', CREDENTIAL_ENCRYPTION_KEY: 'builder-assistant-runtime-fixture-'.repeat(3),
  RENDER_EXTERNAL_URL: '', RENDER: '', PRODUCT_DOMAIN: '', ADMIN_EMAILS: '', AI_DAILY_BUDGET_USD: '10',
  OPENAI_API_KEY: fixtureKey, ANTHROPIC_API_KEY: '', FAL_KEY: '', RESEND_API_KEY: '', EMAIL_FROM: '',
  AUTOMATION_DISPATCH_SECRET: '', AUTOMATIONS_WORKER_ENABLED: 'false',
  PADDLE_ENVIRONMENT: 'sandbox', PADDLE_API_KEY: '', PADDLE_WEBHOOK_SECRET: '',
  STRIPE_MODE: 'test', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_CONNECT_WEBHOOK_SECRET: '', STRIPE_COMMERCE_ENABLED: 'false',
});
const owner = 'builder-assistant-runtime-owner', other = 'builder-assistant-runtime-other';
const tokens = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
const version = readFileSync('lib/terms.ts', 'utf8').match(/TERMS_VERSION='([^']+)'/)[1];
const seed = createStorage(root);
for (const [index, id] of [owner, other].entries()) {
  seed.sqlite.prepare('INSERT INTO render_sessions VALUES (?,?,?,?,?)').run(digest(tokens[index]), id, `${id}@example.test`, 'Builder Assistant QA', Date.now() + 3600000);
  seed.sqlite.prepare('INSERT INTO terms_acceptances VALUES (?,?,?,?,?)').run(randomUUID(), id, version, `${id}@example.test`, Date.now());
}
seed.close();

const originalFetch = globalThis.fetch, unexpectedOutbound = [];
let providerCalls = 0, providerMode = 'nullable';
globalThis.fetch = async (input, options) => {
  const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) return originalFetch(input, options);
  if (target.href !== 'https://api.openai.com/v1/responses') {
    unexpectedOutbound.push(target.origin);
    throw new Error('Builder assistant runtime test blocked an unexpected external call.');
  }
  providerCalls++;
  assert.equal(options?.method, 'POST');
  assert.equal(new Headers(options?.headers).get('authorization'), `Bearer ${fixtureKey}`);
  const body = JSON.parse(options.body);
  assert.equal(body.text?.format?.type, 'json_object');
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 3000);
  assert.match(body.input, /Match this JSON schema exactly:/, 'The real transport must send the response contract to the model');
  for (const field of ['answer', 'questions', 'suggestion']) {
    assert.ok(body.input.includes(`"${field}"`), `The provider prompt includes the ${field} response field`);
  }
  assert.ok(body.input.includes('illustrator') && body.input.includes('Reader handoff'), 'The actual draft and request reach the provider');
  if (providerMode === 'unavailable') return Response.json({error: {code: 'fixture_unavailable', message: 'Synthetic failure.'}}, {status: 503});
  const response = providerMode === 'malformed'
    ? {answer: 'This malformed proposed title must be rejected without changing the product.', questions: [], suggestion: {summary: 'Synthetic invalid edit.', title: 123}}
    : {answer: 'This introduction can make the reader outcome clearer. Review the proposed description before applying it.', questions: null, suggestion: {summary: 'Clarify the practical reader outcome.', title: null, description: 'A practical, original client handoff guide for independent illustrators.', audience: null, sections: null}};
  return Response.json({id: `resp_fixture_${providerCalls}`, status: 'completed', output: [{type: 'message', role: 'assistant', content: [{type: 'output_text', text: JSON.stringify(response)}]}]});
};
const {start} = await import('../runtime/render/server.mjs');
const app = await start();
const headers = {cookie: `fivegen-local-session=${tokens[0]}`, origin: base, 'content-type': 'application/json'};
const otherHeaders = {...headers, cookie: `fivegen-local-session=${tokens[1]}`};
const anonymous = {origin: base, 'content-type': 'application/json'};
async function json(path, method = 'GET', body, auth = headers, expected = 200) {
  const response = await fetch(base + path, {method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch { throw new Error(`${method} ${path}: expected JSON, received ${response.status} ${text.slice(0, 250)}`); }
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  return value;
}
try {
  let book = await json('/api/builder', 'POST', {type: 'book', source: 'manual', requestId: randomUUID()}, headers, 201);
  book = await json(`/api/builder/${book.product.id}`, 'PATCH', {
    expectedVersion: book.version,
    draft: {...book.draft, title: 'Reader handoff', description: 'An original practical guide for independent illustrators.', audience: 'Independent illustrators', sections: [{id: randomUUID(), title: 'Prepare the handoff', body: 'PRIVATE_ORIGINAL_TEXT: Document the intended use and review your own delivery checklist.'}]},
  });
  const sql = app.storage.sqlite, productId = book.product.id;
  const unchangedProduct = JSON.stringify(sql.prepare('SELECT * FROM products WHERE id=?').get(productId));
  const unchangedBuilder = JSON.stringify(sql.prepare('SELECT * FROM product_builder_workspaces WHERE product_id=?').get(productId));
  const path = `/api/products/${productId}/builder-assistant`;
  await json(path, 'GET', undefined, anonymous, 401);
  await json(path, 'GET', undefined, otherHeaders, 404);
  let state = await json(path);
  assert.equal(state.aiReady, true); assert.equal(state.remaining, 20); assert.equal(state.unlimited, false);
  const initial = {requestId: randomUUID(), message: 'Refine my illustrator guide description and preserve the Reader handoff title.', expectedUpdatedAt: 0, maxCredits: 0, target: 'refine', context: {type: 'Book', title: book.draft.title, description: book.draft.description, audience: book.draft.audience, language: 'English', fields: {}, sections: book.draft.sections.map(({title, body}) => ({title, body}))}};
  await json(path, 'POST', initial, otherHeaders, 404);
  await json(path, 'POST', initial, {...headers, origin: 'https://outside.example.test'}, 403);
  assert.equal(providerCalls, 0, 'Ownership and origin checks run before the provider');
  state = await json(path, 'POST', initial);
  assert.equal(providerCalls, 1); assert.equal(state.spent, 0); assert.equal(state.remaining, 19);
  assert.equal(state.conversation.messages.length, 2);
  assert.deepEqual(state.conversation.messages.at(-1).questions, []);
  assert.deepEqual(state.conversation.messages.at(-1).suggestion, {summary: 'Clarify the practical reader outcome.', description: 'A practical, original client handoff guide for independent illustrators.'}, 'Unused nullable fields are normalized into non-destructive applicable edits');
  assert.deepEqual((await json(path)).conversation, state.conversation, 'The valid answer survives a new HTTP read');
  assert.deepEqual(await json(path, 'POST', initial), state, 'A replay returns the exact persisted success response');
  assert.equal(providerCalls, 1, 'A repeated request cannot charge or call the provider again');
  assert.equal(sql.prepare('SELECT state FROM studio_plan_turns WHERE id=?').get(initial.requestId).state, 'completed');
  assert.ok(sql.prepare('SELECT reserved_micros FROM ai_budget').get().reserved_micros > 0, 'The real provider transport reserves the platform budget');

  const period = new Date().toISOString().slice(0, 7);
  for (let index = 0; index < 19; index++) sql.prepare("INSERT INTO studio_plan_turns (id,owner,conversation_id,prompt,period,mode,state,created_at) VALUES (?,?,?,?,?,'included','completed',?)").run(randomUUID(), owner, 'other-fixture-conversation', 'Synthetic quota fixture', period, Date.now());
  sql.prepare('UPDATE wallets SET purchased=100 WHERE owner=?').run(owner);
  const cost = state.cost;
  assert.ok(cost > 0);
  const paid = {...initial, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt};
  await json(path, 'POST', paid, headers, 402);
  assert.equal(providerCalls, 1, 'Exhausted included quota requires explicit paid consent before transport');
  state = await json(path, 'POST', {...paid, requestId: randomUUID(), maxCredits: cost});
  assert.equal(state.spent, cost); assert.equal(state.credits, 100 - cost); assert.equal(providerCalls, 2);
  const lastValidConversation = state.conversation;
  for (const mode of ['malformed', 'unavailable']) {
    providerMode = mode;
    const requestId = randomUUID();
    const error = await json(path, 'POST', {...paid, requestId, expectedUpdatedAt: state.conversation.updatedAt, maxCredits: cost}, headers, 502);
    if (mode === 'malformed') assert.match(error.error, /incomplete suggestion/);
    assert.equal(sql.prepare('SELECT purchased FROM wallets WHERE owner=?').get(owner).purchased, 100 - cost, 'A failed provider attempt refunds the actual wallet reservation');
    assert.equal(sql.prepare('SELECT state FROM credit_usage WHERE id=?').get(requestId).state, 'refunded');
    assert.equal(sql.prepare('SELECT state FROM studio_plan_turns WHERE id=?').get(requestId).state, 'failed');
    assert.deepEqual((await json(path)).conversation, lastValidConversation, 'A failure cannot replace the last valid conversation');
    assert.equal(sql.prepare('SELECT lease FROM studio_conversations WHERE id=?').get(`builder:${productId}`).lease, 0, 'A failed attempt releases the chat lease');
  }
  assert.equal(providerCalls, 4);
  assert.equal(JSON.stringify(sql.prepare('SELECT * FROM products WHERE id=?').get(productId)), unchangedProduct, 'Suggestions and errors never mutate the original product');
  assert.equal(JSON.stringify(sql.prepare('SELECT * FROM product_builder_workspaces WHERE product_id=?').get(productId)), unchangedBuilder, 'Edits still require a separate explicit Apply action');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM ai_product_runs WHERE owner=?').get(owner).n, 0, 'Planning never creates a full-product generation run');
  assert.deepEqual(unexpectedOutbound, [], 'No external request outside the synthetic provider fixture was attempted');
  console.log('Passed: built HTTP builder assistant — real AI schema transport, nullable suggestion normalization, auth/ownership/origin gates, persisted conversation and idempotent replay, real included allowance and budget, paid consent/debit/refunds, malformed-output safety, lease recovery, and unchanged original product/builder. No external calls.');
  console.log('QA fixtures retained: ' + root);
} finally {
  process.env.OPENAI_API_KEY = '';
  await new Promise(done => { app.server.close(done); app.server.closeIdleConnections(); });
  app.storage.close();
  globalThis.fetch = originalFetch;
}
