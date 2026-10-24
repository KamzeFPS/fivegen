import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import { createStorage } from '../runtime/render/storage.mjs';

const root = resolve('outputs/product-page-qa', randomUUID()), storage = createStorage(root), sql = storage.sqlite;
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
let user = { userId: 'creator-a', email: 'creator@example.test' }, mode = 'live';
const deps = {
  z, ApiError, env: { BUCKET: storage.BUCKET }, database: () => storage.DB,
  binding: name => name === 'STRIPE_MODE' ? mode : '',
  identity: async () => { if (!user) throw new ApiError('Sign in', 401); return user; },
  ownedProduct: async (id, owner) => { const row = sql.prepare('SELECT * FROM products WHERE id=? AND owner=?').get(id, owner); if (!row) throw new ApiError('Not found', 404); return row; },
  sameOrigin: request => { if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('Origin rejected', 403); },
  failure: error => Response.json({ error: error.issues ? 'Invalid input' : error.message }, { status: error.status || (error.issues ? 400 : 500) }),
  Stripe: class { constructor() { throw new Error('Product page tests must never call Stripe.'); } },
  enrollAutomationPurchase: async () => {},
};
async function load(path) {
  const key = 'qa' + randomUUID().replaceAll('-', ''); globalThis[key] = { ...deps };
  const source = fs.readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(deps).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); delete globalThis[key]; return result;
}
Object.assign(deps, await load('lib/product.ts'));
Object.assign(deps, await load('lib/commerce-v2.ts'));
Object.assign(deps, await load('lib/commerce-v2-server.ts'));
Object.assign(deps, await load('lib/product-page.ts'));
Object.assign(deps, await load('lib/product-page-server.ts'));
const pageRoute = await load('app/api/products/[id]/page/route.ts');
const publishRoute = await load('app/api/products/[id]/page/publish/route.ts');
const reviewRoute = await load('app/api/product-pages/[slug]/reviews/route.ts');
const imageRoute = await load('app/api/product-pages/[slug]/image/[kind]/route.ts');
const id = randomUUID(), other = randomUUID(), now = Date.now(), slug = 'a-real-creator-product';
const content = { sections: [{ title: 'First lesson', category: 'Start here', body: 'PRIVATE PAID LESSON BODY', videoId: randomUUID() }], benefits: [], launch: 'PRIVATE VSL SCRIPT', files: [{ name: 'secret.md', description: 'Private notes', content: 'PRIVATE DOWNLOAD CONTENT' }], salesCopy: 'PRIVATE SALES COPY' };
for (const [productId, owner, productSlug] of [[id, 'creator-a', slug], [other, 'creator-b', 'someone-elses-product']]) {
  sql.prepare("INSERT INTO products(id,owner,slug,title,description,audience,format,color,content,created_at,updated_at) VALUES (?,?,?,?,?,'Creators','Mini course','orange',?,?,?)").run(productId, owner, productSlug, 'Original title', 'A clear public product description.', JSON.stringify(content), now, now);
}
sql.prepare('INSERT INTO terms_acceptances(id,owner,version,email,accepted_at) VALUES (?,?,?,?,?)').run(randomUUID(), 'creator-a', 'test', 'creator@example.test', now);
sql.prepare('INSERT INTO growth_funnels(product_id,owner,slug,title,landing,published_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id, 'creator-a', 'existing-real-funnel', 'Funnel', '{}', now, now);
sql.prepare('INSERT INTO commerce_offers(product_id,owner,amount,intake_prompt,meeting_url,updated_at) VALUES (?,?,?,?,?,?)').run(id, 'creator-a', 4900, 'Private intake', 'https://meet.example.test/PRIVATE-MEETING', now);
const context = { params: Promise.resolve({ id }) }, publicContext = { params: Promise.resolve({ slug }) };
const request = (method = 'GET', body, headers = {}) => new Request('https://fivegen.test/api/products/' + id + '/page', { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const save = body => pageRoute.PATCH(request('PATCH', body), context);
const publish = revision => publishRoute.POST(request('POST', { expectedUpdatedAt: revision }), context);
const review = (body, headers) => reviewRoute.POST(request('POST', body, headers), publicContext);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 72, 68, 82]);
async function upload({ owner = 'creator-a', productId = id, mime = 'image/png', status = 'completed', key = 'classes/' + randomUUID(), bytes = png, size = bytes.length } = {}) {
  const uploadId = randomUUID();
  sql.prepare('INSERT INTO uploads(id,owner,product_id,name,mime,size,object_key,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(uploadId, owner, productId, 'image.png', mime, size, key, status, now);
  await storage.BUCKET.put(key, bytes); return uploadId;
}
async function order({ email = 'buyer@example.test', productId = id, owner = 'creator-a', paymentMode = 'live', status = 'paid', amount = 4900, paidAt = now } = {}) {
  const orderId = randomUUID(), token = randomUUID() + randomUUID();
  sql.prepare('INSERT INTO commerce_orders(id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,created_at,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(orderId, owner, productId, 'acct_fixture', paymentMode, email, amount, 'usd', 'Purchased title', status, await deps.commerceHash(token), now, paidAt);
  return { id: orderId, cookie: `fivegen_purchase_${orderId.replaceAll('-', '')}=${token}` };
}
const inputReview = orderId => ({ orderId, displayName: 'A real customer', rating: 5, body: 'The practical lessons helped me put my launch together.' });

try {
  let response = await pageRoute.GET(request(), context), page = (await response.json()).page;
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(page.updatedAt, 0); assert.equal(page.published, null); assert.equal(page.publicPath, '/product/' + slug); assert.deepEqual(page.reviewSummary, { count: 0, average: null, reviews: [] });
  await assert.rejects(() => deps.getPublicProductPage(slug), error => error.status === 404);
  user = { userId: 'creator-b', email: 'other@example.test' }; assert.equal((await pageRoute.GET(request(), context)).status, 404);
  assert.equal((await save({ config: page.draft, expectedUpdatedAt: 0 })).status, 404);
  user = null; assert.equal((await pageRoute.GET(request(), context)).status, 401);
  user = { userId: 'creator-a', email: 'creator@example.test' };
  assert.equal((await pageRoute.PATCH(request('PATCH', { config: page.draft, expectedUpdatedAt: 0 }, { Origin: 'https://evil.test' }), context)).status, 403);
  assert.equal((await publishRoute.POST(request('POST', { expectedUpdatedAt: 0 }, { Origin: 'https://evil.test' }), context)).status, 403);
  for (const url of ['javascript:alert(1)', 'http://example.test', 'https://person:secret@example.test']) assert.equal((await save({ config: { ...page.draft, links: [{ label: 'Bad link', url }] }, expectedUpdatedAt: 0 })).status, 400);
  assert.equal((await save({ config: { ...page.draft, injectedPublished: true }, expectedUpdatedAt: 0 })).status, 400);
  const icon = await upload(), banner = await upload(), foreign = await upload({ owner: 'creator-b', productId: other }), differentProduct = await upload({ productId: other }), voice = await upload({ key: 'voice/private-image' }), incomplete = await upload({ status: 'uploading' }), fake = await upload({ bytes: new TextEncoder().encode('<html>not an image</html>') }), huge = await upload({ size: 10 * 1024 * 1024 + 1 }), voiceSource = await upload();
  sql.prepare('INSERT INTO creator_voice_sources(id,owner,product_id,title,kind,upload_id,updated_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), 'creator-a', id, 'Private source', 'image', voiceSource, now);
  for (const imageId of [foreign, differentProduct, voice, incomplete, huge, voiceSource]) assert.equal((await save({ config: { ...page.draft, iconUploadId: imageId }, expectedUpdatedAt: 0 })).status, 409);
  assert.equal((await save({ config: { ...page.draft, iconUploadId: fake }, expectedUpdatedAt: 0 })).status, 400);
  const config = { ...page.draft, about: 'My public approach and real experience.', creatorName: 'Private creator name', location: 'Private city', welcomeMessage: 'Welcome to my product', iconUploadId: icon, links: [{ label: 'My site', url: 'https://example.test/my-work' }] };
  response = await save({ config, expectedUpdatedAt: 0 }); assert.equal(response.status, 200, await response.clone().text()); page = (await response.json()).page;
  assert.equal(page.published, null); await assert.rejects(() => deps.getPublicProductPage(slug), error => error.status === 404);
  assert.equal((await save({ config, expectedUpdatedAt: 0 })).status, 409);
  response = await publish(page.updatedAt); assert.equal(response.status, 200, await response.clone().text()); page = (await response.json()).page;
  let publicPage = await deps.getPublicProductPage(slug);
  assert.equal(publicPage.product.title, 'Original title'); assert.deepEqual(publicPage.product.sections, [{ title: 'First lesson', category: 'Start here' }]);
  assert.equal(publicPage.funnelPath, '/g/existing-real-funnel'); assert.equal(publicPage.config.creatorName, ''); assert.equal(publicPage.config.location, '');
  for (const secret of ['PRIVATE PAID', 'PRIVATE VSL', 'PRIVATE DOWNLOAD', 'PRIVATE SALES', 'PRIVATE-MEETING', 'Private creator name', 'Private city']) assert.ok(!JSON.stringify(publicPage).includes(secret), 'Public page must not expose ' + secret);
  response = await imageRoute.GET(request(), { params: Promise.resolve({ slug, kind: 'icon' }) }); assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png'); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
  assert.equal((await imageRoute.GET(request(), { params: Promise.resolve({ slug, kind: 'banner' }) })).status, 404);
  assert.equal((await imageRoute.GET(request(), { params: Promise.resolve({ slug, kind: 'other' }) })).status, 404);
  const nextConfig = { ...config, about: 'A revised private draft', iconUploadId: null, bannerUploadId: banner, showCreator: true, showLocation: true, showContent: false };
  response = await save({ config: nextConfig, expectedUpdatedAt: page.updatedAt }); page = (await response.json()).page;
  sql.prepare('UPDATE products SET title=?,updated_at=? WHERE id=?').run('New private product title', now + 1, id);
  publicPage = await deps.getPublicProductPage(slug); assert.equal(publicPage.product.title, 'Original title'); assert.equal(publicPage.config.about, config.about); assert.equal(publicPage.config.iconUploadId, icon); assert.equal(publicPage.config.bannerUploadId, null);
  assert.equal((await publish(page.updatedAt - 1)).status, 409);
  response = await publish(page.updatedAt); page = (await response.json()).page; publicPage = await deps.getPublicProductPage(slug);
  assert.equal(publicPage.product.title, 'New private product title'); assert.equal(publicPage.config.creatorName, 'Private creator name'); assert.equal(publicPage.config.location, 'Private city'); assert.deepEqual(publicPage.product.sections, []);
  assert.equal((await imageRoute.GET(request(), { params: Promise.resolve({ slug, kind: 'icon' }) })).status, 404); assert.equal((await imageRoute.GET(request(), { params: Promise.resolve({ slug, kind: 'banner' }) })).status, 200);
  user = null;
  const buyer = await order();
  assert.equal((await review(inputReview(buyer.id))).status, 403, 'Order ID alone cannot review');
  assert.equal((await review(inputReview(buyer.id), { cookie: buyer.cookie, Origin: 'https://evil.test' })).status, 403);
  assert.equal((await review({ ...inputReview(buyer.id), displayName: 'buyer@example.test' }, { cookie: buyer.cookie })).status, 400);
  assert.equal((await review({ ...inputReview(buyer.id), body: 'Reach buyer@example.test for a private conversation.' }, { cookie: buyer.cookie })).status, 400);
  assert.equal((await review({ ...inputReview(buyer.id), rating: 6 }, { cookie: buyer.cookie })).status, 400);
  for (const options of [{ status: 'pending', paidAt: null }, { status: 'revoked' }, { amount: 0 }, { paidAt: null }, { productId: other, owner: 'creator-b' }]) {
    const ineligible = await order(options); assert.equal((await review(inputReview(ineligible.id), { cookie: ineligible.cookie })).status, 403);
  }
  const testOrder = await order({ paymentMode: 'test' }); assert.equal((await review(inputReview(testOrder.id), { cookie: testOrder.cookie })).status, 404);
  mode = 'test'; assert.equal((await review(inputReview(testOrder.id), { cookie: testOrder.cookie })).status, 403); mode = 'live';
  const own = await order({ email: 'creator@example.test' }); assert.equal((await review(inputReview(own.id), { cookie: own.cookie })).status, 403);
  user = { userId: 'creator-a', email: 'creator@example.test' }; assert.equal((await review(inputReview(buyer.id), { cookie: buyer.cookie })).status, 403, 'Signed-in owner cannot review via another purchase cookie'); user = null;
  response = await review(inputReview(buyer.id), { cookie: buyer.cookie }); assert.equal(response.status, 201, await response.clone().text()); let summary = (await response.json()).reviewSummary;
  assert.equal(summary.count, 1); assert.equal(summary.average, 5); assert.equal(summary.reviews[0].displayName, 'A real customer'); assert.ok(!JSON.stringify(summary).includes('buyer@example.test')); assert.ok(!JSON.stringify(summary).includes(buyer.id));
  assert.equal((await review(inputReview(buyer.id), { cookie: buyer.cookie })).status, 409);
  const repeatBuyer = await order(); assert.equal((await review(inputReview(repeatBuyer.id), { cookie: repeatBuyer.cookie })).status, 409, 'A repeat purchase cannot add a second rating for the same verified email');
  const otherBuyer = await order({ email: 'second@example.test' }); user = { userId: 'buyer-user', email: 'SECOND@example.test' };
  response = await review({ ...inputReview(otherBuyer.id), rating: 3 }); assert.equal(response.status, 201, await response.clone().text()); summary = (await response.json()).reviewSummary;
  assert.equal(summary.count, 2); assert.equal(summary.average, 4); user = null;
  sql.prepare("UPDATE commerce_orders SET status='revoked' WHERE id=?").run(buyer.id);
  summary = await deps.getPublicProductReviews(slug); assert.equal(summary.count, 1); assert.equal(summary.average, 3); assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM product_reviews').get().n, 2, 'Revocation hides public proof while preserving the audit record');
  user = { userId: 'creator-a', email: 'creator@example.test' };
  response = await save({ config: { ...nextConfig, showReviews: false }, expectedUpdatedAt: page.updatedAt }); page = (await response.json()).page;
  assert.equal((await deps.getPublicProductReviews(slug)).count, 1, 'Unsaved public changes do not hide published reviews');
  response = await publish(page.updatedAt); page = (await response.json()).page;
  assert.deepEqual((await deps.getPublicProductPage(slug)).reviewSummary, { count: 0, average: null, reviews: [] }); assert.equal((await reviewRoute.GET(request(), publicContext)).status, 404);
  assert.equal((await publishRoute.DELETE(request('DELETE', { expectedUpdatedAt: page.updatedAt - 1 }), context)).status, 409);
  response = await publishRoute.DELETE(request('DELETE', { expectedUpdatedAt: page.updatedAt }), context); assert.equal(response.status, 200); page = (await response.json()).page; assert.equal(page.publishedAt, null); assert.equal(page.draft.about, nextConfig.about);
  await assert.rejects(() => deps.getPublicProductPage(slug), error => error.status === 404); assert.equal((await imageRoute.GET(request(), { params: Promise.resolve({ slug, kind: 'banner' }) })).status, 404);
  assert.equal((await reviewRoute.GET(request(), publicContext)).status, 404);
  assert.equal((await publish(page.updatedAt)).status, 200, 'Unpublishing preserves the private draft for later explicit publication');
  user = { userId: 'creator-b', email: 'other@example.test' };
  const firstPublication = await publishRoute.POST(request('POST', { expectedUpdatedAt: 0 }), { params: Promise.resolve({ id: other }) });
  assert.equal(firstPublication.status, 200, 'Explicitly publishing the default profile is allowed before a customization save');
  assert.equal((await deps.getPublicProductPage('someone-elses-product')).product.id, other);
  console.log('Passed: owner/auth/CSRF/revision guards; separate draft/public snapshots; safe curriculum summaries without private lessons/files/scripts/meeting links; hidden creator/location/content settings; HTTPS-only links; owned completed raster images, actual signatures, voice isolation, exact published image access and unpublish revocation; real live paid buyer-only reviews, cookie/sign-in entitlement, no self/test/free/pending/revoked reviews, dedupe, no email/order leakage, and refund-aware public ratings. No Stripe or AI network calls.');
  console.log('QA records retained: ' + root);
} finally { storage.close(); }
