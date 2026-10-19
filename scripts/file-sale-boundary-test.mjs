import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import ts from 'typescript';
import { z } from 'zod';
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
import { createStorage } from '../runtime/render/storage.mjs';
import { fileSalePdfFixture as pdf } from './file-sale-pdf-fixture.mjs';

// Actual handlers, file-sale services, migrations and private storage; only the
// authenticated identity and provider transport are synthetic. Retain every
// fixture row/object. This suite never reads env files or calls external APIs.
const root = resolve('outputs/file-sale-boundary-qa', randomUUID());
const storage = createStorage(root), sql = storage.sqlite;
const creator = { userId: 'boundary-creator', email: 'creator@example.test', displayName: 'Fixture creator' };
const buyer = { userId: 'boundary-buyer', email: 'buyer@example.test', displayName: 'Fixture buyer' };
const outsider = { userId: 'boundary-outsider', email: 'outsider@example.test', displayName: 'Fixture outsider' };
let currentUser = creator, enabled = true;
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const dependencies = {
  z, createHash, zipSync, strToU8, ApiError, env: { BUCKET: storage.BUCKET }, database: () => storage.DB,
  binding: key => ({ FIVEGEN_FILE_SALES_ENABLED: enabled ? 'true' : 'false', STRIPE_MODE: 'test', STRIPE_WEBHOOK_SECRET: 'whsec_synthetic_boundary' })[key] || '',
  identity: async () => { if (!currentUser) throw new ApiError('Sign in.', 401); return currentUser; },
  ownedProduct: async (id, owner) => { const row = sql.prepare('SELECT * FROM products WHERE id=? AND owner=?').get(id, owner); if (!row) throw new ApiError('Product not found.', 404); return row; },
  sameOrigin: request => { const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) throw new ApiError('Origin rejected.', 403); },
  failure: error => Response.json({ error: error instanceof ApiError ? error.message : 'Invalid request.' }, { status: error instanceof ApiError ? error.status : 400 }),
  stripeConfigured: () => true, stripeMode: () => 'test',
  stripe: async path => { if (path === 'accounts/acct_boundary_fixture') return { charges_enabled: true, payouts_enabled: true, capabilities: { card_payments: 'active' } }; throw new Error('Unexpected provider operation: ' + path); },
  recordReferral: async () => {}, captureLead: async () => {}, planFor: async () => ({ tier: 'free' }),
  bookSlot: async () => { throw new Error('Booking must not be called for file-sale products'); },
  cancelBooking: async () => { throw new Error('Booking must not be called for file-sale products'); },
};
async function load(path, selectedExports) {
  const key = 'boundaryQa' + randomUUID().replaceAll('-', '');
  globalThis[key] = { ...dependencies };
  let source = readFileSync(path, 'utf8');
  if (selectedExports) {
    const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    source = parsed.statements.filter(statement => ts.isFunctionDeclaration(statement) && selectedExports.includes(statement.name?.text)).map(statement => statement.getText(parsed)).join('\n');
    assert.ok(source, 'Selected actual source exports exist');
  } else source = source.replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); delete globalThis[key]; return result;
}
for (const path of ['lib/commerce.ts', 'lib/experience.ts', 'lib/product.ts', 'lib/product-presets.ts', 'lib/file-sale-contract.ts', 'lib/credit-policy.ts', 'lib/upload-validation.ts', 'lib/export.ts', 'lib/bundle.ts']) Object.assign(dependencies, await load(path));
Object.assign(dependencies, await load('lib/server.ts', ['productFromRow']));
const sales = await load('lib/file-sales.ts'); Object.assign(dependencies, sales);
Object.assign(dependencies, await load('lib/payments.ts'));
Object.assign(dependencies, await load('lib/access.ts'));
const uploadRoute = await load('app/api/uploads/[id]/route.ts');
const productUploadRoute = await load('app/api/products/[id]/uploads/route.ts');
const commerceCustomer = await load('lib/commerce-v2-server.ts', ['commerceMode', 'commerceHash', 'cookieValue', 'cookieOwns', 'customerOrder', 'customerVideo']);
const learnRoute = await load('app/api/learn/[slug]/route.ts');
const downloadRoute = await load('app/api/download/[slug]/route.ts');
const memberRoute = await load('app/api/member-download/[slug]/route.ts');

