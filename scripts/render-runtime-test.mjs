import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createStorage } from '../runtime/render/storage.mjs';
import { createAuth, digest, safeReturn, verifyGoogleToken } from '../runtime/render/auth.mjs';
import { readConfig } from '../runtime/render/server.mjs';

test('Render storage preserves migrations, atomic batches, and private media across restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fivegen-storage-'));
  let storage;
  try {
    storage = createStorage(root);
    const count = storage.sqlite.prepare('SELECT COUNT(*) n FROM fivegen_migrations').get().n;
    assert.ok(count >= 5);
    assert.ok(!storage.sqlite.prepare('PRAGMA table_info(products)').all().some(c => c.name === 'whop_url'));
    await storage.DB.prepare('INSERT INTO sellers (owner,name,created_at) VALUES (?,?,?)').bind('owner', 'Persisted studio', 1).run();
    await assert.rejects(() => storage.DB.batch([
      storage.DB.prepare('UPDATE sellers SET name=? WHERE owner=?').bind('Must roll back', 'owner'),
      storage.DB.prepare('INSERT INTO sellers (owner,name,created_at) VALUES (?,?,?)').bind('owner', 'Duplicate', 2),
    ]));
    assert.equal(await storage.DB.prepare('SELECT name FROM sellers WHERE owner=?').bind('owner').first('name'), 'Persisted studio');
    await storage.BUCKET.put('../../private.png', new Blob(['private media']).stream());
    storage.close();
    storage = createStorage(root);
    assert.equal(storage.sqlite.prepare('SELECT COUNT(*) n FROM fivegen_migrations').get().n, count);
    assert.equal((await storage.DB.prepare('SELECT * FROM sellers').all()).results.length, 1);
    const media = await storage.BUCKET.get('../../private.png');
    assert.equal(await new Response(media.body).text(), 'private media');
    assert.equal(media.size, 13);
    assert.equal(await storage.BUCKET.get('absent'), null);
    assert.throws(() => readFileSync(join(root, 'private.png')));
  } finally { storage?.close(); rmSync(root, { recursive: true, force: true }); }
});

test('Render configuration rejects insecure public origins and missing secrets', () => {
  const config = { APP_ORIGIN: 'https://fivegen.example', GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret',
    CREDENTIAL_ENCRYPTION_KEY: 'x'.repeat(32), FIVEGEN_DATA_DIR: '/var/data/fivegen' };
  assert.equal(readConfig(config).origin, config.APP_ORIGIN);
  assert.throws(() => readConfig({ ...config, APP_ORIGIN: 'http://fivegen.example' }));
  assert.throws(() => readConfig({ ...config, GOOGLE_CLIENT_SECRET: '' }));
  assert.throws(() => readConfig({ ...config, CREDENTIAL_ENCRYPTION_KEY: 'short' }));
  assert.throws(() => readConfig({ ...config, APP_ORIGIN: 'https://fivegen.example/redirect' }));
  const production = readConfig({ ...config, APP_ORIGIN: 'https://www.fivegen.ai', RENDER_EXTERNAL_URL: 'https://fivegen-example.onrender.com' });
  assert.equal(production.origin, 'https://www.fivegen.ai');
  assert.deepEqual([...production.redirectHosts].sort(), ['fivegen-example.onrender.com', 'fivegen.ai']);
  assert.throws(() => readConfig({ ...config, RENDER_EXTERNAL_URL: 'https://attacker.example' }));
  assert.equal(safeReturn('/\\evil.example'), '/');
  assert.equal(safeReturn('//evil.example'), '/');
  assert.equal(safeReturn('/oauth/authorize?client_id=abc'), '/oauth/authorize?client_id=abc');
});

