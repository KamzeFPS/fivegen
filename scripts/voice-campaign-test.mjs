import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createStorage } from '../runtime/render/storage.mjs';
import { textCredits } from '../lib/credit-policy.ts';

const root = resolve('outputs/voice-campaign-qa', randomUUID()), storage = createStorage(root);
let owner = 'creator-owner', calls = 0, fail = false, invalid = false, invented = false, hold, lastPrompt, lastSystem, unlimited = false, transcriptionAvailable = true;
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const deps = {
  z, zodToJsonSchema, ApiError, textCredits, database: () => storage.DB, env: { BUCKET: storage.BUCKET },
  binding: () => '', providerKey: async () => 'fixture-key',
  identity: async () => { if (!owner) throw new ApiError('Sign in', 401); return { userId: owner }; },
  sameOrigin: request => { if (request.headers.has('origin') && request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('Invalid origin', 403); },
  failure: error => { if (!error.status && !error.issues) console.error(error.message); return Response.json({ error: error.message }, { status: error.status || (error.issues ? 400 : 500) }); },
  ownedProduct: async (id, account) => { const row = await storage.DB.prepare('SELECT * FROM products WHERE id=? AND owner=?').bind(id, account).first(); if (!row) throw new ApiError('Product not found.', 404); return row; },
  providerSettings: async () => ({ connected: { openai: transcriptionAvailable }, config: { textProvider: 'openai', paused: false } }),
  textGeneration: async (_owner, system, prompt, _tokens, schema) => {
    calls++; lastSystem = system; lastPrompt = JSON.parse(prompt); assert.equal(schema, undefined, 'Campaign results use JSON-object mode and are validated with Zod before saving.');
    if (hold) await hold;
    if (fail) throw new ApiError('Provider failed', 502);
    return { items: (invalid ? ['social'] : ['social', 'short_video', 'email']).map(channel => ({ channel, title: 'An honest launch draft', body: 'I learned this process in my own studio. Request workshop details.', subject: channel === 'email' ? 'Your workshop invitation' : '', sourceIds: [invented ? randomUUID() : lastPrompt.sources[0].id] })) };
  },
  hasUnlimitedGeneration: async () => unlimited,
  productAllowance: async () => ({ remaining: 3 }), subscriptionCreditBalance: async () => ({ included: 0 }),
  spendableGrant: () => 'g.remaining>0', mcpCreditLimit: { getStore: () => null },
};
async function load(path) {
  const key = 'voiceqa' + randomUUID().replaceAll('-', ''); globalThis[key] = { ...deps };
  const source = fs.readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(deps).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); delete globalThis[key]; return module;
}
Object.assign(deps, await load('lib/creator-context-contract.ts'));
Object.assign(deps,await load('lib/marketing-destination.ts'));
deps.listMarketingDestinations=async()=>[];deps.resolveMarketingDestination=async()=>{throw new ApiError('No fixture destination',409);};deps.destinationGuard=()=>({sql:'',values:[]});
Object.assign(deps, await load('lib/creator-voice.ts'), await load('lib/campaign.ts'), await load('lib/growth.ts'));
Object.assign(deps, await load('lib/credits.ts'));
Object.assign(deps, await load('lib/campaign-run.ts'));
Object.assign(deps, await load('lib/creator-voice-server.ts'));
Object.assign(deps, await load('lib/creator-context-server.ts'),await load('lib/marketing-versions-server.ts'));
Object.assign(deps, await load('lib/growth-server.ts'));
Object.assign(deps, await load('lib/campaign-server.ts'));
const libraryRoute = await load('app/api/voice/route.ts'), sourceRoute = await load('app/api/voice/[id]/route.ts'), transcriptRoute = await load('app/api/voice/[id]/transcribe/route.ts'), campaignRoute = await load('app/api/products/[id]/campaigns/route.ts'), generateRoute = await load('app/api/products/[id]/campaigns/generate/route.ts');
const productId = randomUUID(), otherId = randomUUID(), brief = { icp: 'Independent illustrators', problem: 'Client handoffs take too long', beliefs: 'Processes must be complicated', story: 'I simplified my own studio', promise: 'A repeatable process, no financial guarantee', proof: 'No proof yet', offer: 'My workshop and checklist', tone: 'Plain spoken and warm', cta: 'Request details' };
for (const [id, account] of [[productId, owner], [otherId, 'another-owner']]) storage.sqlite.prepare("INSERT INTO products (id,owner,slug,title,description,audience,format,color,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'orange',?,1,1)").run(id, account, id, 'Illustration workshop', 'Creator-led workshop.', 'Illustrators', 'Video course', JSON.stringify({ sections: [], benefits: [], launch: '' }));
storage.sqlite.prepare('INSERT INTO wallets (owner,purchased) VALUES (?,200)').run(owner);
storage.sqlite.prepare('INSERT INTO growth_workspaces (product_id,owner,brief,updated_at) VALUES (?,?,?,1)').run(productId, owner, JSON.stringify(brief));
const body = (url, value, method = 'POST', headers = {}) => new Request('http://localhost' + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });
const params = id => ({ params: Promise.resolve({ id }) }), campaignUrl = `/api/products/${productId}/campaigns`;
const getCampaign = async () => (await (await campaignRoute.GET(new Request('http://localhost' + campaignUrl), params(productId))).json()).campaign;
const saveCampaign = value => campaignRoute.PATCH(body(campaignUrl, { ...value, expectedUpdatedAt: value.updatedAt }, 'PATCH'), params(productId));
const generate = value => generateRoute.POST(body(campaignUrl + '/generate', value), params(productId));
const balance = () => storage.sqlite.prepare('SELECT purchased FROM wallets WHERE owner=?').get('creator-owner').purchased;
const sourceInput = { productId, title: 'My real studio story', kind: 'story', transcript: 'I learned to keep my handoff simple after a confusing first client project.', evidence: 'My own experience, not a promise of customer outcomes.', uploadId: null, permission: true, approved: true, expectedUpdatedAt: 0 };
let originalFetch = globalThis.fetch;
try {
  owner = ''; assert.equal((await libraryRoute.GET()).status, 401); owner = 'creator-owner';
  assert.equal((await libraryRoute.POST(body('/api/voice', sourceInput, 'POST', { Origin: 'https://attacker.test' }))).status, 403);
  assert.equal((await libraryRoute.POST(body('/api/voice', { ...sourceInput, productId: otherId }))).status, 404);
  assert.equal((await libraryRoute.POST(body('/api/voice', { ...sourceInput, permission: false }))).status, 400, 'No approved processing without permission');
  assert.equal((await libraryRoute.POST(body('/api/voice', { ...sourceInput, kind: 'result', evidence: '' }))).status, 400, 'Results require provenance and allowed-use context');
  let response = await libraryRoute.POST(body('/api/voice', sourceInput)); assert.equal(response.status, 201); let source = (await response.json()).source;
  owner = 'another-owner'; assert.equal((await sourceRoute.GET(new Request('http://localhost/api/voice/' + source.id), params(source.id))).status, 404); assert.equal((await (await libraryRoute.GET()).json()).sources.length, 0); owner = 'creator-owner';
  assert.equal((await sourceRoute.PATCH(body('/api/voice/' + source.id, sourceInput, 'PATCH'), params(source.id))).status, 409, 'Stale source cannot overwrite edits');
  owner = 'another-owner'; assert.equal((await campaignRoute.GET(new Request('http://localhost' + campaignUrl), params(productId))).status, 404); owner = 'creator-owner';
  assert.equal((await campaignRoute.PATCH(body(campaignUrl, {}, 'PATCH', { Origin: 'https://attacker.test' }), params(productId))).status, 403);
  await deps.saveCreatorSelection(owner,productId,{useProfile:false,sourceIds:[source.id],expectedUpdatedAt:0});
  let campaign = await getCampaign(); campaign = { ...campaign, goal: 'Invite illustrators to request workshop details', sourceIds: [source.id] };
  response = await saveCampaign(campaign); assert.equal(response.status, 200); campaign = (await response.json()).campaign;
  assert.equal((await saveCampaign({ ...campaign, updatedAt: 0 })).status, 409);
  let input = { expectedUpdatedAt: campaign.updatedAt, requestId: randomUUID(), maxCredits: 0 };
  assert.equal((await generate(input)).status, 402); assert.equal(calls, 0); assert.equal(balance(), 200);
  input.maxCredits = 10; response = await generate(input); assert.equal(response.status, 200); const first = await response.json(); assert.equal(first.spent, 10); assert.equal(balance(), 190);
  assert.match(lastSystem, /Never invent/); assert.match(lastSystem, /untrusted source material/); assert.equal(lastPrompt.sources[0].id, source.id); assert.equal(lastPrompt.sources[0].transcript, source.transcript); assert.deepEqual(lastPrompt.brief, brief);
  assert.deepEqual(await (await generate(input)).json(), first); assert.equal(calls, 1); assert.equal(balance(), 190, 'Idempotent retry never charges twice');
  campaign = await getCampaign(); assert.equal(campaign.items.length, 3); assert.ok(campaign.items.every(item => item.status === 'draft')); assert.equal(campaign.sourceRevisions[0].updatedAt, source.updatedAt);
  for (const failure of ['provider', 'schema', 'citation']) {
    fail = failure === 'provider'; invalid = failure === 'schema'; invented = failure === 'citation';
    response = await generate({ expectedUpdatedAt: campaign.updatedAt, requestId: randomUUID(), maxCredits: 10 }); assert.equal(response.status, 502); assert.equal(balance(), 190, failure + ' failure refunds');
  }
  fail = false; invalid = false; invented = false;
  let release; hold = new Promise(done => { release = done; }); const pendingId = randomUUID();
  const pending = generate({ expectedUpdatedAt: campaign.updatedAt, requestId: pendingId, maxCredits: 10 });
  while (storage.sqlite.prepare('SELECT state FROM creator_ai_runs WHERE id=?').get(pendingId)?.state !== 'pending') await new Promise(done => setTimeout(done, 5));
  assert.equal((await saveCampaign({ ...campaign, goal: 'Overwritten while generating' })).status, 409);
  assert.equal((await generate({ expectedUpdatedAt: campaign.updatedAt, requestId: randomUUID(), maxCredits: 10 })).status, 409);
  response = await sourceRoute.PATCH(body('/api/voice/' + source.id, { ...sourceInput, transcript: 'An updated real story, with more context.', expectedUpdatedAt: source.updatedAt }, 'PATCH'), params(source.id)); assert.equal(response.status, 200); source = (await response.json()).source;
  release(); response = await pending; hold = null; assert.equal(response.status, 409, 'Source editing during a run invalidates its evidence snapshot'); assert.equal(balance(), 190);
  campaign = await getCampaign(); const oldItems = campaign.items;
  response = await saveCampaign({ ...campaign, items: campaign.items.map(item => ({ ...item, status: 'approved' })) }); assert.equal(response.status, 409, 'Changed citations block approval');
  response = await saveCampaign(campaign); assert.equal(response.status, 200); campaign = (await response.json()).campaign; assert.equal(campaign.sourceRevisions[0].updatedAt, source.updatedAt, 'Saving reviewed drafts refreshes source revisions');
  response = await saveCampaign({ ...campaign, items: campaign.items.map(item => ({ ...item, status: 'approved' })) }); assert.equal(response.status, 200); campaign = (await response.json()).campaign;
  response = await saveCampaign({ ...campaign, items: campaign.items.map(item => ({ ...item, body: 'Changed after approval' })) }); assert.equal(response.status, 409, 'Copy changes require renewed review');
  response = await saveCampaign({ ...campaign, items: campaign.items.map(item => ({ ...item, status: 'scheduled', scheduledAt: Date.now() - 1000 })) }); assert.equal(response.status, 400);
  response = await saveCampaign({ ...campaign, items: campaign.items.map(item => ({ ...item, status: 'scheduled', scheduledAt: Date.now() + 86400000 })) }); assert.equal(response.status, 200); campaign = (await response.json()).campaign;
  response = await sourceRoute.DELETE(body('/api/voice/' + source.id, { expectedUpdatedAt: source.updatedAt }, 'DELETE'), params(source.id)); assert.equal(response.status, 200);
  assert.equal((await deps.creatorVoiceContext(owner)).length, 0, 'Deleted source is removed from future growth context');
  assert.equal((await saveCampaign(campaign)).status, 409, 'Removed evidence cannot retain approvals');
  assert.equal((await generate({ expectedUpdatedAt: campaign.updatedAt, requestId: randomUUID(), maxCredits: 10 })).status, 409); assert.equal(balance(), 190);
  response = await saveCampaign({ ...campaign, sourceIds: [], items: oldItems.map(item => ({ ...item, sourceIds: [], status: 'draft' })) }); assert.equal(response.status, 200); campaign = (await response.json()).campaign;
  const abandonedId = randomUUID(), oldTime = Date.now() - 181000;
  await deps.reserveCredits(owner, abandonedId, 'text', 10);
  storage.sqlite.prepare("INSERT INTO creator_ai_runs (id,owner,kind,target_id,expected_updated_at,state,cost,created_at) VALUES (?,?,'campaign',?,?,'pending',10,?)").run(abandonedId, owner, productId, campaign.updatedAt, oldTime);
  storage.sqlite.prepare('UPDATE marketing_campaigns SET lease=?,lease_id=? WHERE product_id=?').run(oldTime + 180000, abandonedId, productId);
  await getCampaign(); assert.equal(balance(), 190); assert.equal(storage.sqlite.prepare('SELECT state FROM creator_ai_runs WHERE id=?').get(abandonedId).state, 'failed'); await getCampaign(); assert.equal(balance(), 190);
  // Real private storage + mocked OpenAI transport, never a live provider call.
  const uploadId = randomUUID(), objectKey = 'voice-fixture/' + uploadId; await storage.BUCKET.put(objectKey, new Uint8Array([1, 2, 3]));
  storage.sqlite.prepare("INSERT INTO uploads (id,owner,product_id,name,mime,size,object_key,status,created_at) VALUES (?,?,?,?,?,?,?,'completed',1)").run(uploadId, owner, productId, 'my-note.mp3', 'audio/mpeg', 3, objectKey);
  response = await libraryRoute.POST(body('/api/voice', { ...sourceInput, kind: 'audio', title: 'Voice note', uploadId, transcript: '', approved: false })); assert.equal(response.status, 201); source = (await response.json()).source;
  let transcribeCalls = 0, transcriptionFail = false;
  globalThis.fetch = async (url, options) => { assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions'); assert.equal(options.headers.Authorization, 'Bearer fixture-key'); assert.equal(options.body.get('model'), 'gpt-4o-mini-transcribe'); assert.equal((await options.body.get('file').arrayBuffer()).byteLength, 3); transcribeCalls++; return Response.json(transcriptionFail ? { error: 'failed' } : { text: 'These are my own words from the fixture recording.' }, { status: transcriptionFail ? 502 : 200 }); };
  const transcribe = input => transcriptRoute.POST(body(`/api/voice/${source.id}/transcribe`, input), params(source.id));
  input = { expectedUpdatedAt: source.updatedAt, requestId: randomUUID(), maxCredits: 10 }; response = await transcribe(input); assert.equal(response.status, 200); const transcriptResult = await response.json(); assert.equal(balance(), 180); assert.equal(transcribeCalls, 1);
  response = await transcribe(input); assert.deepEqual(await response.json(), transcriptResult); assert.equal(transcribeCalls, 1);
  source = (await (await sourceRoute.GET(new Request('http://localhost/api/voice/' + source.id), params(source.id))).json()).source; assert.equal(source.approved, false, 'Machine transcript must be reviewed before AI context use'); assert.match(source.transcript, /own words/);
  transcriptionFail = true; response = await transcribe({ expectedUpdatedAt: source.updatedAt, requestId: randomUUID(), maxCredits: 10 }); assert.equal(response.status, 502); assert.equal(balance(), 180); transcriptionFail = false;
  storage.sqlite.prepare('UPDATE uploads SET size=? WHERE id=?').run(26 * 1024 * 1024, uploadId); response = await transcribe({ expectedUpdatedAt: source.updatedAt, requestId: randomUUID(), maxCredits: 10 }); assert.equal(response.status, 413); assert.equal(balance(), 180);
  console.log('Passed: voice ownership/permissions/evidence/revisions, campaign real credit ledger idempotency/refunds, structured output/citation validation, concurrent source invalidation, approval integrity, calendar validation, source deletion, crash recovery, private media and mocked OpenAI transcription. No real AI calls.');
  console.log('QA records retained: ' + root);
} finally { globalThis.fetch = originalFetch; storage.close(); }
