import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {createStorage} from '../runtime/render/storage.mjs';
import {digest} from '../runtime/render/auth.mjs';

// Built-app HTTP integration. Real authentication boundary, SQLite migrations,
// object storage, route bundles and Stripe signature validation; no external calls.
const root = resolve('outputs/creator-suite-runtime-qa', randomUUID());
const probe = createServer(); await new Promise(done => probe.listen(0, '127.0.0.1', done));
const port = probe.address().port; await new Promise(done => probe.close(done));
const base = `http://127.0.0.1:${port}`;
Object.assign(process.env, {
  NODE_ENV: 'production', APP_ORIGIN: base, PORT: String(port), FIVEGEN_RUNTIME: 'render', FIVEGEN_DATA_DIR: root,
  GOOGLE_CLIENT_ID: 'fixture', GOOGLE_CLIENT_SECRET: 'fixture', CREDENTIAL_ENCRYPTION_KEY: 'creator-suite-fixture-key-'.repeat(3),
  RENDER_EXTERNAL_URL: '', RENDER: '', PRODUCT_DOMAIN: '', PADDLE_ENVIRONMENT: 'sandbox', PADDLE_API_KEY: '', PADDLE_WEBHOOK_SECRET: '',
  OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', FAL_KEY: '', RESEND_API_KEY: '', EMAIL_FROM: '', AUTOMATION_DISPATCH_SECRET: '', AUTOMATIONS_WORKER_ENABLED: 'false',
  STRIPE_MODE: 'test', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_CONNECT_WEBHOOK_SECRET: '', STRIPE_COMMERCE_ENABLED: 'false',
});
const seed = createStorage(root), owner = 'creator-suite-owner', other = 'creator-suite-other';
const tokens = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
const version = readFileSync('lib/terms.ts', 'utf8').match(/TERMS_VERSION='([^']+)'/)[1];
for (const [index, id] of [owner, other].entries()) {
  seed.sqlite.prepare('INSERT INTO render_sessions VALUES (?,?,?,?,?)').run(digest(tokens[index]), id, `${id}@example.test`, 'Creator Suite QA', Date.now() + 3600000);
  seed.sqlite.prepare('INSERT INTO terms_acceptances VALUES (?,?,?,?,?)').run(randomUUID(), id, version, `${id}@example.test`, Date.now());
}
seed.close();
const originalFetch = globalThis.fetch, outbound = [], failures = [];
globalThis.fetch = async (input, options) => {
  const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) { outbound.push(target.origin); throw new Error('Runtime test blocked an unexpected external call.'); }
  return originalFetch(input, options);
};
const {start} = await import('../runtime/render/server.mjs'); const app = await start();
const headers = {cookie: `fivegen-local-session=${tokens[0]}`, origin: base, 'content-type': 'application/json'};
const otherHeaders = {...headers, cookie: `fivegen-local-session=${tokens[1]}`};
const anonymous = {origin: base, 'content-type': 'application/json'};
async function json(path, method = 'GET', body, auth = headers, expected = 200, message = '') {
  const response = await fetch(base + path, {method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await response.text(); let value; try { value = JSON.parse(text); } catch { throw new Error(`${method} ${path}: expected JSON, received ${response.status} ${text.slice(0, 250)}`); }
  assert.equal(response.status, expected, `${message ? message + ": " : ""}${method} ${path}: ${JSON.stringify(value)}`); return value;
}
try {
  const home = await fetch(base + '/', {headers}); assert.equal(home.status, 200); assert.match(await home.text(), /Create your product/);
  await json('/api/voice', 'GET', undefined, anonymous, 401);
  await json('/api/growth/dashboard', 'GET', undefined, anonymous, 401);
  const {product} = await json('/api/products', 'POST', {title: 'Creator suite workshop', description: 'A creator-taught workshop with a practical first-client workflow.', audience: 'Independent illustrators', format: 'Video course', price: 0, color: 'orange', generationMode: 'manual'});
  const productUrl = `/api/products/${product.id}`;
  assert.equal(app.storage.sqlite.prepare('SELECT COUNT(*) n FROM generation WHERE product_id=?').get(product.id).n, 0);

  // Offer hypotheses are drafts until explicitly published, with round-scoped
  // responses and no fabricated conversion or payment counts.
  const labUrl = productUrl + '/offer-lab';
  await json(labUrl, 'GET', undefined, otherHeaders, 404);
  let {lab} = await json(labUrl);
  const study = {question: 'Which workshop would help you most?', problem: 'A clear first-client process is difficult to build alone.', a: {title: 'Client workflow workshop', audience: 'Independent illustrators', outcome: 'Build a repeatable client onboarding checklist.', includes: 'One live workshop and a checklist to customize.', price: 49, currency: 'usd'}, b: {title: 'Client workflow mentorship', audience: 'Independent illustrators', outcome: 'Review your specific onboarding process with the creator.', includes: 'Two mentoring calls and personalized checklist feedback.', price: 149, currency: 'usd'}};
  ({lab} = await json(labUrl, 'PATCH', {action: 'save', expectedRevision: lab.revision, draft: study}));
  await json(labUrl, 'PATCH', {action: 'publish', expectedRevision: 0, draft: study}, headers, 409);
  ({lab} = await json(labUrl, 'PATCH', {action: 'publish', expectedRevision: lab.revision}));
  const publicStudy = await fetch(base + '/o/' + lab.slug); assert.equal(publicStudy.status, 200); assert.match(publicStudy.headers.get('cache-control') || '', /no-store/); const studyHtml = await publicStudy.text();
  assert.ok(studyHtml.includes(study.a.title) && studyHtml.includes(study.b.title)); assert.ok(!studyHtml.includes(owner));
  const survey = {slug: lab.slug, revision: lab.publishedRevision, visitor: randomUUID(), action: 'visit'};
  await json('/api/offer-lab/respond', 'POST', survey, anonymous);
  const feedback = '=HYPERLINK("https://example.test","feedback")';
  await json('/api/offer-lab/respond', 'POST', {...survey, action: 'respond', preference: 'a', readiness: 'interested', feedback, email: 'reader@example.test'}, anonymous);
  await json('/api/offer-lab/respond', 'POST', {...survey, action: 'respond', preference: 'b', readiness: 'ready'}, anonymous, 409);
  ({lab} = await json(labUrl)); assert.equal(lab.responseCount, 1); assert.equal(lab.visitors, 1); assert.equal(lab.preferenceCounts.a, 1);
  const exportResponse = await fetch(base + labUrl + '/export', {headers}); assert.equal(exportResponse.status, 200); assert.match(exportResponse.headers.get('content-type'), /text\/csv/); const csv = await exportResponse.text(); assert.ok(csv.includes(study.a.title)); assert.ok(csv.includes("'=HYPERLINK"), 'Spreadsheet export escapes formula-like feedback');
  const deniedExport = await fetch(base + labUrl + '/export', {headers: otherHeaders}); if (deniedExport.status !== 404) failures.push(`Cross-owner offer export returned ${deniedExport.status}, expected404.`);
  let dashboard = await json('/api/growth/dashboard?days=7'); assert.equal(dashboard.leads, 0); assert.equal(dashboard.purchases, 0); assert.equal(dashboard.trend.length, 7); assert.equal(dashboard.products.length, 1);

  // Reviewed creator text and private audio use the actual persistent routes.
  const voiceInput = {productId: product.id, title: 'My studio story', kind: 'story', transcript: 'PRIVATE_CREATOR_STORY: I simplified my handoff after a confusing first project.', evidence: 'Personal experience, no customer outcome guarantee.', uploadId: null, permission: true, approved: true, expectedUpdatedAt: 0};
  await json('/api/voice', 'POST', {...voiceInput, permission: false}, headers, 400);
  let {source} = await json('/api/voice', 'POST', voiceInput, headers, 201);
  await json('/api/voice/' + source.id, 'GET', undefined, otherHeaders, 404);
  assert.equal((await json('/api/voice', 'GET', undefined, otherHeaders)).sources.length, 0);
  await json('/api/voice/' + source.id, 'PATCH', {...voiceInput, expectedUpdatedAt: 0}, headers, 409);
  ({source} = await json('/api/voice/' + source.id, 'PATCH', {...voiceInput, title: 'My reviewed studio story', expectedUpdatedAt: source.updatedAt}));
  const audio = Buffer.from('private audio transport fixture');
  const media = await fetch(base + productUrl + '/uploads?purpose=voice&name=my-note.mp3', {method: 'POST', headers: {...headers, 'content-type': 'audio/mpeg', 'x-file-size': String(audio.length)}, body: audio}); assert.equal(media.status, 201); const {upload} = await media.json();
  const {source:recordingSource} = await json('/api/voice', 'POST', {...voiceInput, kind: 'audio', title: 'My private voice note', uploadId: upload.id, transcript: '', approved: false}, headers, 201);
  assert.equal((await fetch(base + '/api/uploads/' + upload.id, {headers})).status, 200);
  assert.equal((await fetch(base + '/api/uploads/' + upload.id, {headers: otherHeaders})).status, 404);
  await json('/api/voice/' + recordingSource.id + '/transcribe', 'POST', {expectedUpdatedAt: recordingSource.updatedAt, requestId: randomUUID(), maxCredits: 10}, headers, 503);

  const campaignUrl = productUrl + '/campaigns'; let {campaign} = await json(campaignUrl);
  await json(campaignUrl, 'GET', undefined, otherHeaders, 404);
  const item = {id: randomUUID(), channel: 'social', title: 'A calmer handoff', body: 'I learned to simplify my client handoff. Join my workshop interest list for details.', subject: '', sourceIds: [source.id], scheduledAt: null, status: 'draft'};
  ({campaign} = await json(campaignUrl, 'PATCH', {...campaign, title: 'Workshop launch', goal: 'Invite illustrators to request details.', sourceIds: [source.id], items: [item], expectedUpdatedAt: campaign.updatedAt}));
  assert.equal(campaign.sourceRevisions[0].id, source.id); assert.equal(campaign.sourceRevisions[0].updatedAt, source.updatedAt);
  await json(campaignUrl, 'PATCH', {...campaign, items: [{...item, sourceIds: [randomUUID()]}], expectedUpdatedAt: campaign.updatedAt}, headers, 400);
  ({campaign} = await json(campaignUrl, 'PATCH', {...campaign, items: [{...item, status: 'approved'}], expectedUpdatedAt: campaign.updatedAt}));
  assert.equal((await json(campaignUrl)).campaign.items[0].status, 'approved');
  await json(campaignUrl, 'PATCH', {...campaign, items: [{...campaign.items[0], body: 'Changed without renewed review'}], expectedUpdatedAt: campaign.updatedAt}, headers, 409);
  ({campaign} = await json(campaignUrl, 'PATCH', {...campaign, items: [{...campaign.items[0], status: 'scheduled', scheduledAt: Date.now() + 86400000}], expectedUpdatedAt: campaign.updatedAt}));
  assert.equal(campaign.items[0].status, 'scheduled');
  // Export is deliberately local to the browser. The HTTP response provides
  // the exact approved text, timestamp and evidence reference used by it.
  const exportable = (await json(campaignUrl)).campaign; assert.equal(exportable.items[0].body, item.body); assert.ok(exportable.items[0].scheduledAt > Date.now()); assert.equal(exportable.sourceRevisions[0].title, source.title);

  // Saved draft sequences remain usable before delivery credentials exist.
  const automationUrl = `/api/automations?productId=${product.id}`;
  const workspace = await json(automationUrl); assert.equal(workspace.readiness.ready, false);
  await json(automationUrl, 'GET', undefined, otherHeaders, 404);
  const draft = {senderName: 'Workshop creator', replyTo: 'creator@example.test', postalAddress: '123 Example Street, Test City', steps: [{id: randomUUID(), kind: 'welcome', subject: 'Thanks for your interest in {{product}}', body: 'Hi {{name}}, here are the workshop details: {{funnel_url}}', delayHours: 0}]};
  const automations = await json('/api/automations', 'POST', {productId: product.id, trigger: 'lead', action: 'save', expectedRevision: 0, draft});
  const sequence = automations.sequences[0]; assert.equal(sequence.status, 'draft');
  await json('/api/automations', 'POST', {productId: product.id, trigger: 'lead', action: 'activate', expectedRevision: sequence.revision}, headers, 409);
  await json('/api/automations/dispatch', 'POST', {}, anonymous, 401);
  assert.equal(app.storage.sqlite.prepare('SELECT COUNT(*) n FROM automation_jobs').get().n, 0);

  // Published landing traffic and opt-ins feed owner-isolated dashboard data.
  const brief = {icp: 'Illustrators', problem: 'Complicated handoffs', beliefs: 'A useful process must be complex', story: 'My own studio story', promise: 'Build a clearer process', proof: 'No proof yet', offer: 'A live workshop and checklist', tone: 'Warm and direct', cta: 'Request details'};
  const assets = {vsl: 'PRIVATE_SALES_SCRIPT', landing: {headline: 'Build a clearer client handoff', subheadline: 'A workshop for independent illustrators.', body: 'Practice the creator’s real process.', benefits: ['Create a useful checklist'], ctaLabel: 'Request details', thankYou: 'Your request has been received.'}, followUp: 'PRIVATE_FOLLOW_UP'};
  let {growth} = await json(productUrl + '/growth'); ({growth} = await json(productUrl + '/growth', 'PATCH', {brief, assets, expectedUpdatedAt: growth.updatedAt}));
  const {funnel} = await json(productUrl + '/growth/publish', 'POST', {expectedUpdatedAt: 0, expectedGrowthUpdatedAt: growth.updatedAt, creatorVslUploadId: null});
  const visitor = randomUUID();
  await json('/api/growth/events', 'POST', {slug: funnel.slug, visitor, event: 'visit', campaign: 'runtime_launch'}, anonymous);
  await json('/api/growth/events', 'POST', {slug: funnel.slug, visitor, event: 'visit', campaign: 'runtime_launch'}, anonymous);
  await json('/api/growth/events', 'POST', {slug: funnel.slug, visitor, event: 'cta', campaign: 'runtime_launch'}, anonymous);
  await json('/api/growth/leads', 'POST', {slug: funnel.slug, name: 'Workshop Reader', email: 'lead@example.test', marketing: true, website: ''}, anonymous);
  dashboard = await json('/api/growth/dashboard?days=7'); assert.equal(dashboard.visits, 1); assert.equal(dashboard.clicks, 1); assert.equal(dashboard.leads, 1); assert.equal(dashboard.purchases, 0); assert.equal(dashboard.sources[0].campaign, 'runtime_launch'); assert.equal(dashboard.products[0].published, true);
  const isolated = await json('/api/growth/dashboard?days=7', 'GET', undefined, otherHeaders); assert.equal(isolated.visits, 0); assert.equal(isolated.leads, 0); assert.equal(isolated.products.length, 0); assert.equal(isolated.revenue.length, 0);
  await json('/api/growth/dashboard?days=14', 'GET', undefined, headers, 400);
  const landingHtml = await (await fetch(base + '/g/' + funnel.slug)).text(); assert.ok(!landingHtml.includes('PRIVATE_CREATOR_STORY')); assert.ok(!landingHtml.includes('PRIVATE_SALES_SCRIPT'));

  // Stripe Connect remains unavailable until administrator configuration.
  const commerceUrl = `/api/commerce/products/${product.id}`; const settings = await json(commerceUrl); assert.equal(settings.account.configured, false);
  await json(commerceUrl, 'GET', undefined, otherHeaders, 404);
  const offerInput = {enabled: false, amount: 4900, currency: 'usd', intakePrompt: 'What would you like help with?', meetingUrl: 'https://meet.example.test/private-room', expectedUpdatedAt: settings.offer.updatedAt};
  const {offer} = await json(commerceUrl, 'PATCH', offerInput); assert.equal(offer.amount, 4900); assert.equal(offer.enabled, false);
  await json(commerceUrl, 'PATCH', offerInput, headers, 409);
  await json(commerceUrl, 'PATCH', {...offerInput, enabled: true, expectedUpdatedAt: offer.updatedAt}, headers, 503);
  await json('/api/commerce/connect', 'POST', {country: 'US', productId: product.id}, headers, 503);
  await json('/api/commerce/checkout', 'POST', {slug: funnel.slug, email: 'buyer@example.test', requestId: randomUUID()}, anonymous, 503);
  assert.equal(app.storage.sqlite.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n, 0);
  assert.deepEqual((await json('/api/commerce/customer', 'GET', undefined, anonymous)).orders, []);
  const orderId = randomUUID(); app.storage.sqlite.prepare("INSERT INTO commerce_orders(id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at,campaign) VALUES(?,?,?,?,?,?,?,?,?,'pending',?,?,'')").run(orderId, owner, product.id, 'acct_runtime_fixture', 'test', `${owner}@example.test`, 4900, 'usd', product.title, 'not-a-browser-credential', Date.now());
  await json(`/api/commerce/customer/${orderId}`, 'GET', undefined, anonymous, 403);
  await json(`/api/commerce/customer/${orderId}`, 'GET', undefined, headers, 403, 'Even a matching buyer identity needs confirmed payment');
  await json(`/api/commerce/customer/${orderId}/files/notes.md`, 'GET', undefined, headers, 403);
  const portal = await fetch(base + '/customer?order=' + orderId); assert.equal(portal.status, 200); assert.ok(!(await portal.text()).includes('PRIVATE_CREATOR_STORY'));
  let webhook = await fetch(base + '/api/commerce/webhook', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{ "id": "evt_unsigned", "type": "checkout.session.completed" }'}); assert.equal(webhook.status, 503);
  // Fixture-only values allow the real Stripe SDK to execute raw signature
  // validation. No signed event reaches payment reconciliation or the network.
  process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_only'; process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_creator_runtime_fixture';
  webhook = await fetch(base + '/api/commerce/webhook', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{ "id": "evt_unsigned", "type": "checkout.session.completed" }'}); assert.equal(webhook.status, 400); assert.match((await webhook.json()).error, /signature/i);
  process.env.STRIPE_SECRET_KEY = ''; process.env.STRIPE_CONNECT_WEBHOOK_SECRET = '';
  assert.equal(app.storage.sqlite.prepare('SELECT status FROM commerce_orders WHERE id=?').get(orderId).status, 'pending');

  await json('/api/voice/' + source.id, 'DELETE', {expectedUpdatedAt: source.updatedAt});
  await json(campaignUrl, 'PATCH', {...campaign, expectedUpdatedAt: campaign.updatedAt}, headers, 409, 'Removed source invalidates campaign approval');
  await json('/api/voice/' + source.id, 'GET', undefined, headers, 404);
  await json(labUrl, 'PATCH', {action: 'close', expectedRevision: lab.revision});
  assert.equal((await fetch(base + '/o/' + lab.slug)).status, 404);
  assert.deepEqual(outbound, [], 'No provider or other external fetch was attempted');
  assert.deepEqual(failures, [], 'All deferred endpoint boundary checks pass');
  console.log('Passed: built HTTP creator suite — Offer Lab snapshots/responses/CSV export, private reviewed voice sources/audio, campaign citations/approval/reminders, automation draft/config gates, real funnel analytics and owner isolation, Connect settings/config gates, unpaid portal boundaries and actual raw Stripe signature rejection. No external calls.');
  console.log('QA records retained: ' + root);
} finally {
  process.env.STRIPE_SECRET_KEY = ''; process.env.STRIPE_CONNECT_WEBHOOK_SECRET = '';
  await new Promise(done => { app.server.close(done); app.server.closeIdleConnections(); }); app.storage.close(); globalThis.fetch = originalFetch;
}