test('Google OAuth validates signatures, browser state, nonce, PKCE, verified email, replay, sessions, and logout', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fivegen-auth-'));
  const storage = createStorage(root);
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'test'; jwk.alg = 'RS256';
  const keys = createLocalJWKSet({ keys: [jwk] });
  const tokens = new Map();
  const config = { origin: 'http://localhost', googleClientId: 'test-client', googleClientSecret: 'unused-test-secret' };
  const auth = createAuth(config, storage, {
    exchange: async (code, verifier) => {
      const item = tokens.get(code); assert.ok(item); assert.equal(digest(verifier), item.challenge); return item.jwt;
    },
    verify: (jwt, config, nonce) => verifyGoogleToken(jwt, config, nonce, keys),
  });
  const server = createServer(async (req, res) => {
    if (await auth.handle(req, res, new URL(req.url, config.origin))) return;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ id: req.headers['oai-authenticated-user-id'] || null }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  config.origin = base;
  const cookieFrom = response => response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const sign = async claims => new SignJWT({ sub: 'verified-user', email: 'kamzewac@gmail.com', email_verified: true, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer('https://accounts.google.com').setAudience(config.googleClientId)
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  try {
    const spoof = await fetch(base, { headers: { 'oai-authenticated-user-id': 'admin', 'oai-authenticated-user-email': 'kamzewac@gmail.com', cookie: '__sites_local_auth=1' } });
    assert.equal((await spoof.json()).id, null);
    const begin = await fetch(base + '/signin-with-chatgpt?return_to=/oauth/authorize?client_id=test', {
      redirect: 'manual', headers: { 'sec-fetch-site': 'cross-site' },
    });
    assert.equal(begin.status, 302, 'External MCP authorization can begin sign-in');
    const target = new URL(begin.headers.get('location'));
    assert.equal(target.origin, 'https://accounts.google.com');
    assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
    const state = target.searchParams.get('state'), nonce = target.searchParams.get('nonce');
    const flowCookie = cookieFrom(begin);
    tokens.set('ok', { jwt: await sign({ nonce }), challenge: target.searchParams.get('code_challenge') });
    const callback = base + '/callback?state=' + state + '&code=ok';
    assert.equal((await fetch(callback, { redirect: 'manual' })).status, 400, 'State cannot be used without its browser cookie');
    const complete = await fetch(callback, { redirect: 'manual', headers: { cookie: flowCookie } });
    assert.equal(complete.status, 303);
    assert.equal(complete.headers.get('location'), '/oauth/authorize?client_id=test');
    const sessionCookie = cookieFrom(complete);
    assert.equal((await (await fetch(base, { headers: { cookie: sessionCookie } })).json()).id, 'google:verified-user');
    assert.equal((await fetch(callback, { redirect: 'manual', headers: { cookie: flowCookie } })).status, 400, 'Authorization codes cannot be replayed');
    const stored = storage.sqlite.prepare('SELECT hash FROM render_sessions').get().hash;
    assert.ok(!sessionCookie.includes(stored), 'Sessions store only hashes');
    const crossLogout = await fetch(base + '/signout-with-chatgpt', { redirect: 'manual', headers: { cookie: sessionCookie, origin: 'https://evil.example' } });
    assert.equal(crossLogout.status, 403);
    const out = await fetch(base + '/signout-with-chatgpt', { redirect: 'manual', headers: { cookie: sessionCookie, origin: base } });
    assert.equal(out.status, 303);
    assert.equal((await (await fetch(base, { headers: { cookie: sessionCookie } })).json()).id, null);
    await assert.rejects(() => verifyGoogleToken(tokens.get('ok').jwt, config, 'wrong-nonce', keys));
    await assert.rejects(async () => verifyGoogleToken(await sign({ nonce, email_verified: false }), config, nonce, keys));
    await assert.rejects(() => verifyGoogleToken(tokens.get('ok').jwt, { ...config, googleClientId: 'other-client' }, nonce, keys));
    const pieces = tokens.get('ok').jwt.split('.');
    pieces[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(pieces[1], 'base64url')), email: 'attacker@example.com' })).toString('base64url');
    await assert.rejects(() => verifyGoogleToken(pieces.join('.'), config, nonce, keys), 'A modified identity cannot pass signature verification');
    const expired = randomBytes(32).toString('base64url');
    storage.sqlite.prepare('INSERT INTO render_sessions VALUES (?,?,?,?,?)').run(digest(expired), 'expired', 'test@example.com', 'Expired', Date.now() - 1);
    assert.equal((await (await fetch(base, { headers: { cookie: auth.sessionName + '=' + expired } })).json()).id, null);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    storage.close(); rmSync(root, { recursive: true, force: true });
  }
});
