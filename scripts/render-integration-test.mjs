import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { randomBytes, createHmac } from 'node:crypto';
import { createStorage } from '../runtime/render/storage.mjs';
import { digest } from '../runtime/render/auth.mjs';
import { unzipSync, strFromU8 } from 'fflate';

const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = 'http://127.0.0.1:' + port;
const root = mkdtempSync(join(tmpdir(), 'fivegen-production-'));
let processHandle, output = '', storage;
const value = randomBytes(32).toString('base64url');
const owner = 'google:render-integration-user';
const cookie = 'fivegen-local-session=' + value;
const webhookSecret = 'whsec_local_integration_fixture';
async function launch() {
  output = '';
  processHandle = spawn(process.execPath, ['runtime/render/server.mjs'], {
    env: { ...process.env, NODE_ENV: 'production', APP_ORIGIN: base, PORT: String(port), FIVEGEN_RUNTIME: 'render',
      FIVEGEN_DATA_DIR: root, GOOGLE_CLIENT_ID: 'local-test', GOOGLE_CLIENT_SECRET: 'local-test',
      CREDENTIAL_ENCRYPTION_KEY: 'local-test-encryption-value-'.repeat(2),
      STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'sk_live_integration_fixture_not_a_key', STRIPE_WEBHOOK_SECRET: webhookSecret, STRIPE_BILLING_WEBHOOK_SECRET: '',
      RENDER_EXTERNAL_URL: 'https://fivegen-integration.onrender.com', PRODUCT_DOMAIN: '',
      OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', FAL_KEY: '', ADMIN_EMAILS: 'admin@example.test', RENDER: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processHandle.stdout.on('data', data => output += data);
  processHandle.stderr.on('data', data => output += data);
  for (let i = 0; i < 100; i++) {
    if (processHandle.exitCode !== null) throw new Error(output);
    try { if ((await fetch(base + '/healthz')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Production startup timed out: ' + output);
}
async function stop() {
  if (!processHandle || processHandle.exitCode !== null) return;
  const exit = once(processHandle, 'exit');
  processHandle.kill('SIGTERM'); await exit;
}
async function json(path, method = 'GET', body, authenticated = true, status = 200) {
  const response = await fetch(base + path, { method, redirect: 'manual',
    headers: { origin: base, ...(authenticated ? { cookie } : {}), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${path}: ${text.slice(0, 350)}\n${output.slice(-1500)}`);
  return JSON.parse(text);
}
function requestHost(host, path = '/') {
  return new Promise((resolve, reject) => {
    const request = httpRequest(base + path, { headers: { host } }, response => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location }));
    });
    request.on('error', reject); request.end();
  });
}
try {
  storage = createStorage(root);
  storage.sqlite.prepare('INSERT INTO render_sessions VALUES (?,?,?,?,?)').run(digest(value), owner, 'creator@example.test', 'Creator', Date.now() + 3600000);
  await launch();
  const home = await fetch(base);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.ok(!/Sample data|DEMO WORKSPACE|olivia@example.com|12,845/.test(html), 'Public workspace contains no demonstration metrics');
  assert.equal(home.headers.get('x-frame-options'), 'DENY');
  const misdirected = await requestHost('attacker.example');
  assert.equal(misdirected.status, 421, 'Unknown hosts stay blocked');
  const alias = await requestHost('fivegen-integration.onrender.com', '/?connect=mcp');
  assert.equal(alias.status, 308);
  assert.equal(alias.location, base + '/?connect=mcp');
  const signIn = await fetch(base + '/signin-with-chatgpt', { redirect: 'manual' });
  assert.equal(new URL(signIn.headers.get('location')).searchParams.get('redirect_uri'), base + '/callback');
  async function event(livemode, valid = true) {
    const body = JSON.stringify({ id: 'evt_local_' + livemode, type: 'integration.noop', livemode, data: { object: {} } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', webhookSecret).update(timestamp + '.' + body).digest('hex');
    return fetch(base + '/api/webhooks/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${valid ? signature : '0'.repeat(64)}` }, body });
  }
  assert.equal((await event(true)).status, 200, 'Signed live events are accepted');
  assert.equal((await event(false)).status, 400, 'Test events cannot enter the live payment environment');
  assert.equal((await event(true, false)).status, 400, 'Unsigned events are rejected');
  await json('/api/workspace', 'GET', undefined, false, 401);
  const spoof = await fetch(base + '/api/workspace', { headers: { 'oai-authenticated-user-id': owner,
    'oai-authenticated-user-email': 'admin@example.test', cookie: '__sites_local_auth=1', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' } });
  assert.equal(spoof.status, 401);
  await json('/api/admin', 'GET', undefined, true, 403);
  const workspace = await json('/api/workspace'); assert.equal(workspace.products.length, 0);
  await json('/api/products', 'POST', { title: 'Unavailable AI', description: 'This request must not turn into a generic starter product.',
    audience: 'Local test audience', format: 'Guide', color: 'orange', price: 0 }, true, 503);
  assert.equal((await json('/api/workspace')).products.length, 0, 'Unavailable AI does not create or consume a product slot');
  let { product } = await json('/api/products', 'POST', { title: 'Render production test', description: 'A useful private test guide for checking durable publishing and delivery.',
    audience: 'Local test audience', format: 'Guide', color: 'orange', price: 49, generationMode: 'manual' });
  assert.equal(product.content.sections.length, 1);
  assert.equal(product.content.sections[0].body, '');
  assert.deepEqual(product.content.benefits, []);
  await json('/api/products/' + product.id, 'PATCH', { ...product, status: 'published' }, true, 409);
  const marker = 'PRIVATE RENDER CONTENT ' + randomBytes(12).toString('hex');
  product.content.sections[0].body = marker;
  product = (await json('/api/products/' + product.id, 'PATCH', { ...product, status: 'published' })).product;
  const bundle = await fetch(base + '/api/products/' + product.id + '/bundle', { headers: { cookie } });
  assert.equal(bundle.status, 200);
  const files = unzipSync(new Uint8Array(await bundle.arrayBuffer()));
  assert.ok(Object.values(files).some(bytes => strFromU8(bytes).includes(marker)), 'Export contains the saved product');
  assert.ok(!Object.keys(files).some(name => name.startsWith('03-marketing/')), 'Exports do not invent empty marketing deliverables');
  await json('/api/products/' + product.id, 'PATCH', { ...product, expectedUpdatedAt: product.updatedAt - 1 }, true, 409);
  const paidPage = await fetch(base + '/p/' + product.slug);
  assert.equal(paidPage.status, 200); assert.ok(!(await paidPage.text()).includes(marker));
  assert.equal((await fetch(base + '/api/download/' + product.slug)).status, 403);
  const quote = await json('/api/quote', 'POST', { slug: product.slug }, false);
  assert.equal(quote.total, 4900);
  const checkout = await fetch(base + '/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: product.slug }) });
  assert.ok([409, 503].includes(checkout.status), 'Paid checkout requires Stripe configuration');
  const crossOrigin = await fetch(base + '/api/products/' + product.id, { method: 'PATCH', headers: { cookie, origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify(product) });
  assert.equal(crossOrigin.status, 403);
  const assetId = 'render-test-asset', objectKey = owner + '/' + assetId;
  await storage.BUCKET.put(objectKey, new Blob(['private image bytes']).stream());
  storage.sqlite.prepare('INSERT INTO assets (id,owner,product_id,kind,name,prompt,status,object_key,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(assetId, owner, product.id, 'image', 'Private cover', 'Test', 'completed', objectKey, Date.now());
  assert.equal((await fetch(base + '/api/assets/' + assetId + '/file')).status, 401);
  const image = await fetch(base + '/api/assets/' + assetId + '/file', { headers: { cookie } });
  assert.equal(image.status, 200); assert.equal(await image.text(), 'private image bytes');
  const metadata = await json('/.well-known/oauth-authorization-server', 'GET', undefined, false);
  assert.equal(metadata.issuer, base);
  const mcp = await fetch(base + '/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(mcp.status, 401); assert.ok(mcp.headers.get('www-authenticate').includes(base));
  await stop(); await launch();
  assert.equal((await json('/api/workspace')).products[0].id, product.id, 'Product and sign-in survive restart');
  const persistedImage = await fetch(base + '/api/assets/' + assetId + '/file', { headers: { cookie } });
  assert.equal(await persistedImage.text(), 'private image bytes');
  product = (await json('/api/products/' + product.id, 'PATCH', { ...product, price: 0 })).product;
  const free = await json('/api/checkout', 'POST', { slug: product.slug, email: 'buyer@example.test' }, false);
  const purchase = new URL(free.url);
  assert.equal(purchase.origin, base);
  const delivery = await fetch(base + '/api/download/' + product.slug + '?token=' + purchase.searchParams.get('token'));
  assert.equal(delivery.status, 200); assert.equal(delivery.headers.get('content-type'), 'application/zip');
  console.log('Passed: actual Render production server, authentication boundary, product create/edit/publish, private content/media, Stripe gating, free delivery, MCP discovery, and database/media/session persistence across restart. No provider requests or payments.');
} finally {
  await stop(); storage?.close(); rmSync(root, { recursive: true, force: true });
}
