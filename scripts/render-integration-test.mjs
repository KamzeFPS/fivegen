import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
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
const termsVersion = readFileSync('lib/terms.ts', 'utf8').match(/TERMS_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
assert.ok(termsVersion, 'Read the current Terms version from its source of truth');
async function launch() {
  output = '';
  processHandle = spawn(process.execPath, ['runtime/render/server.mjs'], {
    // Never inherit provider/payment credentials or an enabled email worker
    // from the developer's environment into an integration-test child.
    env: { PATH: process.env.PATH, NODE_ENV: 'production', APP_ORIGIN: base, PORT: String(port), FIVEGEN_RUNTIME: 'render',
      FIVEGEN_DATA_DIR: root, GOOGLE_CLIENT_ID: 'local-test', GOOGLE_CLIENT_SECRET: 'local-test',
      CREDENTIAL_ENCRYPTION_KEY: 'local-test-encryption-value-'.repeat(2),
      STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'sk_live_integration_fixture_not_a_key', STRIPE_WEBHOOK_SECRET: webhookSecret, STRIPE_BILLING_WEBHOOK_SECRET: '',
      STRIPE_COMMERCE_ENABLED: 'false', STRIPE_CONNECT_WEBHOOK_SECRET: '',
      RENDER_EXTERNAL_URL: 'https://fivegen-integration.onrender.com', PRODUCT_DOMAIN: '',DOCS_ORIGIN:'https://docs.fivegen.example',
      OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', FAL_KEY: '', RESEND_API_KEY: '', EMAIL_FROM: '',
      AUTOMATIONS_WORKER_ENABLED: 'false', AUTOMATION_DISPATCH_SECRET: '',
      PADDLE_ENVIRONMENT: 'sandbox', PADDLE_API_KEY: '', PADDLE_WEBHOOK_SECRET: '',
      ADMIN_EMAILS: 'admin@example.test', RENDER: '' },
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
function requestHost(host, path = '/',method='GET') {
  return new Promise((resolve, reject) => {
    const request = httpRequest(base + path, { method,headers: { host,cookie,'oai-authenticated-user-id':owner } }, response => {
      let body='';response.on('data',chunk=>body+=chunk);
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location,headers:response.headers,body }));
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
  const docs=await requestHost('docs.fivegen.example');assert.equal(docs.status,200);assert.equal(docs.headers['x-fivegen-surface'],'docs');assert.match(docs.body,/FiveGen/);assert.match(docs.body,/Search/);assert.equal(docs.headers['set-cookie'],undefined);
  for(const path of ['/api/workspace','/signin','/customer','/build/private'])assert.equal((await requestHost('docs.fivegen.example',path)).status,404,'Docs cannot reach application routes');
  assert.equal((await requestHost('docs.fivegen.example','/','POST')).status,405);assert.equal((await requestHost('docs.fivegen.example','/integrations/mcp')).status,200);assert.match((await requestHost('docs.fivegen.example','/robots.txt')).body,/Sitemap:/);assert.match((await requestHost('docs.fivegen.example','/sitemap.xml')).body,/<urlset/);

  const alias = await requestHost('fivegen-integration.onrender.com', '/?connect=mcp');
  assert.equal(alias.status, 308);
  assert.equal(alias.location, base + '/?connect=mcp');
  const signInReturnTo = '/customer?order=local-auth-return-fixture';
  const signInGateway = await fetch(base + '/signin-with-chatgpt?return_to=' + encodeURIComponent(signInReturnTo), { redirect: 'manual' });
  assert.equal(signInGateway.status, 303);
  assert.equal(signInGateway.headers.get('location'), '/signin?return_to=' + encodeURIComponent(signInReturnTo), 'Legacy sign-in links preserve the requested destination through the chooser');
  assert.equal(signInGateway.headers.getSetCookie().length, 0, 'The chooser does not start Google OAuth');
  const signIn = await fetch(base + '/signin-with-chatgpt?provider=google', { redirect: 'manual' });
  assert.equal(signIn.status, 302);
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
  await json('/api/workspace','GET',undefined,true,428);
  const welcomePath = '/welcome?return_to=' + encodeURIComponent('/?view=overview');
  const welcome = await fetch(base + welcomePath, { headers: { cookie }, redirect: 'manual' });
  assert.equal(welcome.status, 200, 'An unaccepted account can review onboarding');
  const welcomeHtml = await welcome.text();
  const consentForm = welcomeHtml.match(/<form\b[^>]*>([\s\S]*?)<\/form>/)?.[1];
  assert.ok(consentForm, 'The rendered welcome page includes the consent form');
  const checkbox = consentForm.match(/<input\b(?=[^>]*\btype="checkbox")[^>]*>/)?.[0];
  assert.ok(checkbox, 'Consent requires an explicit checkbox');
  assert.ok(!/\bchecked(?:=|\s|>)/.test(checkbox), 'Consent is never preselected');
  assert.match(consentForm, /<button\b[^>]*\bdisabled(?:=|\s|>)/, 'Submission starts disabled until the user agrees');
  // Read the value serialized into the actual rendered client component, not
  // just the server constant. This catches a missing/stale server-to-client
  // version contract that direct API tests would otherwise skip.
  const serializedWelcome = welcomeHtml.replace(/&quot;/g, '"').replace(/\\"/g, '"');
  const renderedVersions = [...new Set([...serializedWelcome.matchAll(/"termsVersion"\s*:\s*"([a-zA-Z0-9-]+)"/g)].map(match => match[1]))];
  assert.deepEqual(renderedVersions, [termsVersion], 'The welcome component receives exactly the current Terms version');
  const submittedVersion = renderedVersions[0];
  assert.equal((await json('/api/terms')).accepted, false, 'Rendering welcome never records acceptance');
  assert.equal(storage.sqlite.prepare('SELECT COUNT(*) AS count FROM terms_acceptances WHERE owner=?').get(owner).count, 0);
  await json('/api/workspace','GET',undefined,true,428);
  await json('/api/terms','POST',{accepted:false,version:submittedVersion},true,400);
  await json('/api/terms','POST',{accepted:true,version:'2026-09-13-studio'},true,400);
  assert.equal((await json('/api/terms')).accepted, false, 'Rejected checkbox or stale-version submissions do not grant access');
  await json('/api/terms','POST',{accepted:true,version:submittedVersion});
  assert.equal((await json('/api/terms')).accepted,true);
  const acceptedWelcome = await fetch(base + welcomePath, { headers: { cookie }, redirect: 'manual' });
  assert.ok([303,307].includes(acceptedWelcome.status), 'Accepted users continue past onboarding');
  assert.equal(new URL(acceptedWelcome.headers.get('location'), base).href, base + '/?view=overview');
  await json('/api/admin', 'GET', undefined, true, 403);
  assert.equal((await fetch(base+'/terms')).status,200);
  await json('/api/billing','POST',{action:'upgrade'},true,410);
  const workspace = await json('/api/workspace'); assert.equal(workspace.products.length, 0);
  await json('/api/products', 'POST', { title: 'Legacy product price', description: 'Checkout prices belong to explicit commerce settings, not private product creation.',
    audience: 'Local test audience', format: 'Guide', color: 'orange', price: 49 }, true, 400);
  assert.equal((await json('/api/workspace')).products.length, 0, 'Rejected input does not create a product');
  let { product } = await json('/api/products', 'POST', { title: 'Render production test', description: 'A useful private test guide for checking durable publishing and delivery.',
    audience: 'Local test audience', format: 'Guide', color: 'orange', price: 0, generationMode: 'auto' });
  assert.equal(product.content.sections.length, 1);
  assert.equal(product.content.sections[0].body, '');
  assert.deepEqual(product.content.benefits, []);
  assert.equal(product.status, 'draft');
  assert.equal(storage.sqlite.prepare('SELECT COUNT(*) AS count FROM generation WHERE product_id=?').get(product.id).count, 0, 'Even legacy auto requests create a creator-authored workspace without calling AI');
  const productInput = value => { const { commerce, experience, ...fields } = value; return { ...fields, expectedUpdatedAt: value.updatedAt }; };
  await json('/api/products/' + product.id, 'PATCH', { ...productInput(product), status: 'published' }, true, 410);
  const marker = 'PRIVATE RENDER CONTENT ' + randomBytes(12).toString('hex');
  product.content.sections[0].body = marker;
  product = (await json('/api/products/' + product.id, 'PATCH', productInput(product))).product;
  assert.equal((await fetch(base + '/api/products/' + product.id + '/bundle')).status, 401, 'Private bundles require authentication');
  const bundle = await fetch(base + '/api/products/' + product.id + '/bundle', { headers: { cookie } });
  assert.equal(bundle.status, 200);
  const files = unzipSync(new Uint8Array(await bundle.arrayBuffer()));
  assert.ok(Object.values(files).some(bytes => strFromU8(bytes).includes(marker)), 'Export contains the saved product');
  assert.ok(!Object.keys(files).some(name => name.startsWith('03-marketing/')), 'Exports do not invent empty marketing deliverables');
  await json('/api/products/' + product.id, 'PATCH', { ...productInput(product), expectedUpdatedAt: product.updatedAt - 1 }, true, 409);
  const paidPage = await fetch(base + '/p/' + product.slug);
  assert.equal(paidPage.status, 410); assert.ok(!(await paidPage.text()).includes(marker));
  assert.equal((await fetch(base + '/api/download/' + product.slug)).status, 403);
  await json('/api/quote', 'POST', { slug: product.slug }, false, 410);
  await json('/api/checkout', 'POST', { slug: product.slug, email: 'buyer@example.test' }, false, 410);
  for (const path of ['/f/legacy', '/api/crm', '/api/connect/stripe', '/api/referrals']) assert.equal((await fetch(base + path)).status, 410, 'Retired seller routes remain unavailable');
  const connection = await json('/api/commerce/connect'); assert.equal(connection.enabled, false); assert.equal(connection.connected, false);
  await json('/api/commerce/connect', 'POST', { country: 'US', productId: product.id }, true, 503);
  await json('/api/commerce/checkout', 'POST', { slug: product.slug, email: 'buyer@example.test', requestId: crypto.randomUUID() }, false, 503);
  assert.equal(storage.sqlite.prepare('SELECT COUNT(*) AS count FROM commerce_orders').get().count, 0, 'Disabled creator commerce cannot create checkout intents');
  await json('/api/automations/dispatch', 'POST', {}, false, 401);
  // The creator can explicitly publish reviewed growth copy while lessons,
  // scripts, and research remain private in the product workspace.
  const growthPath = '/api/products/' + product.id + '/growth';
  const { growth: initialGrowth } = await json(growthPath);
  const landing = { headline: 'A practical guide from a working creator', subheadline: 'Review the offer before joining.', body: 'Deliberately reviewed public landing copy.', benefits: ['A useful next step'], ctaLabel: 'Request details', thankYou: 'Thank you for your interest.' };
  const { growth } = await json(growthPath, 'PATCH', { brief: { ...initialGrowth.brief, story: 'PRIVATE RENDER STORY' }, assets: { vsl: 'PRIVATE RENDER SCRIPT', landing, followUp: 'PRIVATE RENDER FOLLOWUP' }, expectedUpdatedAt: initialGrowth.updatedAt });
  const { funnel } = await json(growthPath + '/publish', 'POST', { expectedUpdatedAt: 0, expectedGrowthUpdatedAt: growth.updatedAt, creatorVslUploadId: null });
  const growthPage = await fetch(base + '/g/' + funnel.slug); assert.equal(growthPage.status, 200); assert.match(growthPage.headers.get('cache-control') || '', /no-store/);
  const growthHtml = await growthPage.text(); assert.ok(growthHtml.includes(landing.headline));
  for (const privateValue of [marker, 'PRIVATE RENDER STORY', 'PRIVATE RENDER SCRIPT', 'PRIVATE RENDER FOLLOWUP']) assert.ok(!growthHtml.includes(privateValue), 'Only the explicit landing snapshot is public');
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
  assert.equal((await fetch(base + '/g/' + funnel.slug)).status, 200, 'Published growth snapshot survives restart');
  product = (await json('/api/products/' + product.id, 'PATCH', { ...productInput(product), description: 'Updated after restart while lessons and generated assets remain private.' })).product;
  const persistedBundle = await fetch(base + '/api/products/' + product.id + '/bundle', { headers: { cookie } }); assert.equal(persistedBundle.status, 200);
  assert.ok(Object.values(unzipSync(new Uint8Array(await persistedBundle.arrayBuffer()))).some(bytes => strFromU8(bytes).includes(marker)), 'Private saved content survives restart and remains exportable');
  await json(growthPath + '/publish', 'DELETE');
  assert.equal((await fetch(base + '/g/' + funnel.slug)).status, 404, 'Unpublish revokes the public snapshot');
  await json('/api/checkout', 'POST', { slug: product.slug, email: 'buyer@example.test' }, false, 410);
  assert.equal((await fetch(base + '/api/download/' + product.slug + '?token=unverified')).status, 403, 'A zero-price private product never becomes a legacy free download');
  // Exercise the new publication gate through the real production HTTP
  // handlers, independently of the legacy private-product/growth flows above.
  let builder = await json('/api/builder','POST',{type:'guide',source:'manual',requestId:crypto.randomUUID()},true,201);
  const builderPath='/api/builder/'+builder.product.id,editorialEvidence='PRIVATE EDITORIAL SOURCE MEMO '+randomBytes(8).toString('hex');
  builder=await json(builderPath,'PATCH',{expectedVersion:builder.version,draft:{...builder.draft,title:'A reviewed original project guide',description:'A complete practical guide to planning a small original project.',audience:'Independent makers',fields:{...builder.draft.fields,outcome:'Prepare a clear brief and a useful first draft.'},sections:[{id:crypto.randomUUID(),title:'Plan a useful first draft',body:'For example, this illustrative practice log recorded 42 tasks in 2025. Write a one-page brief that names the audience, the intended outcome, and the first useful deliverable. Compare your draft against these requirements and identify one concrete improvement before sharing it.'}]}});
  await json(builderPath+'/publish','POST',{expectedVersion:builder.version},true,409);
  await json(builderPath+'/review','GET',undefined,false,401);
  let editorial=await json(builderPath+'/review');assert.equal(editorial.approved,false);assert.ok(editorial.findings.length>0);
  const editorialStamp=()=>({expectedVersion:editorial.version,fingerprint:editorial.fingerprint,expectedUpdatedAt:editorial.updatedAt});
  editorial=await json(builderPath+'/review','POST',{...editorialStamp(),action:'record',findingId:editorial.findings[0].id,status:'confirmed',note:'This is a clearly labeled illustrative practice log, checked in its full context.',evidence:editorialEvidence});
  if(editorial.summary.remaining)editorial=await json(builderPath+'/review','POST',{...editorialStamp(),action:'acknowledge-all',note:'Read each remaining prompt and checked this synthetic original test manuscript.',attested:true});
  editorial=await json(builderPath+'/review','POST',{...editorialStamp(),action:'approve',note:'Read the complete saved guide and checked all factual and illustrative passages.',attested:true});assert.equal(editorial.approved,true);
  builder=await json(builderPath+'/publish','POST',{expectedVersion:builder.version});const publishedTitle=builder.draft.title,builderPage=await fetch(base+'/b/'+builder.product.slug),builderHtml=await builderPage.text();assert.equal(builderPage.status,200);assert.ok(builderHtml.includes(publishedTitle));assert.ok(!builderHtml.includes(editorialEvidence),'Private review evidence never reaches the public sales page');
  builder=await json(builderPath,'PATCH',{expectedVersion:builder.version,draft:{...builder.draft,title:'A new saved title awaiting another review'}});assert.equal((await json(builderPath+'/review')).approved,false);await json(builderPath+'/publish','POST',{expectedVersion:builder.version},true,409);assert.ok((await (await fetch(base+'/b/'+builder.product.slug)).text()).includes(publishedTitle),'An unreviewed revision preserves the already-published offer');
  console.log('Passed: actual Render production server, authentication and current terms, private creator-authored products, explicit growth publication/unpublication, scoped bundles/media, Stripe signature/mode checks, disabled Connect fail-closed behavior, retired routes, MCP discovery, and database/media/session persistence across restart. Isolated credentials; no provider requests, email sends, or payments.');
} finally {
  await stop(); storage?.close();
  const fixture = resolve(root);
  assert.equal(dirname(fixture), resolve(tmpdir()));
  assert.match(basename(fixture), /^fivegen-production-/);
  rmSync(fixture, { recursive: true, force: true });
}
