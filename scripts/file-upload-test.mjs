import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import ts from 'typescript';
import { createStorage } from '../runtime/render/storage.mjs';
import { fileSalePdfFixture } from './file-sale-pdf-fixture.mjs';

// Synthetic local fixtures only. Keep this isolated database and its lifecycle
// records for review; no external storage, providers, accounts or secrets.
const root = resolve('outputs/file-upload-qa', randomUUID());
const storage = createStorage(root), sql = storage.sqlite;
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const owner = 'file-fixture-owner', productId = randomUUID();
let currentUser = { userId: owner }, storageMode = 'normal', telemetryFailure = false;
const bucket = {
  async put(...args) {
    if (storageMode === 'write-failure') throw new Error('Private internal storage diagnostic must not escape');
    return storage.BUCKET.put(...args);
  },
  async get(key) {
    const state = sql.prepare('SELECT status FROM uploads WHERE object_key=?').get(key);
    if (state) assert.equal(state.status, 'processing', 'Persisted bytes are checked before readiness');
    if (storageMode === 'missing') return null;
    const stored = await storage.BUCKET.get(key);
    if (storageMode === 'corrupt' && stored) {
      const bytes = new Uint8Array(await new Response(stored.body).arrayBuffer());
      bytes[Math.floor(bytes.length / 2)] ^= 1;
      return { size: bytes.length, body: new Blob([bytes]).stream() };
    }
    if (storageMode === 'expired' && stored) sql.prepare("UPDATE uploads SET status='failed',validation_error='Synthetic expiry' WHERE object_key=?").run(key);
    return stored;
  },
  delete: key => storage.BUCKET.delete(key),
};
const dependencies = {
  createHash, ApiError, env: { BUCKET: bucket }, database: () => ({
    prepare: statement => { if (telemetryFailure && statement.includes('INSERT OR IGNORE INTO file_sale_events')) throw new Error('Synthetic telemetry unavailable'); return storage.DB.prepare(statement); },
    batch: statements => storage.DB.batch(statements),
  }),
  uploadLimit: 100 * 1024 * 1024, storageLimit: 2 * 1024 * 1024 * 1024,
  identity: async () => { if (!currentUser) throw new ApiError('Sign in.', 401); return currentUser; },
  ownedProduct: async (id, user) => { const row = sql.prepare('SELECT * FROM products WHERE id=? AND owner=?').get(id, user); if (!row) throw new ApiError('Product not found.', 404); return row; },
  sameOrigin: request => { if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('Origin rejected.', 403); },
  failure: error => Response.json({ error: error.message }, { status: error.status || 500 }),
};
async function load(path) {
  const key = 'uploadQa' + randomUUID().replaceAll('-', '');
  globalThis[key] = { ...dependencies };
  const source = readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(dependencies).join(',')}} = globalThis.${key};\n` + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  delete globalThis[key]; return module;
}

try {
  const columns = sql.prepare('PRAGMA table_info(uploads)').all().map(column => column.name);
  for (const name of ['sha256', 'validation_error', 'updated_at']) assert.ok(columns.includes(name), `Additive upload migration includes ${name}`);
  sql.prepare('INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(productId, owner, 'fixture-' + productId, 'Synthetic playbook', 'A private validation fixture.', 'Test readers', 'Playbook', 0, 'orange', '{"sections":[],"benefits":[],"launch":""}', 'draft', Date.now(), Date.now());
  sql.prepare('INSERT INTO file_sale_drafts (product_id,version,data) VALUES (?,1,?)').run(productId, JSON.stringify({ title: 'Upload fixture', description: 'Retained upload tests', currency: 'usd', priceCents: 1900, modules: [] }));
  Object.assign(dependencies, await load('lib/upload-validation.ts'));
  const route = await load('app/api/products/[id]/uploads/route.ts'), pdf = fileSalePdfFixture();
  const params = { params: Promise.resolve({ id: productId }) };
  async function upload(bytes = pdf, options = {}) {
    const body = options.body || bytes;
    const request = new Request('http://localhost/api/products/' + productId + '/uploads?name=' + encodeURIComponent(options.name || 'playbook.pdf'), {
      method: 'POST', headers: { origin: options.origin || 'http://localhost', 'content-type': options.mime || 'application/pdf', 'x-file-size': String(options.size ?? bytes.length) }, body, duplex: 'half',
    });
    const response = await route.POST(request, params);
    return { status: response.status, data: await response.json() };
  }
  const count = () => sql.prepare('SELECT COUNT(*) n FROM uploads').get().n;
  const latest = () => sql.prepare('SELECT * FROM uploads ORDER BY rowid DESC LIMIT 1').get();
  const ok = await upload(); assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.upload.status, 'completed');
  assert.equal(ok.data.upload.sha256, createHash('sha256').update(pdf).digest('hex'));
  const completed = sql.prepare('SELECT * FROM uploads WHERE id=?').get(ok.data.upload.id);
  const saved = await storage.BUCKET.get(completed.object_key);
  assert.deepEqual(Buffer.from(await new Response(saved.body).arrayBuffer()), pdf, 'The original PDF bytes are preserved');
  assert.equal(completed.validation_error, null);
  const eventsFor = id => sql.prepare('SELECT event,detail FROM file_sale_events WHERE id IN (?,?,?) ORDER BY event').all('upload_started:' + id, 'upload_completed:' + id, 'upload_failed:' + id);
  assert.deepEqual(eventsFor(completed.id).map(event => event.event), ['upload_completed', 'upload_started']);
  assert.ok(eventsFor(completed.id).every(event => event.detail === '{"stage":"product","mode":"upload"}'));

  const split = new ReadableStream({ start(controller) { for (const byte of pdf) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  assert.equal((await upload(pdf, { body: split })).status, 201, 'Header and EOF may cross network chunks');
  const longName = await upload(pdf, { name: 'Long-playbook-title-'.repeat(12) + '.pdf' });
  assert.equal(longName.status, 201); assert.equal(longName.data.upload.name.length, 150); assert.ok(longName.data.upload.name.endsWith('.pdf'));
  for (const options of [{ name: 'not-a-pdf.txt' }, { mime: 'text/plain' }, { size: dependencies.uploadLimit + 1 }, { size: 0 }, { mime: 'application/zip' }]) {
    const before = count(), result = await upload(pdf, options);
    assert.ok([400, 413].includes(result.status), JSON.stringify(result));
    assert.equal(count(), before, 'Metadata rejection does not reserve storage');
  }
  for (const [bytes, options, status] of [
    [Buffer.from('renamed plain text'), {}, 400],
    [pdf.subarray(0, pdf.length - 10), {}, 400],
    [pdf, { size: pdf.length + 1 }, 400],
    [pdf, { size: pdf.length - 1 }, 413],
  ]) {
    assert.equal((await upload(bytes, options)).status, status);
    assert.equal(latest().status, 'failed'); assert.equal(latest().sha256, null);
    assert.ok(latest().validation_error); assert.equal(await storage.BUCKET.get(latest().object_key), null);
    assert.deepEqual(eventsFor(latest().id).map(event => event.event), ['upload_failed', 'upload_started']);
  }
  const broken = new ReadableStream({ start(controller) { controller.enqueue(pdf.subarray(0, 20)); controller.error(new Error('Connection terminated')); } });
  assert.equal((await upload(pdf, { body: broken })).status, 503);
  assert.equal(latest().status, 'failed');
  for (const mode of ['write-failure', 'missing', 'corrupt']) {
    storageMode = mode; const result = await upload(); assert.equal(result.status, 503);
    assert.equal(latest().status, 'failed'); assert.equal(latest().sha256, null);
    assert.ok(!result.data.error.includes('internal')); assert.equal(await storage.BUCKET.get(latest().object_key), null);
  }
  storageMode = 'normal';
  storageMode = 'expired'; assert.equal((await upload()).status, 409); assert.equal(latest().status, 'failed');
  assert.equal(await storage.BUCKET.get(latest().object_key), null, 'Late requests cannot revive failed validation'); storageMode = 'normal';
  assert.equal((await upload(Buffer.from('existing video upload behavior'), { mime: 'video/mp4', name: 'lesson.mp4' })).status, 201);
  currentUser = { userId: 'foreign-workspace' };
  const beforeForeign = count(); assert.equal((await upload()).status, 404); assert.equal(count(), beforeForeign);
  const deniedList = await route.GET(new Request('http://localhost/api/products/' + productId + '/uploads'), params); assert.equal(deniedList.status, 404);
  currentUser = null; assert.equal((await upload()).status, 401); currentUser = { userId: owner };
  assert.equal((await upload(pdf, { origin: 'https://foreign.example' })).status, 403);

  // Failed attempts retain evidence without permanently consuming the quota.
  sql.prepare('INSERT INTO uploads (id,owner,product_id,name,mime,size,object_key,status,created_at,updated_at,validation_error) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(randomUUID(), owner, productId, 'failed-fixture.pdf', 'application/pdf', dependencies.storageLimit, 'fixture-failed-no-object', 'failed', Date.now(), Date.now(), 'Synthetic failed reservation');
  const staleId = randomUUID();
  sql.prepare('INSERT INTO uploads (id,owner,product_id,name,mime,size,object_key,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(staleId, owner, productId, 'interrupted-fixture.pdf', 'application/pdf', dependencies.storageLimit, 'fixture-interrupted-no-object', 'processing', Date.now() - 31 * 60 * 1000, Date.now() - 31 * 60 * 1000);
  assert.equal((await upload()).status, 201);
  assert.equal(sql.prepare('SELECT status FROM uploads WHERE id=?').get(staleId).status, 'failed', 'Stale processing is recoverable and releases its quota reservation');
  const list = await route.GET(new Request('http://localhost/api/products/' + productId + '/uploads'), params);
  assert.equal(list.headers.get('cache-control'), 'private, no-store');
  const listed = (await list.json()).uploads;
  assert.ok(listed.some(item => item.status === 'failed' && item.validation_error));
  assert.ok(!listed.some(item => 'object_key' in item || 'owner' in item));
  telemetryFailure = true;
  const telemetrySafe = await upload(); assert.equal(telemetrySafe.status, 201, 'Analytics failure cannot fail a verified upload');
  const telemetryRow = sql.prepare('SELECT * FROM uploads WHERE id=?').get(telemetrySafe.data.upload.id);
  assert.equal(telemetryRow.status, 'completed');
  assert.deepEqual(Buffer.from(await new Response((await storage.BUCKET.get(telemetryRow.object_key)).body).arrayBuffer()), pdf, 'Analytics failure cannot delete verified bytes');
  telemetryFailure = false;
  assert.equal(sql.prepare('SELECT status FROM uploads WHERE id=?').get(completed.id).status, 'completed', 'Later failed uploads preserve prior successful files');
  console.log('Passed: valid binary PDF integrity, chunk boundaries, filename/MIME mismatch, oversize, interrupted upload, failed storage and corruption, retained failure history, quota recovery, private metadata and tenant isolation. Synthetic local fixtures retained at ' + root);
} finally { storage.close(); }
