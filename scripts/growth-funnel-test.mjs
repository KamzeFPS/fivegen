import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import { createStorage } from '../runtime/render/storage.mjs';

const root = resolve('outputs/growth-funnel-qa', randomUUID()), storage = createStorage(root);
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
let owner = 'creator-a';
const automationEvents = [];
let failAutomationEnrollment = false;
const deps = {
  z, ApiError, database: () => storage.DB, env: { BUCKET: storage.BUCKET },
  identity: async () => { if (!owner) throw new ApiError('Sign in', 401); return { userId: owner }; },
  sameOrigin: request => { const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) throw new ApiError('Origin rejected', 403); },
  failure: error => Response.json({ error: error.message }, { status: error.status || 400 }),
  ownedProduct: async (id, user) => { const row = await storage.DB.prepare('SELECT * FROM products WHERE id=? AND owner=?').bind(id, user).first(); if (!row) throw new ApiError('Product not found', 404); return row; },
  enrollAutomationLead: async (productId, user, email) => {
    const persisted = storage.sqlite.prepare('SELECT * FROM growth_leads WHERE product_id=? AND owner=? AND email=?').get(productId, user, email);
    assert.ok(persisted, 'Automation enrollment happens only after the lead is durably stored');
    automationEvents.push({ productId, owner: user, email, marketing: persisted.marketing });
    if (failAutomationEnrollment) { failAutomationEnrollment = false; throw new Error('Fixture: worker will recover'); }
  },
};
async function load(path) {
  const key = 'test' + randomUUID().replaceAll('-', ''); globalThis[key] = { ...deps };
  const source = fs.readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(deps).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); delete globalThis[key]; return result;
}
Object.assign(deps, await load('lib/growth.ts'));
Object.assign(deps,await load('lib/marketing-versions-server.ts'));
Object.assign(deps, await load('lib/growth-server.ts'));
let afterGrowthRead = null;
const readGrowth = deps.getGrowth;
deps.getGrowth = async (...args) => { const result = await readGrowth(...args); if (afterGrowthRead) { const action = afterGrowthRead; afterGrowthRead = null; action(); } return result; };
Object.assign(deps, await load('lib/growth-funnel.ts'));
Object.assign(deps, await load('lib/growth-funnel-server.ts'));
const publication = await load('app/api/products/[id]/growth/publish/route.ts');
const capture = await load('app/api/growth/leads/route.ts');
const crm = await load('app/api/growth/crm/route.ts');
const video = await load('app/api/growth/video/[slug]/route.ts');
const base = 'https://fivegen.test';
function request(path, method = 'GET', body, headers = {}) { return new Request(base + path, { method, headers: { 'Content-Type': 'application/json', origin: base, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
const productId = randomUUID(), otherProduct = randomUUID(), videoId = randomUUID(), otherVideo = randomUUID();
const context = { params: Promise.resolve({ id: productId }) };
const videoContext = { params: Promise.resolve({ slug: 'growth-fixture' }) };
const landing = { headline: 'Your real customer outcome', subheadline: 'Learn with a creator', body: 'A real offer described in the creator’s own words.', benefits: ['A practical next step'], ctaLabel: 'Request details', thankYou: 'Thanks. Your request was recorded.' };
const assets = { vsl: 'PRIVATE VSL SCRIPT', landing, followUp: 'PRIVATE FOLLOWUP DRAFT' };
const brief = { icp: 'PRIVATE ICP', problem: '', beliefs: '', story: 'PRIVATE STORY', promise: '', proof: '', offer: '', tone: '', cta: '' };
function createProduct(id, user, slug) { storage.sqlite.prepare('INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,commerce,experience,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, user, slug, 'Creator offer', 'Private product description', 'Private audience', 'Guide', 0, 'orange', JSON.stringify({ sections: [{ title: 'PRIVATE COURSE', body: 'PRIVATE LESSON' }], benefits: [], launch: '' }), 'draft', '{}', '{}', Date.now(), Date.now()); }
function upload(id, product, user, key) { storage.sqlite.prepare("INSERT INTO uploads (id,owner,product_id,name,mime,size,object_key,status,created_at) VALUES (?,?,?,?,?,?,?,'completed',?)").run(id, user, product, 'recording.mp4', 'video/mp4', 6, key, Date.now()); }
const signup = (overrides = {}, headers) => capture.POST(request('/api/growth/leads', 'POST', { slug: 'growth-fixture', name: 'Alex', email: ' ALEX@example.com ', marketing: true, website: '', ...overrides }, headers));
try {
  createProduct(productId, owner, 'growth-fixture'); createProduct(otherProduct, 'creator-b', 'other-fixture');
  upload(videoId, productId, owner, 'own-vsl'); upload(otherVideo, otherProduct, 'creator-b', 'other-vsl');
  await storage.BUCKET.put('own-vsl', new TextEncoder().encode('012345')); await storage.BUCKET.put('other-vsl', new TextEncoder().encode('abcdef'));
  let growth = await deps.saveGrowth(productId, owner, { brief, assets, expectedUpdatedAt: 0 });
  const publish = (overrides = {}) => publication.POST(request(`/api/products/${productId}/growth/publish`, 'POST', { expectedUpdatedAt: 0, expectedGrowthUpdatedAt: growth.updatedAt, creatorVslUploadId: videoId, ...overrides }), context);
  assert.equal((await signup()).status, 404, 'Unpublished pages cannot capture leads');
  assert.equal((await video.GET(request('/api/growth/video/growth-fixture'), videoContext)).status, 404);
  owner = 'creator-b'; assert.equal((await publication.GET(request('/'), context)).status, 404); assert.equal((await publish()).status, 404); owner = 'creator-a';
  assert.equal((await publish({ creatorVslUploadId: otherVideo })).status, 409, 'Another creator’s video cannot be published');
  const saveVideo=(creatorVslUploadId,expectedUpdatedAt,headers)=>publication.PATCH(request(`/api/products/${productId}/growth/publish`,'PATCH',{creatorVslUploadId,expectedUpdatedAt},headers),context);
  owner='creator-b';assert.equal((await saveVideo(videoId,0)).status,404);owner='creator-a';
  assert.equal((await saveVideo(otherVideo,0)).status,409,'Private video drafts keep the same product/owner boundary as publication');
  const privateVoice=randomUUID();upload(privateVoice,productId,owner,'voice/private-recording');assert.equal((await saveVideo(privateVoice,0)).status,409,'Private voice recordings cannot become funnel media');
  assert.equal((await saveVideo(videoId,0,{origin:'https://attacker.test'})).status,403);
  let draftResponse=await saveVideo(videoId,0);assert.equal(draftResponse.status,200,await draftResponse.clone().text());let videoDraft=(await draftResponse.json()).videoDraft;
  assert.equal((await deps.getOwnedFunnelVideoDraft(productId,owner)).creatorVslUploadId,videoId);assert.equal(await deps.getOwnedFunnel(productId,owner),null,'Saving a private video draft does not create or publish a landing page');
  await assert.rejects(()=>deps.getPublicFunnel('growth-fixture'),error=>error.status===404);assert.equal((await video.GET(request('/api/growth/video/growth-fixture'),videoContext)).status,404,'A private draft video never opens the public media route');
  assert.equal((await saveVideo(null,0)).status,409,'Stale draft saves cannot overwrite the selection');

  let response = await publish(); assert.equal(response.status, 200, await response.clone().text()); let published = (await response.json()).funnel;
  let live = await deps.getPublicFunnel('growth-fixture'); assert.deepEqual(live.landing, landing); assert.ok(!JSON.stringify(live).includes('PRIVATE'));
  assert.equal((await publish()).status, 409, 'Stale publication revisions cannot overwrite a live page');
  draftResponse=await saveVideo(null,videoDraft.updatedAt);assert.equal(draftResponse.status,200);videoDraft=(await draftResponse.json()).videoDraft;assert.equal(videoDraft.creatorVslUploadId,null);
  assert.equal((await deps.getPublicFunnel('growth-fixture')).creatorVslUploadId,videoId,'Changing a saved private video selection never changes the public snapshot');
  const ownedResponse=await publication.GET(request('/'),context),ownedData=await ownedResponse.json();assert.deepEqual(ownedData.videoDraft,videoDraft);assert.ok(!('videoDraft' in await deps.getPublicFunnel('growth-fixture')),'Private draft metadata is never exposed by the public page getter');
  assert.equal((await publish({expectedUpdatedAt:published.updatedAt,expectedVideoDraftUpdatedAt:videoDraft.updatedAt-1})).status,409,'Explicit publication checks the reviewed video draft version');
  afterGrowthRead=()=>storage.sqlite.prepare('UPDATE growth_funnel_drafts SET updated_at=updated_at+1 WHERE product_id=?').run(productId);
  assert.equal((await publish({expectedUpdatedAt:published.updatedAt,expectedVideoDraftUpdatedAt:videoDraft.updatedAt})).status,409,'A video draft edit arriving between read and publication cannot bypass its version guard');

  response = await video.GET(request('/api/growth/video/growth-fixture', 'GET', undefined, { range: 'bytes=1-3' }), videoContext); assert.equal(response.status, 206); assert.equal(await response.text(), '123'); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal((await video.GET(request('/api/growth/video/growth-fixture', 'GET', undefined, { range: 'bytes=100-' }), videoContext)).status, 416);
  growth = await deps.saveGrowth(productId, owner, { brief, assets: { ...assets, landing: { ...landing, headline: 'Edited private headline' } }, expectedUpdatedAt: growth.updatedAt });
  assert.equal((await deps.getPublicFunnel('growth-fixture')).landing.headline, landing.headline, 'Editing the workspace does not edit the published snapshot');
  storage.sqlite.prepare('UPDATE growth_workspaces SET lease=? WHERE product_id=?').run(Date.now() + 30000, productId);
  assert.equal((await publish({ expectedUpdatedAt: published.updatedAt })).status, 409, 'Active AI generation cannot publish a stale draft');
  storage.sqlite.prepare('UPDATE growth_workspaces SET lease=0 WHERE product_id=?').run(productId);
  afterGrowthRead = () => storage.sqlite.prepare('UPDATE growth_workspaces SET updated_at=updated_at+1 WHERE product_id=?').run(productId);
  assert.equal((await publish({ expectedUpdatedAt: published.updatedAt })).status, 409, 'A private edit arriving between read and publish cannot slip through');
  assert.equal((await deps.getPublicFunnel('growth-fixture')).landing.headline, landing.headline);
  growth = await deps.getGrowth(productId, owner);
  response = await publish({ expectedUpdatedAt: published.updatedAt }); assert.equal(response.status, 200); published = (await response.json()).funnel;
  assert.equal((await deps.getPublicFunnel('growth-fixture')).landing.headline, 'Edited private headline');
  response = await signup({ owner: 'creator-b', productId: otherProduct, source: 'forged' }); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { success: true, message: landing.thankYou }, 'Public response contains no creator or lead data');
  let row = storage.sqlite.prepare('SELECT * FROM growth_leads WHERE product_id=?').get(productId); assert.equal(row.owner, owner); assert.equal(row.email, 'alex@example.com'); assert.equal(row.source, '/g/growth-fixture'); assert.equal(row.marketing, 1); assert.equal(row.consent_text, deps.marketingConsentText); const consentAt = row.consent_at;
  assert.deepEqual(automationEvents[0], { productId, owner, email: 'alex@example.com', marketing: 1 }, 'Enrollment uses canonical persisted ownership and email');
  response = await crm.PATCH(request('/api/growth/crm', 'PATCH', { id: row.id, status: 'qualified', notes: '=HYPERLINK("https://invalid.test")', expectedUpdatedAt: row.updated_at })); assert.equal(response.status, 200); const updated = (await response.json()).lead;
  response = await signup({ marketing: false, name: 'Alex Again' }); assert.equal(response.status, 200);
  row = storage.sqlite.prepare('SELECT * FROM growth_leads WHERE product_id=?').get(productId); assert.equal(row.marketing, 1, 'Repeat signup without opt-in preserves previous affirmative consent'); assert.equal(row.consent_at, consentAt); assert.equal(row.status, 'qualified'); assert.equal(row.notes, updated.notes); assert.equal(storage.sqlite.prepare('SELECT COUNT(*) AS count FROM growth_leads').get().count, 1, 'Email is deduplicated within a product');
  assert.equal(automationEvents.length, 2, 'A repeat signup retries idempotent enrollment against saved consent'); assert.equal(automationEvents[1].marketing, 1);
  response = await signup({ email: 'no-consent@example.com', marketing: false }); assert.equal(response.status, 200); const noConsent = storage.sqlite.prepare('SELECT * FROM growth_leads WHERE email=?').get('no-consent@example.com'); assert.equal(noConsent.marketing, 0); assert.equal(noConsent.consent_at, null); assert.equal(noConsent.consent_text, '');
  response = await signup({ email: 'robot@example.com', website: 'https://robot.example' }); assert.equal(response.status, 200); assert.equal(storage.sqlite.prepare('SELECT COUNT(*) AS count FROM growth_leads WHERE email=?').get('robot@example.com').count, 0, 'Honeypot submissions are not saved');
  assert.ok(!automationEvents.some(event => event.email === 'robot@example.com'), 'Honeypots never trigger automations');
  failAutomationEnrollment = true;
  response = await signup({ email: 'recover-enrollment@example.com' }); assert.equal(response.status, 200, 'Temporary enrollment failure does not discard a persisted signup'); assert.equal(storage.sqlite.prepare('SELECT COUNT(*) AS count FROM growth_leads WHERE email=?').get('recover-enrollment@example.com').count, 1);
  assert.equal((await signup({}, { origin: 'https://attacker.test' })).status, 403);
  response = await crm.GET(request('/api/growth/crm?q=alex&status=qualified')); assert.equal(response.status, 200); const results = await response.json(); assert.equal(results.total, 1); assert.equal(results.leads[0].id, row.id);
  assert.ok(deps.leadsCsv(results.leads).includes("'=HYPERLINK"), 'CSV formula prefixes are escaped'); assert.equal(deps.csvCell(' \t+SUM(1,2)'), '"\' \t+SUM(1,2)"');
  owner = 'creator-b'; assert.equal((await (await crm.GET(request('/api/growth/crm'))).json()).total, 0); assert.equal((await crm.PATCH(request('/api/growth/crm', 'PATCH', { id: row.id, status: 'won', notes: '', expectedUpdatedAt: row.updated_at }))).status, 404); owner = 'creator-a';
  assert.equal((await crm.PATCH(request('/api/growth/crm', 'PATCH', { id: row.id, status: 'won', notes: '', expectedUpdatedAt: updated.updatedAt }))).status, 409, 'Concurrent signup invalidates stale CRM writes');
  assert.equal((await crm.PATCH(request('/api/growth/crm', 'PATCH', { id: row.id, status: 'invalid', notes: '', expectedUpdatedAt: row.updated_at }))).status, 400);
  const beforeRate = storage.sqlite.prepare('SELECT COUNT(*) AS count FROM growth_leads').get().count;
  for (let i = 0; i < 11; i++) response = await signup({ email: 'rate@example.com' }); assert.equal(response.status, 429, 'Repeat anonymous requests are rate limited'); assert.equal(storage.sqlite.prepare('SELECT COUNT(*) AS count FROM growth_leads').get().count, beforeRate + 1);
  assert.equal((await signup({ email: 'different-person@example.com' })).status, 200, 'Visitors without proxy headers do not share a rate-limit bucket');
  storage.sqlite.prepare("UPDATE growth_lead_rate_limits SET hits=200 WHERE key LIKE 'page:%'").run();
  assert.equal((await signup({ email: 'another-person@example.com' }, { 'cf-connecting-ip': 'spoofed-address' })).status, 429, 'A product-wide rate limit cannot be bypassed by spoofing forwarded addresses');
  response = await publication.DELETE(request('/', 'DELETE'), context); assert.equal(response.status, 200);
  await assert.rejects(() => deps.getPublicFunnel('growth-fixture'), error => error.status === 404); assert.equal((await signup()).status, 404); assert.equal((await video.GET(request('/api/growth/video/growth-fixture'), videoContext)).status, 404, 'Unpublish immediately revokes page, signup and video access');
  owner = ''; assert.equal((await crm.GET(request('/api/growth/crm'))).status, 401);
  owner='';assert.equal((await saveVideo(null,0)).status,401);owner='creator-a';
  console.log('Passed: durable private VSL drafts, no-publication saves, scoped media/voice boundaries, draft CAS and publish-race guards; funnel ownership, immutable snapshots, explicit refresh, generation/publication revision checks, scoped public video/ranges, lead attribution, consent preservation, dedupe, honeypot/rate limit, CRM isolation/revisions/status, CSV escaping and immediate unpublish. No external calls.');
  console.log('QA records retained: ' + root);
} finally { storage.close(); }