async function fixtureUpload(productId, bytes, mime = 'application/pdf', owner = creator.userId) {
  const id = randomUUID(), key = `boundary/${productId}/${id}`, now = Date.now();
  await storage.BUCKET.put(key, bytes);
  sql.prepare("INSERT INTO uploads (id,owner,product_id,name,mime,size,object_key,status,sha256,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'completed',?,?,?)")
    .run(id, owner, productId, mime.startsWith('video/') ? 'lesson.mp4' : 'playbook.pdf', mime, bytes.length, key, createHash('sha256').update(bytes).digest('hex'), now, now);
  return id;
}
function request(path, method = 'GET', body, headers = {}) { return new Request('http://localhost' + path, { method, headers: { origin: 'http://localhost', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); }
const idParams = id => ({ params: Promise.resolve({ id }) });
const slugParams = slug => ({ params: Promise.resolve({ slug }) });
async function status(response, expected, message) { assert.equal(response.status, expected, message || await response.clone().text()); return response; }
const file = (id, token, headers = {}) => uploadRoute.GET(request(`/api/uploads/${id}?download=1${token ? '&token=' + encodeURIComponent(token) : ''}`, 'GET', undefined, headers), idParams(id));
const learn = slug => learnRoute.GET(request('/api/learn/' + slug), slugParams(slug));
const complete = (slug, lessonId, extra = {}) => learnRoute.POST(request('/api/learn/' + slug, 'POST', { action: 'complete', lessonId, complete: true, ...extra }), slugParams(slug));
const save = (workspace, draft) => sales.saveFileSale(workspace.product.id, creator.userId, { expectedVersion: workspace.version, draft });
const publish = (workspace, grantModulesToExisting = []) => sales.publishFileSale(workspace.product.id, creator.userId, { expectedVersion: workspace.version, grantModulesToExisting });
async function paidFixture(workspace, email = buyer.email) {
  const id = 'cs_test_boundary_' + randomUUID(), token = randomUUID() + randomUUID();
  sql.prepare('INSERT INTO orders (id,product_id,owner,email,amount,provider,token,sale_revision_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, workspace.product.id, creator.userId, email, workspace.draft.priceCents, 'stripe', token, workspace.publishedRevisionId, Date.now());
  const order = sql.prepare('SELECT * FROM orders WHERE id=?').get(id); await sales.fulfillFileSaleOrder(order); return order;
}

try {
  sql.prepare('INSERT INTO sellers (owner,name,stripe_account,created_at) VALUES (?,?,?,?)').run(creator.userId, 'Boundary fixture', 'acct_boundary_fixture', Date.now());
  let w = await sales.createFileSale(creator.userId, { preset: 'playbook' });
  const firstBytes = pdf('First original file'), secondBytes = pdf('Updated original file');
  const first = await fixtureUpload(w.product.id, firstBytes), draftOnly = await fixtureUpload(w.product.id, pdf('Private unselected file'));
  const videoBytes = Buffer.from('synthetic video range fixture'), video = await fixtureUpload(w.product.id, videoBytes, 'video/mp4');
  const lessonId = randomUUID(), draftCourse = { kind: 'course', name: 'Optional course', included: false, uploadIds: [], sections: [{ id: lessonId, title: 'Private course lesson', body: 'ENTITLED LESSON BODY ONLY', videoId: video }] };
  w = await save(w, { ...w.draft, title: 'Boundary playbook', description: 'A complete original file with optional lessons.', priceCents: 1900, modules: [{ kind: 'downloads', name: 'Playbook', included: true, uploadIds: [first], sections: [] }, draftCourse] });
  w = await publish(w); const order = await paidFixture(w), slug = w.product.slug;

  currentUser = null;
  await status(await file(first), 403); await status(await file(first, 'invalid-access-link'), 403);
  await status(await learn(slug), 403);
  await status(await downloadRoute.GET(request('/api/download/' + slug), slugParams(slug)), 403);
  await status(await memberRoute.GET(request('/api/member-download/' + slug), slugParams(slug)), 403);
  const byToken = await status(await file(first, order.token), 200);
  assert.deepEqual(Buffer.from(await byToken.arrayBuffer()), firstBytes);
  assert.match(byToken.headers.get('content-disposition'), /^attachment;/);
  assert.equal(byToken.headers.get('cache-control'), 'private, no-store'); assert.equal(byToken.headers.get('referrer-policy'), 'no-referrer'); assert.equal(byToken.headers.get('x-content-type-options'), 'nosniff');
  await status(await file(draftOnly, order.token), 403); await status(await file(video, order.token), 403);
  const range = await status(await file(first, order.token, { range: 'bytes=0-7' }), 206); assert.deepEqual(Buffer.from(await range.arrayBuffer()), firstBytes.subarray(0, 8));
  await status(await file(first, order.token, { range: 'bytes=999999-' }), 416);
  const oldDownload = await status(await downloadRoute.GET(request('/api/download/' + slug + '?token=' + order.token), slugParams(slug)), 200);
  assert.equal((await oldDownload.json()).accessPath, '/access/' + slug, 'Legacy download entry directs new buyers to original-file delivery');

  currentUser = outsider;
  await status(await file(first), 403); await status(await learn(slug), 403); await status(await complete(slug, lessonId), 403);
  await status(await uploadRoute.DELETE(request('/api/uploads/' + first, 'DELETE'), idParams(first)), 404);
  currentUser = buyer;
  await status(await file(first), 200);
  const room = await status(await learn(slug), 200), roomJson = await room.json();
  assert.deepEqual(roomJson.fileSale.modules.map(module => module.kind), ['downloads']);
  assert.ok(!JSON.stringify(roomJson).includes('ENTITLED LESSON BODY ONLY')); assert.ok(!JSON.stringify(roomJson).includes(draftOnly));
  await status(await complete(slug, lessonId), 403);
  await status(await learnRoute.POST(request('/api/learn/' + slug, 'POST', { action: 'post', body: 'Unrequested community' }), slugParams(slug)), 409);
  assert.equal((await (await status(await memberRoute.GET(request('/api/member-download/' + slug), slugParams(slug)), 200)).json()).accessPath, '/access/' + slug);

  currentUser = creator;
  await status(await file(draftOnly), 200, 'Owner can preview a private draft file');
  await status(await uploadRoute.DELETE(request('/api/uploads/' + first, 'DELETE'), idParams(first)), 409);
  assert.ok(sql.prepare('SELECT id FROM uploads WHERE id=?').get(first));
  const second = await fixtureUpload(w.product.id, secondBytes);
  w = await save(w, { ...w.draft, modules: [{ ...w.draft.modules[0], uploadIds: [second] }, { ...draftCourse, included: true }] });
  w = await publish(w);
  currentUser = buyer;
  assert.deepEqual(Buffer.from(await (await status(await file(first), 200)).arrayBuffer()), firstBytes, 'Original purchased bytes remain downloadable after replacement');
  assert.deepEqual(Buffer.from(await (await status(await file(second), 200)).arrayBuffer()), secondBytes, 'Future PDF update is granted');
  await status(await file(video), 403); await status(await complete(slug, lessonId), 403);
  currentUser = creator;
  w = await save(w, { ...w.draft, description: w.draft.description + ' Course now approved for prior buyers.' }); w = await publish(w, ['course']);
  currentUser = buyer;
  await status(await file(video), 200); await status(await complete(slug, lessonId), 200);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM lesson_progress WHERE product_id=? AND user_id=? AND lesson_id=?').get(w.product.id, buyer.userId, lessonId).n, 1);
  await status(await complete(slug, lessonId), 200);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM lesson_progress WHERE product_id=? AND user_id=? AND lesson_id=?').get(w.product.id, buyer.userId, lessonId).n, 1, 'Repeat lesson completion is idempotent');
  assert.ok(JSON.stringify(await (await learn(slug)).json()).includes('ENTITLED LESSON BODY ONLY'));
  const unseenLesson = randomUUID(); await status(await complete(slug, unseenLesson), 403);
  enabled = false;
  await status(await file(first), 200); await status(await file(second), 200); await status(await file(video), 200); await status(await learn(slug), 200);
  await status(await memberRoute.GET(request('/api/member-download/' + slug), slugParams(slug)), 200);
  await status(await downloadRoute.GET(request('/api/download/' + slug), slugParams(slug)), 200);
  currentUser = null; await status(await file(first, order.token), 200); await status(await file(draftOnly, order.token), 403); enabled = true;

  // A second workspace's valid order cannot be reused as a file-sale token.
  const foreignId = randomUUID(), foreignToken = randomUUID() + randomUUID(), legacyLesson = randomUUID();
  const legacyContent = { sections: [{ id: legacyLesson, title: 'Legacy lesson', body: 'LEGACY PRIVATE CONTENT' }], benefits: [], launch: 'CREATOR STRATEGY', files: [{ name: 'worksheet.md', content: 'Original resource', description: '' }] };
  sql.prepare('INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(foreignId, 'legacy-owner', 'legacy-boundary', 'Legacy guide', 'The existing content contract.', 'Readers', 'Guide', 1900, 'orange', JSON.stringify(legacyContent), 'published', Date.now(), Date.now());
  sql.prepare('INSERT INTO orders (id,product_id,owner,email,amount,provider,token,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('legacy-order', foreignId, 'legacy-owner', buyer.email, 1900, 'stripe', foreignToken, Date.now());
  const legacyFile = await fixtureUpload(foreignId, pdf('Legacy customer file'), 'application/pdf', 'legacy-owner');
  await status(await file(first, foreignToken), 403); await status(await file(legacyFile, order.token), 403);
  currentUser = buyer;
  const legacyRoom = await status(await learn('legacy-boundary'), 200), legacyJson = await legacyRoom.json();
  assert.equal(legacyJson.product.content.sections[0].body, 'LEGACY PRIVATE CONTENT'); assert.equal(legacyJson.product.content.launch, ''); assert.equal(legacyJson.fileSale, undefined);
  assert.ok(legacyJson.uploads.some(upload => upload.id === legacyFile)); await status(await file(legacyFile), 200);
  await status(await complete('legacy-boundary', legacyLesson), 200);
  const zip = await status(await memberRoute.GET(request('/api/member-download/legacy-boundary'), slugParams('legacy-boundary')), 200);
  assert.equal(zip.headers.get('content-type'), 'application/zip');
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer())); assert.ok(strFromU8(entries['01-product/product.md']).includes('LEGACY PRIVATE CONTENT')); assert.ok(entries['02-resources/worksheet.md']); assert.ok(!entries['03-marketing/launch-campaign.txt']);
  currentUser = null;
  await status(await downloadRoute.GET(request('/api/download/legacy-boundary'), slugParams('legacy-boundary')), 403);
  await status(await memberRoute.GET(request('/api/member-download/legacy-boundary'), slugParams('legacy-boundary')), 401);
  const legacyTokenZip = await status(await downloadRoute.GET(request('/api/download/legacy-boundary?token=' + foreignToken), slugParams('legacy-boundary')), 200); assert.equal(legacyTokenZip.headers.get('content-type'), 'application/zip');
  await status(await file(legacyFile, foreignToken), 200);
  currentUser = outsider; await status(await learn('legacy-boundary'), 403); await status(await memberRoute.GET(request('/api/member-download/legacy-boundary'), slugParams('legacy-boundary')), 403);
  currentUser = { userId: 'legacy-owner', email: 'legacy-owner@example.test', displayName: 'Legacy owner' };
  // Guard an explicitly referenced legacy file; do not exercise deletion on any fixture.
  sql.prepare('UPDATE products SET content=? WHERE id=?').run(JSON.stringify({ ...legacyContent, sections: [{ ...legacyContent.sections[0], videoId: legacyFile }] }), foreignId);
  await status(await uploadRoute.DELETE(request('/api/uploads/' + legacyFile, 'DELETE'), idParams(legacyFile)), 409);
  assert.ok(await storage.BUCKET.get(sql.prepare('SELECT object_key FROM uploads WHERE id=?').get(legacyFile).object_key));

  // Merge compatibility: creator voice uploads retain audio support and privacy.
  // They are source material, never a deliverable, even if a snapshot/funnel has
  // an old reference. All retained source rows and bytes use synthetic fixtures.
  currentUser = creator;
  async function voiceUpload(mime, name) {
    const bytes = Buffer.from('Synthetic creator source: ' + mime);
    const response = await status(await productUploadRoute.POST(new Request(`http://localhost/api/products/${w.product.id}/uploads?purpose=voice&name=${name}`, {
      method: 'POST', headers: { origin: 'http://localhost', 'Content-Type': mime, 'X-File-Size': String(bytes.length) }, body: bytes, duplex: 'half',
    }), idParams(w.product.id)), 201);
    const upload = (await response.json()).upload;
    assert.equal(upload.purpose, 'voice'); assert.equal(upload.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.match(sql.prepare('SELECT object_key FROM uploads WHERE id=?').get(upload.id).object_key, /^voice\//);
    return upload.id;
  }
  for (const [mime, name] of [['audio/mpeg', 'source.mp3'], ['audio/mp4', 'source.m4a'], ['audio/wav', 'source.wav'], ['audio/x-wav', 'source.wav'], ['audio/webm', 'source.webm'], ['audio/ogg', 'source.ogg'], ['audio/flac', 'source.flac']]) {
    const voiceId = await voiceUpload(mime, name);
    await status(await file(voiceId), 200);
    currentUser = buyer; await status(await file(voiceId, order.token), 404);
    currentUser = null; await status(await file(voiceId, order.token), 401);
    currentUser = creator;
  }
  const voiceVideo = await voiceUpload('video/mp4', 'private-source.mp4');
  const source = (uploadId, productId, owner) => sql.prepare('INSERT INTO creator_voice_sources (id,owner,product_id,title,kind,upload_id,updated_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), owner, productId, 'Synthetic private source', 'video', uploadId, Date.now());
  source(video, w.product.id, creator.userId); // An existing classes/ recording becomes private source material.
  const voiceList = (await (await status(await productUploadRoute.GET(request(`/api/products/${w.product.id}/uploads`), idParams(w.product.id)), 200)).json()).uploads;
  assert.equal(voiceList.find(upload => upload.id === voiceVideo).purpose, 'voice');
  assert.equal(voiceList.find(upload => upload.id === video).purpose, 'voice', 'Registered source privacy does not depend on storage-key prefix');
  assert.equal(voiceList.find(upload => upload.id === first).purpose, 'product');
  for (const sourceVideo of [voiceVideo, video]) {
    await assert.rejects(() => save(w, { ...w.draft, modules: [{ ...w.draft.modules[1], sections: [{ id: randomUUID(), title: 'Source is not a lesson', body: '', videoId: sourceVideo }] }] }), error => error.status === 403);
  }
  const refreshed = await sales.getFileSale(w.product.id, creator.userId);
  assert.ok(!refreshed.uploads.some(upload => [voiceVideo, video].includes(upload.id)), 'Sale editor excludes creator sources');
  assert.equal(refreshed.readiness.checks.find(check => check.key === 'course').ready, false, 'Previously attached source cannot remain sale-ready');
  currentUser = buyer;
  await status(await file(video, order.token), 404);
  const privateRoom = await sales.resolveFileSaleAccess(sql.prepare('SELECT * FROM products WHERE id=?').get(w.product.id));
  assert.ok(!privateRoom.uploads.some(upload => [voiceVideo, video].includes(upload.id)));
  assert.ok(!privateRoom.modules.some(module => module.sections.some(section => section.videoId === video)), 'Buyer classroom metadata omits private source recording');
  assert.ok(!JSON.stringify(await (await learn(slug)).json()).includes(video));
  await status(await file(first, order.token), 200, 'Source privacy does not revoke unrelated paid PDF files');

  currentUser = { userId: 'legacy-owner', email: 'legacy-owner@example.test', displayName: 'Legacy owner' };
  const publishedVsl = await fixtureUpload(foreignId, Buffer.from('Synthetic published VSL'), 'video/mp4', 'legacy-owner');
  sql.prepare('INSERT INTO growth_funnels (product_id,owner,slug,title,landing,creator_vsl_upload_id,published_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(foreignId, 'legacy-owner', 'legacy-funnel-boundary', 'Retained VSL', '{}', publishedVsl, Date.now(), Date.now());
  await status(await uploadRoute.DELETE(request('/api/uploads/' + publishedVsl, 'DELETE'), idParams(publishedVsl)), 409, 'Published growth funnel preserves VSL absent from current product content');
  assert.ok(sql.prepare('SELECT id FROM uploads WHERE id=?').get(publishedVsl));
  const privateLegacyVideo = await fixtureUpload(foreignId, Buffer.from('Synthetic creator-private video'), 'video/mp4', 'legacy-owner');
  source(privateLegacyVideo, foreignId, 'legacy-owner');
  sql.prepare('UPDATE products SET content=?,commerce=? WHERE id=?').run(JSON.stringify({ ...legacyContent, sections: [{ ...legacyContent.sections[0], videoId: publishedVsl }, { id: randomUUID(), title: 'Accidental private reference', body: '', videoId: privateLegacyVideo }] }), JSON.stringify({ funnel: { enabled: true, blocks: [{ visible: true, kind: 'video', image: '/api/uploads/' + privateLegacyVideo }] } }), foreignId);
  currentUser = null; await status(await file(privateLegacyVideo, foreignToken), 401, 'Accidental public funnel reference cannot expose a creator source');
  currentUser = buyer; await status(await file(privateLegacyVideo, foreignToken), 404);

  // Existing commerce-v2 orders and their dedicated customer route remain
  // independent from both file-sale flags and legacy orders/access tokens.
  const commerceId = randomUUID(), commerceToken = randomUUID() + randomUUID();
  sql.prepare('INSERT INTO commerce_orders (id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(commerceId, 'legacy-owner', foreignId, 'acct_synthetic_v2', 'test', buyer.email, 1900, 'usd', 'Existing commerce fixture', 'paid', await commerceCustomer.commerceHash(commerceToken), Date.now());
  enabled = false;
  const v2File = headers => commerceCustomer.customerVideo(request(`/api/commerce/customer/${commerceId}/video/${publishedVsl}`, 'GET', undefined, headers), commerceId, publishedVsl);
  assert.equal((await v2File()).status, 200, 'Signed-in commerce-v2 buyer keeps video access with file-sale flag off');
  currentUser = outsider; await assert.rejects(v2File, error => error.status === 403);
  currentUser = null; await assert.rejects(v2File, error => error.status === 403);
  const cookie = `fivegen_purchase_${commerceId.replaceAll('-', '')}=${commerceToken}`;
  const v2Range = await v2File({ cookie, range: 'bytes=0-8' }); assert.equal(v2Range.status, 206); assert.equal((await v2Range.arrayBuffer()).byteLength, 9);
  await assert.rejects(() => commerceCustomer.customerVideo(request(`/api/commerce/customer/${commerceId}/video/${privateLegacyVideo}`, 'GET', undefined, { cookie }), commerceId, privateLegacyVideo), error => error.status === 404);
  sql.prepare("UPDATE commerce_orders SET status='revoked' WHERE id=?").run(commerceId);
  await assert.rejects(() => v2File({ cookie }), error => error.status === 403, 'Existing commerce-v2 refund/dispute revocation remains enforced');
  currentUser = { userId: 'legacy-owner', email: 'legacy-owner@example.test', displayName: 'Legacy owner' };
  const failedLegacyId = randomUUID();
  sql.prepare("INSERT INTO uploads (id,owner,product_id,name,mime,size,object_key,status,created_at) VALUES (?,?,?,?,?,?,?,'failed',?)").run(failedLegacyId, 'legacy-owner', foreignId, 'failed.mp4', 'video/mp4', 4, 'boundary-failed-no-object', Date.now());
  const legacyList = (await (await productUploadRoute.GET(request(`/api/products/${foreignId}/uploads`), idParams(foreignId))).json()).uploads;
  assert.ok(!legacyList.some(upload => upload.id === failedLegacyId), 'Existing lesson and funnel pickers still list only completed uploads');
  assert.equal(legacyList.find(upload => upload.id === privateLegacyVideo).purpose, 'voice');
  console.log('Passed: actual private file/member/classroom routes, immutable PDF and module access, upload integrity and creator audio support, creator-source exclusion at save/readiness/delivery, retained VSL guard, existing commerce-v2 cookie/email access and revoked-order denial, flag-off buyer access, and legacy ZIP/member semantics.');
  console.log('Synthetic identities/provider only; no external requests or deletion. Retained fixtures: ' + root);
} finally { storage.close(); }
