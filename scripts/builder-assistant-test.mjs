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
let owner = 'builder-assistant-fixture', calls = 0, failureMode = '', release = null, held = null, lastInput = null, lastSchema = null, customResponse = null;
const dependencies = {
  z, zodToJsonSchema, ApiError, database: () => storage.DB, binding: () => '', creditPolicy, creditPacks, textCredits, monthlyWindow, planningAllowance: 20, mcpCreditLimit: new AsyncLocalStorage(),
  stripe: () => { throw new Error('Payment transport must never run.'); },
  identity: async () => ({ userId: owner }), sameOrigin: request => { if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('Origin rejected.', 403); },
  failure: error => Response.json({ error: error.message }, { status: error.status || 400 }),
  ownedProduct: async (id, account) => { const row = sql.prepare('SELECT * FROM products WHERE id=? AND owner=?').get(id, account); if (!row) throw new ApiError('Product not found.', 404); return row; },
  providerSettings: async () => ({ connected: { openai: true }, config: { textProvider: 'openai', paused: false } }),
  textGeneration: async (_owner, system, input, _maxTokens, outputSchema) => {
    calls++; lastInput = JSON.parse(input); lastSchema = outputSchema?.schema; if (held) await held;
    if (customResponse) return structuredClone(customResponse);
    if (failureMode === 'provider') throw new ApiError('Fixture provider unavailable.', 502);
    if (failureMode === 'lease-race') sql.prepare('UPDATE studio_conversations SET lease=lease+1 WHERE product_id=? AND owner=?').run(productId,owner);
    if (failureMode === 'nullable') return { answer: 'Keep the existing title and outline. This description focuses the promise for illustrators.', questions: null, suggestion: { summary: 'Clarify the intended audience in the description.', title: null, description: 'A practical handoff process for independent illustrators.', audience: null, sections: null } };
    if (failureMode === 'discussion') return { answer: 'Your existing structure already supports that goal. We can discuss the intended outcome before proposing edits.', questions: [], suggestion: { summary: 'No changes proposed.', title: null, description: '', audience: null, sections: [] } };
    if (failureMode === 'malformed') return { answer: 'This answer does not make the invalid proposed edit safe.', questions: [], suggestion: { summary: 'Invalid fixture edit.', title: 100 } };
    if (lastInput.target === 'details' && failureMode !== 'oversized') return {answer: 'Here is the focused product description you requested. Review it before applying.', questions: [], suggestion: {summary: 'Clarify the product promise.', description: 'A practical client handoff playbook for independent illustrators.'}};
    return { answer: 'Here is a focused outline for your original practical playbook. Review it before applying.', questions: ['What experience should the reader already have?'], suggestion: { summary: 'A four-step process specific to independent illustrators.', title: 'The Illustrator Handoff Playbook', sections: [{ title: 'Prepare the brief', body: failureMode === 'oversized' ? 'A'.repeat(1801) : 'Identify the client, format and intended use.' }, { title: 'Deliver the work', body: 'Use a repeatable handoff checklist.' }] } };
  },
};
async function load(path) {
  const key = `builderAgentQa${randomUUID().replaceAll('-', '')}`; globalThis[key] = { ...dependencies };
  const source = fs.readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); delete globalThis[key]; return result;
}
for (const path of ['lib/generation-access.ts', 'lib/product-allowance.ts', 'lib/subscription-credits.ts', 'lib/credits.ts', 'lib/creator-voice.ts', 'lib/creator-voice-server.ts', 'lib/creator-context-contract.ts', 'lib/creator-context-server.ts', 'lib/builder-assistant-contract.ts', 'lib/builder-assistant.ts']) Object.assign(dependencies, await load(path));
const { parseBuilderAgentResponse, builderAgentResponseSchema, builderAgentResponseWireSchema, builderAgentRequestSchema, resolveBuilderAgentScope, scopeBuilderAgentResponse, builderAgentFieldKeysForContext, makeBuilderAgentResponseWireSchema } = dependencies;
const wireFixture = { answer: 'Here is a clearer product title for your audience.', questions: null, suggestion: { summary: 'Make the target audience explicit.', title: 'The Illustrator Handoff Playbook', description: null, audience: null, sections: null } };
assert.equal(builderAgentResponseSchema.safeParse(wireFixture).success, false, 'The raw nullable provider shape reproduces the previously rejected valid suggestion');
assert.equal(builderAgentResponseWireSchema.safeParse(wireFixture).success, true, 'The provider contract explicitly accepts null for unchanged fields');
assert.deepEqual(parseBuilderAgentResponse(wireFixture).data, { answer: wireFixture.answer, questions: [], suggestion: { summary: wireFixture.suggestion.summary, title: wireFixture.suggestion.title } }, 'Only absent edits are normalized; no product field is cleared');
assert.deepEqual(wireFixture.suggestion.description, null, 'Parsing never mutates the original provider output');
for (const suggestion of [{}, { summary: 'No edits needed.', title: null, description: '  ', audience: null, sections: [] }]) {
  const parsed = parseBuilderAgentResponse({ answer: 'We can discuss the audience before making changes.', suggestion });
  assert.equal(parsed.success, true); assert.equal(parsed.data.suggestion, null, 'A valid discussion survives an empty, non-applicable suggestion');
}
for (const raw of [
  { answer: 'No', suggestion: null },
  { answer: 'A valid answer cannot repair malformed questions.', questions: [null], suggestion: null },
  { answer: 'A valid answer cannot repair an invalid title.', suggestion: { summary: 'Change title.', title: 100 } },
  { answer: 'A valid answer cannot invent a missing edit summary.', suggestion: { title: 'Changed title' } },
  { answer: 'A valid answer cannot repair an incomplete section.', suggestion: { summary: 'Add a section.', sections: [{ title: 'Only title' }] } },
  { answer: 'A valid answer cannot bypass the planning content limit.', suggestion: { summary: 'Oversized edit.', sections: [{ title: 'First', body: 'A'.repeat(900) }, { title: 'Second', body: 'B'.repeat(901) }] } },
]) assert.equal(parseBuilderAgentResponse(raw).success, false, 'Malformed or oversized applicable edits must still fail safely');
const bookContext = { type: 'Book', builderType: 'book', title: 'After Breakup Glow-Up', description: 'An original fourteen-day workbook.', audience: 'Adults rebuilding everyday routines after a breakup', language: 'English', fields: { subtitle: 'Existing subtitle', bookPremise: 'Existing central promise', readerLevel: 'Complete beginner', outcome: 'One small practical action each day', tone: 'Warm and grounded', meetingUrl: 'https://private.example.test/meeting/PRIVATE_MEETING', communityUrl: 'https://private.example.test/invite/PRIVATE_INVITATION', arbitraryField: 'PRIVATE_UNKNOWN_FIELD' }, sections: [{ title: 'Existing original chapter', body: 'PRIVATE_EXISTING_MANUSCRIPT_TEXT' }] };
const defaultDetails = resolveBuilderAgentScope({ message: 'Can you fill the fields for me?', context: bookContext });
assert.equal(defaultDetails.target, 'details', 'Unqualified requests start with product details rather than an outline');
assert.equal(defaultDetails.allowSections, false, 'A default detail request cannot add manuscript chapters');
const defaultRequest = {requestId: randomUUID(), message: 'Can you fill the fields for me?', context: bookContext, expectedUpdatedAt: 0, maxCredits: 0};
assert.equal(builderAgentRequestSchema.parse(defaultRequest).target, 'details', 'The actual request schema defaults to details');
for (const fieldKeys of [['meetingUrl'], ['communityUrl'], ['priceCents'], ['subtitle', 'subtitle']]) assert.equal(builderAgentRequestSchema.safeParse({...defaultRequest, fieldKeys}).success, false, 'Clients cannot request private, operational, or duplicate AI editing fields');
const subtitleScope = resolveBuilderAgentScope({ target: 'outline', message: 'Enhance The essentials and The shape of your book, especially the Subtitle.', context: bookContext });
assert.equal(subtitleScope.target, 'details', 'A field request overrides the old persisted outline mode');
assert.equal(subtitleScope.allowSections, false);
assert.ok(subtitleScope.fieldKeys.includes('subtitle'));
const singleSubtitle = resolveBuilderAgentScope({ target: 'details', message: 'Polish this subtitle only.', fieldKeys: ['subtitle'], context: bookContext });
assert.deepEqual(singleSubtitle.fieldKeys, ['subtitle']);
for (const message of ['Refine my illustrator guide description and preserve the Reader handoff title.', 'Improve product description; preserve product title and the audience.', 'Keep the title and the audience; improve the product description.']) {
  const scope = resolveBuilderAgentScope({target: 'refine', message, context: bookContext});
  assert.equal(scope.target, 'details');
  assert.deepEqual(scope.fieldKeys, ['description'], 'Natural product-description requests work without expanding edits to preserved fields');
}
for (const message of ['Enhance the essentials but preserve the title.', 'Improve the product title but preserve the product title.']) assert.equal(resolveBuilderAgentScope({target: 'details', message, context: bookContext}).fieldKeys.includes('title'), false, 'Broad groups and earlier edit instructions cannot reopen an explicitly preserved title');
const fieldFixture = { answer: 'Here is a subtitle that supports the existing product promise.', questions: null, suggestion: { summary: 'Clarify the subtitle without rewriting the manuscript.', title: null, description: null, audience: null, fields: { subtitle: 'Fourteen small steps toward steadier days', bookPremise: null, readerLevel: ' ' }, sections: null } };
const parsedFields = parseBuilderAgentResponse(fieldFixture);
assert.equal(parsedFields.success, true);
assert.deepEqual(parsedFields.data.suggestion, { summary: fieldFixture.suggestion.summary, fields: { subtitle: fieldFixture.suggestion.fields.subtitle } }, 'Nullable or blank unchanged detail fields never become destructive edits');
assert.deepEqual(fieldFixture.suggestion.fields.bookPremise, null, 'Field normalization preserves the provider object');
const leakedOutline = parseBuilderAgentResponse({ answer: 'Only the requested subtitle may be applied.', questions: [], suggestion: { summary: 'Polish the subtitle.', title: 'UNREQUESTED_TITLE', fields: { subtitle: 'A practical reset, one day at a time', bookPremise: 'UNREQUESTED_PREMISE' }, sections: [{ title: 'UNREQUESTED_CHAPTER', body: 'Do not insert this chapter.' }] } });
assert.equal(leakedOutline.success, true);
const scopedSubtitle = scopeBuilderAgentResponse(leakedOutline.data, singleSubtitle);
assert.deepEqual(scopedSubtitle.suggestion, { summary: 'Polish the subtitle.', fields: { subtitle: 'A practical reset, one day at a time' } }, 'Server-side scope removes unrequested metadata, chapters and private delivery fields even if the model ignores its prompt');
for (const field of ['meetingUrl', 'communityUrl', 'arbitraryField']) assert.equal(parseBuilderAgentResponse({ answer: 'Unsafe operational fields must be rejected.', suggestion: { summary: 'Invalid proposed field.', fields: { [field]: 'PRIVATE_UNSUPPORTED_VALUE' } } }).success, false, `${field} cannot become an AI-editable field`);
const onlyOutline = parseBuilderAgentResponse({ answer: 'This is an unsolicited outline.', suggestion: { summary: 'Insert chapters.', sections: [{ title: 'UNREQUESTED_CHAPTER', body: 'Do not insert this chapter.' }] } });
assert.equal(scopeBuilderAgentResponse(onlyOutline.data, singleSubtitle), null, 'An outline-only response cannot become an applicable field edit');
const detailsWire = JSON.stringify(zodToJsonSchema(makeBuilderAgentResponseWireSchema(singleSubtitle)));
assert.ok(detailsWire.includes('subtitle'));
assert.equal(detailsWire.includes('"sections":'), false, 'The model response contract for detail editing does not offer manuscript sections');
for (const [builderType, type, permitted] of [
  ['book', 'Book', ['subtitle', 'bookPremise', 'readerLevel']],
  ['guide', 'Guide', ['startingPoint', 'runningExample']],
  ['playbook', 'Playbook', ['trigger', 'requiredInputs', 'definitionOfDone']],
  ['challenge', 'Challenge', ['dailyTime', 'completionCriteria']],
  ['template-kit', 'Template kit', ['compatibleTools', 'usageInstructions']],
  ['consulting', 'Consulting / Mentorship', ['serviceScope', 'preparation', 'intakePrompt']],
  ['coaching', 'Coaching session', ['serviceScope', 'preparation', 'intakePrompt']],
  ['community', 'Community', ['memberPromise', 'welcome', 'rules']],
]) {
  const keys = builderAgentFieldKeysForContext({ ...bookContext, builderType, type }, 'type-details');
  for (const field of permitted) assert.ok(keys.includes(field), `${builderType} supports its own ${field} field`);
  for (const field of ['meetingUrl', 'communityUrl', 'priceCents', 'uploadIds', 'arbitraryField']) assert.equal(keys.includes(field), false, `${builderType} cannot expose private or operational ${field} fields to AI`);
  if (builderType !== 'book') assert.equal(keys.includes('subtitle'), false, `${builderType} cannot inherit book-only fields`);
}
for (const builderType of ['book', 'guide', 'playbook', 'mini-course', 'video-course', 'template-kit', 'challenge', 'consulting', 'coaching', 'community', 'custom']) {
  const keys = builderAgentFieldKeysForContext({...bookContext, builderType}, 'essentials');
  for (const field of ['title', 'description', 'audience', 'outcome', 'tone']) assert.ok(keys.includes(field), `${builderType} exposes its common ${field} detail`);
  for (const field of ['sections', 'meetingUrl', 'communityUrl', 'uploadIds', 'priceCents', 'customDelivery']) assert.equal(keys.includes(field), false, `${builderType} essentials cannot edit operational ${field}`);
}
for (const [deliveryFamily, expected] of [['service', 'serviceScope'], ['community', 'memberPromise']]) {
  const keys = builderAgentFieldKeysForContext({...bookContext, builderType: 'custom', type: 'Custom product', deliveryFamily}, 'type-details');
  assert.ok(keys.includes(expected), `Custom ${deliveryFamily} details use the matching delivery field catalog`);
  assert.equal(keys.includes('subtitle'), false, 'Custom delivery cannot inherit unrelated book-only fields');
}
for (const fields of [{ subtitle: 'A'.repeat(1501) }, { subtitle: 'A'.repeat(1400), bookPremise: 'B'.repeat(1400), readerLevel: 'C'.repeat(1400) }]) {
  assert.equal(parseBuilderAgentResponse({ answer: 'Large manuscripts belong in full generation.', suggestion: { summary: 'Oversized field edit.', fields } }).success, false, 'Detail fields cannot bypass bounded planning content limits');
}
for (const suggestion of [{title: 'A'.repeat(101)}, {audience: 'A'.repeat(301)}, {sections: [{title: 'A'.repeat(151), body: 'A concise section objective.'}]}]) assert.equal(parseBuilderAgentResponse({answer: 'Proposed values must fit the saved builder fields.', suggestion: {summary: 'Over the builder field limit.', ...suggestion}}).success, false, 'AI cannot propose an edit that the actual builder cannot save');
assert.equal(parseBuilderAgentResponse({answer: 'Boundary values remain supported.', suggestion: {summary: 'Within the actual builder limits.', title: 'A'.repeat(100), audience: 'A'.repeat(300), sections: [{title: 'A'.repeat(150), body: 'A concise section objective.'}]}}).success, true);
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
  assert.ok(lastSchema?.properties?.answer, 'Provider requests include the explicit answer shape');
  assert.equal(lastSchema?.properties?.suggestion?.anyOf?.find(value => value.type === 'object')?.required?.includes('title'), false, 'Unchanged title is optional in the normal JSON-schema contract');
  const first = state;
  assert.equal(sql.prepare('SELECT content FROM products WHERE id=?').get(productId).content, initialContent, 'Assistant suggestions never mutate the product');
  await ok(await post(input)); assert.equal(calls, 1, 'Replay returns persisted response without another AI call');
  await ok(await post({ ...input, message: 'Change input using the same request ID' }), 409);
  await ok(await post({ ...input, requestId: randomUUID() }), 409);
  owner = 'outside-workspace'; await ok(await read(), 404); await ok(await post(input), 404); owner = 'builder-assistant-fixture';
  await ok(await route.POST(request({ ...input, requestId: randomUUID() }, 'https://outsider.example'), params), 403);
  const period = new Date().toISOString().slice(0, 7);
  for (let i = 0; i < 19; i++) sql.prepare("INSERT INTO studio_plan_turns (id,owner,conversation_id,prompt,period,mode,state,created_at) VALUES (?,?,?,?,?,'included','completed',?)").run(randomUUID(), owner, 'other-conversation', 'Quota fixture', period, now);
  // Planning messages and the monthly free credit pool are separate allowances.
  // Exhaust the existing current-month wallet before testing paid-turn consent,
  // insufficient funds and deductions/refunds from purchased credits below.
  sql.prepare('UPDATE wallets SET starter=0,purchased=0 WHERE owner=?').run(owner);
  assert.equal((await dependencies.creditBalance(owner)).total, 0, 'The empty-wallet fixture must exhaust the monthly free pool as well as purchased credits');
  const paid = { ...input, requestId: randomUUID(), expectedUpdatedAt: first.conversation.updatedAt, message: 'Refine the product description for beginners.', target: 'refine' };
  await ok(await post(paid), 402); assert.equal(calls, 1, 'No provider call before explicit credit approval');
  await ok(await post({ ...paid, requestId: randomUUID(), target: 'details', detailsGroup: 'type-details', fieldKeys: ['subtitle'], context: bookContext, message: 'Fill the subtitle.' }), 402); assert.equal(calls, 1, 'Field editing uses the same exhausted allowance and cannot bypass explicit credit consent');
  await ok(await post({ ...paid, requestId: randomUUID(), maxCredits: 10 }), 402); assert.equal(calls, 1, 'No provider call when wallet is empty');
  sql.prepare('UPDATE wallets SET purchased=100 WHERE owner=?').run(owner);
  failureMode = 'nullable';
  state = await ok(await post({ ...paid, requestId: randomUUID(), maxCredits: 10 })); assert.equal(state.spent, 10); assert.equal((await dependencies.creditBalance(owner)).purchased, 90);
  assert.equal(state.conversation.messages.at(-1).suggestion.description, 'A practical handoff process for independent illustrators.', 'A normalized valid answer completes the paid turn instead of discarding the response');
  failureMode = '';
  assert.equal(lastInput.target, 'details'); assert.deepEqual(lastInput.conversation, [], 'A metadata refinement excludes the earlier outline interview');
  failureMode = 'provider'; await ok(await post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 10 }), 502); assert.equal((await dependencies.creditBalance(owner)).purchased, 90, 'Provider failure refunds the actual credit ledger');
  failureMode = 'oversized'; await ok(await post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 10 }), 502); assert.equal((await dependencies.creditBalance(owner)).purchased, 90, 'Full content cannot be generated through planning; oversized output is rejected and refunded');
  failureMode = ''; held = new Promise(done => { release = done; });
  const active = post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 10 });
  await new Promise(done => setTimeout(done, 25)); await ok(await post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 10 }), 409); release(); state = await ok(await active); held = null;
  assert.equal((await dependencies.creditBalance(owner)).purchased, 80, 'Only completed requests spend credits');
  failureMode='lease-race';const lostLeaseRequest={...paid,requestId:randomUUID(),expectedUpdatedAt:state.conversation.updatedAt,maxCredits:10};await ok(await post(lostLeaseRequest),409);assert.equal((await dependencies.creditBalance(owner)).purchased,80,'A lost conversation lease refunds the actual reserved credit ledger');assert.equal(sql.prepare('SELECT state FROM credit_usage WHERE id=?').get(lostLeaseRequest.requestId).state,'refunded');assert.equal(sql.prepare('SELECT state FROM studio_plan_turns WHERE id=?').get(lostLeaseRequest.requestId).state,'failed');assert.equal(sql.prepare('SELECT COUNT(*) n FROM creator_context_proposals WHERE message_id=?').get(lostLeaseRequest.requestId+'-answer').n,0);sql.prepare('UPDATE studio_conversations SET lease=0 WHERE product_id=? AND owner=?').run(productId,owner);failureMode='';
  const restored = await ok(await read()); assert.deepEqual(restored.conversation, state.conversation, 'Chat and suggestions survive reload');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM ai_product_runs WHERE owner=?').get(owner).n, 0, 'Planning does not create complete-product runs');
  customResponse = { answer: 'An unsolicited manuscript outline must not be applied.', questions: [], suggestion: { summary: 'An outline instead of requested fields.', sections: [{ title: 'UNREQUESTED_CHAPTER', body: 'This is outside the requested field scope.' }] } };
  await ok(await post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 10, target: 'details', fieldKeys: ['subtitle'], context: bookContext, message: 'Fill only the subtitle.' }), 502);
  assert.equal((await dependencies.creditBalance(owner)).purchased, 80, 'A paid field request that returns only chapters is rejected and refunded');
  assert.deepEqual((await ok(await read())).conversation, state.conversation, 'Rejected unsolicited chapters cannot replace the conversation');
  customResponse = null;
  sql.prepare('INSERT INTO terms_acceptances VALUES (?,?,?,?,?)').run(randomUUID(), owner, 'fixture', 'kamzewac@gmail.com', Date.now());
  state = await ok(await post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 0 })); assert.equal(state.spent, 0); assert.equal((await dependencies.creditBalance(owner)).purchased, 80, 'Verified unlimited owner access preserves wallet balance');
  failureMode = 'nullable'; state = await ok(await post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 0 }));
  assert.deepEqual(state.conversation.messages.at(-1).questions, []);
  assert.deepEqual(state.conversation.messages.at(-1).suggestion, { summary: 'Clarify the intended audience in the description.', description: 'A practical handoff process for independent illustrators.' }, 'Nullable unchanged provider fields survive the full route without becoming destructive edits');
  failureMode = 'discussion'; state = await ok(await post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 0 }));
  assert.equal(state.conversation.messages.at(-1).suggestion, null, 'An empty suggestion does not discard a useful discussion answer');
  failureMode = 'malformed'; await ok(await post({ ...paid, requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 0 }), 502);
  assert.deepEqual((await ok(await read())).conversation, state.conversation, 'Malformed edits cannot replace the last valid conversation');
  assert.equal(sql.prepare('SELECT content FROM products WHERE id=?').get(productId).content, initialContent, 'All normalization and rejection paths leave product content untouched');
  assert.equal((await dependencies.creditBalance(owner)).purchased, 80, 'Regression scenarios preserve the owner credit exemption');
  const legacyMessages = structuredClone(state.conversation.messages);
  customResponse = { answer: 'I have proposed a supporting subtitle for your existing book. Review it before applying.', questions: [], suggestion: { summary: 'Clarify the subtitle and preserve the manuscript.', title: 'UNREQUESTED_RENAMING', fields: { subtitle: 'Fourteen small steps toward steadier days', bookPremise: 'UNREQUESTED_PREMISE' }, sections: [{ title: 'UNREQUESTED_CHAPTER', body: 'Never add this chapter while filling details.' }] } };
  state = await ok(await post({ requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 0, target: 'outline', fieldKeys: ['subtitle'], context: bookContext, message: 'Enhance the Subtitle in The shape of your book. Fill only this field.' }));
  assert.equal(lastInput.target, 'details', 'An explicit field request overrides legacy saved outline mode at the route boundary');
  assert.deepEqual(state.conversation.messages.at(-1).suggestion, { summary: customResponse.suggestion.summary, fields: { subtitle: customResponse.suggestion.fields.subtitle } }, 'Only the specifically requested field survives provider overreach');
  assert.equal(JSON.stringify(lastInput).includes('PRIVATE_MEETING'), false);
  assert.equal(JSON.stringify(lastInput).includes('PRIVATE_INVITATION'), false);
  assert.equal(JSON.stringify(lastInput).includes('PRIVATE_UNKNOWN_FIELD'), false);
  assert.equal(JSON.stringify(lastInput).includes('PRIVATE_EXISTING_MANUSCRIPT_TEXT'), false, 'Detail requests do not share the manuscript with the model');
  assert.equal(JSON.stringify(lastInput).includes('Prepare the brief'), false, 'Past outline proposals cannot pull the current field request back into manuscript editing');
  assert.equal(JSON.stringify(lastInput).includes('What experience should the reader already have?'), false, 'Old outline questions cannot be repeated as the current field task');
  assert.deepEqual(state.conversation.messages.slice(0, legacyMessages.length), legacyMessages, 'Saved historical suggestions are retained exactly; the fix never rewrites or auto-applies old turns');
  assert.equal(sql.prepare('SELECT content FROM products WHERE id=?').get(productId).content, initialContent, 'Even an accepted details suggestion leaves the saved product unchanged until Apply');
  customResponse = { answer: 'Here are the three book-shape fields you requested.', questions: [], suggestion: { summary: 'Define the book promise and reader level.', fields: { subtitle: 'Small steps after a difficult ending', bookPremise: 'A self-paced reflection workbook grounded in manageable daily actions.', readerLevel: 'No prior journaling experience needed', dailyTime: 'UNREQUESTED_CHALLENGE_FIELD', outcome: 'UNREQUESTED_ESSENTIAL_FIELD' } } };
  state = await ok(await post({ requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 0, target: 'details', detailsGroup: 'type-details', context: bookContext, message: 'Fill the shape of this book.' }));
  assert.deepEqual(state.conversation.messages.at(-1).suggestion.fields, { subtitle: customResponse.suggestion.fields.subtitle, bookPremise: customResponse.suggestion.fields.bookPremise, readerLevel: customResponse.suggestion.fields.readerLevel }, 'Type-detail edits cannot leak challenge-only or essentials fields into the book-shape card');
  assert.equal(sql.prepare('SELECT content FROM products WHERE id=?').get(productId).content, initialContent);
  customResponse = {answer: 'The outline already covers the handoff journey. One decision would clarify the final deliverable.', questions: ['What experience should the reader already have?', 'Should the final handoff include a client checklist?', 'Will the reader work alone?'], suggestion: null};
  state = await ok(await post({requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 0, target: 'outline', context, message: 'Review the outline structure and ask only if essential.'}));
  assert.deepEqual(state.conversation.messages.at(-1).questions, ['Should the final handoff include a client checklist?'], 'An editor asks at most one new clarification and does not restart an earlier interview');
  customResponse = {...customResponse, questions: ['SHOULD the final handoff include a client checklist?!']};
  state = await ok(await post({requestId: randomUUID(), expectedUpdatedAt: state.conversation.updatedAt, maxCredits: 0, target: 'outline', context, message: 'Continue reviewing the outline with the information already supplied.'}));
  assert.deepEqual(state.conversation.messages.at(-1).questions, [], 'Case and punctuation changes cannot reintroduce the same repeated question');
  const refineSection={id:randomUUID(),title:'A stable original chapter',body:'PRIVATE_PREFIX Selected original passage. PRIVATE_SUFFIX'},refinement={sectionId:refineSection.id,originalTitle:refineSection.title,originalText:'Selected original passage.'};
  sql.prepare('INSERT INTO product_builder_workspaces (product_id,owner,version,data,updated_at) VALUES (?,?,1,?,?)').run(productId,owner,JSON.stringify({sections:[refineSection]}),Date.now());
  const refineRequest={requestId:randomUUID(),expectedUpdatedAt:state.conversation.updatedAt,maxCredits:0,target:'refine',context:{...context,sections:[refineSection,{id:randomUUID(),title:'Other private chapter',body:'UNSELECTED_PRIVATE_MANUSCRIPT'}]},message:'Make this selected passage clearer without adding new claims.'};
  const beforeRefinementCalls=calls;assert.equal((await post(refineRequest)).status,400,'Unscoped refinement is rejected before provider or credit use');assert.equal(calls,beforeRefinementCalls);
  assert.equal((await post({...refineRequest,requestId:randomUUID(),refinement:{...refinement,originalText:'Stale original excerpt.'}})).status,409);assert.equal(calls,beforeRefinementCalls,'Stale original text is rejected before charging');
  customResponse={answer:'This revision makes the selected passage more direct.',questions:[],suggestion:{summary:'Clarify the selected passage.',sections:[{title:refineSection.title,body:'A clearer replacement passage.'}]}};
  state=await ok(await post({...refineRequest,requestId:randomUUID(),refinement}));assert.deepEqual(state.conversation.messages.at(-1).refinement,refinement,'The trusted request scope accompanies the persisted proposal');assert.equal(lastInput.product.sections.length,1);assert.equal(lastInput.product.sections[0].body,refinement.originalText);assert.equal(JSON.stringify(lastInput).includes('UNSELECTED_PRIVATE_MANUSCRIPT'),false);assert.equal(JSON.stringify(lastInput).includes('PRIVATE_PREFIX'),false,'Only the selected excerpt reaches the provider');assert.match(JSON.stringify(lastSchema),/\"maxItems\":1(?:,|})/,'The refinement schema permits one replacement passage');
  customResponse={...customResponse,suggestion:{...customResponse.suggestion,sections:[...customResponse.suggestion.sections,...customResponse.suggestion.sections]}};const tooBroad=await post({...refineRequest,requestId:randomUUID(),expectedUpdatedAt:state.conversation.updatedAt,refinement});assert.equal(tooBroad.status,502,'A multi-chapter refinement is rejected and refunded');assert.equal((await ok(await read())).conversation.updatedAt,state.conversation.updatedAt);
  const legacyRequest = {requestId: randomUUID(), message: 'Can you fill the fields for me?', context, expectedUpdatedAt: 0, maxCredits: 0};
  sql.prepare("INSERT INTO studio_plan_turns (id,owner,conversation_id,prompt,period,mode,state,response,created_at) VALUES (?,?,?,?,?,'included','completed',?,?)").run(legacyRequest.requestId, owner, `builder:${productId}`, JSON.stringify({message: legacyRequest.message, context, target: 'outline'}), period, JSON.stringify(first), now);
  const callsBeforeLegacyReplay = calls;
  assert.deepEqual(await ok(await post(legacyRequest)), first, 'A lost response from a pre-fix client with an omitted target still replays the exact persisted success');
  assert.equal(calls, callsBeforeLegacyReplay, 'Changing the default target cannot cause duplicate provider calls or a second charge for historical requests');
  assert.equal((await dependencies.creditBalance(owner)).purchased, 80);
  assert.deepEqual((await ok(await read())).conversation, state.conversation, 'Legacy replay never rewinds the current saved chat');
  console.log('Passed: field-first defaults and legacy outline override; book essentials/type fields; per-type allowlists and bounded nullable fields; blocked unsolicited chapters and private delivery fields; manuscript/private-context exclusion; unchanged historical messages/product until Apply; ownership, origin, idempotency, concurrency, shared allowance, explicit credit consent, debit/refunds, provider errors and unlimited owner access. No external provider calls.');
  console.log('QA fixtures retained: ' + root);
} finally { storage.close(); }
