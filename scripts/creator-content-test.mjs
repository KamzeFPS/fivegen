import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';

// Real schemas, API handlers and SQL; only identity and object storage are fixtures.
const sqlite = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
const stmt = (sql, args = []) => ({bind: (...values) => stmt(sql, values), first: async () => sqlite.prepare(sql).get(...args) || null, all: async () => ({results: sqlite.prepare(sql).all(...args)}), run: async () => ({meta: {changes: sqlite.prepare(sql).run(...args).changes}})});
const objects = new Map();
const bucket = {
  put: async (key, stream) => {const chunks = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); objects.set(key, Buffer.concat(chunks));},
  get: async (key, options) => {const data = objects.get(key); if (!data) return null; const range = options?.range; return {body: range ? data.subarray(range.offset, range.offset + range.length) : data};},
  delete: async key => {objects.delete(key);},
};
class ApiError extends Error {constructor(message, status = 400) {super(message); this.status = status;}}
let owner = 'creator';
const deps = {z, ApiError, env: {BUCKET: bucket}, database: () => ({prepare: stmt}), identity: async () => ({userId: owner, email: `${owner}@example.test`}), sameOrigin: request => {if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('Invalid origin', 403);}, failure: error => Response.json({error: error.message}, {status: error.status || (error.issues ? 400 : 500)}), ownedProduct: async (id, userId) => {const row = sqlite.prepare('SELECT * FROM products WHERE id=? AND owner=?').get(id, userId); if (!row) throw new ApiError('Product not found', 404); return row;}, productFromRow: row => ({...row, price: row.price / 100, content: JSON.parse(row.content), updatedAt: row.updated_at, createdAt: row.created_at}), orderItems: () => [], assertSubscriptionAccess: async () => {}};
async function load(path) {
  const key = 'creatorTest' + randomUUID().replaceAll('-', '');
  globalThis[key] = {...deps};
  const source = fs.readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(deps).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022}}).outputText;
  const result = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  delete globalThis[key];
  return result;
}
Object.assign(deps, await load('lib/product.ts'), await load('lib/experience.ts'));
Object.assign(deps, await load('lib/curriculum.ts'), await load('lib/access.ts'));
const patchRoute = await load('app/api/products/[id]/route.ts');
const uploadRoute = await load('app/api/products/[id]/uploads/route.ts');
const fileRoute = await load('app/api/uploads/[id]/route.ts');
const brief = {title: 'My recorded workshop', description: 'Creator-owned video lessons and supporting exercises.', audience: 'Independent creators', format: 'Video course', price: 0, color: 'orange'};
const section = {id: randomUUID(), title: 'A personal example', body: 'The creator’s own lesson notes.', category: 'Foundations'};
const content = {sections: [section], benefits: [], launch: ''};
function addProduct(user = owner) {
  const id = randomUUID();
  sqlite.prepare("INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,'orange',?,'draft',1,1)").run(id, user, id, brief.title, brief.description, brief.audience, brief.format, JSON.stringify(content));
  return id;
}
const row = id => sqlite.prepare('SELECT * FROM products WHERE id=?').get(id);
const patch = (id, nextContent, expectedUpdatedAt = row(id).updated_at) => patchRoute.PATCH(new Request(`https://local/api/products/${id}`, {method: 'PATCH', headers: {'content-type': 'application/json'}, body: JSON.stringify({...brief, content: nextContent, expectedUpdatedAt})}), {params: Promise.resolve({id})});
const remove = id => fileRoute.DELETE(new Request(`https://local/api/uploads/${id}`, {method: 'DELETE'}), {params: Promise.resolve({id})});
const get = (id, headers = {}) => fileRoute.GET(new Request(`https://local/api/uploads/${id}`, {headers}), {params: Promise.resolve({id})});
async function upload(id, body = new Uint8Array([1, 2, 3, 4]), size = body.byteLength, mime = 'video/mp4', purpose = 'product') {
  return uploadRoute.POST(new Request(`https://local/api/products/${id}/uploads?name=my-lesson.mp4&purpose=${purpose}`, {method: 'POST', headers: {'content-type': mime, 'x-file-size': String(size)}, body}), {params: Promise.resolve({id})});
}

try {
  for (const format of ['Video course', 'Consulting / Mentorship', 'Mini course', 'Coaching session', 'Community']) assert.equal(deps.briefSchema.parse({...brief, format}).format, format);
  assert.equal(deps.contentSchema.parse(content).sections[0].category, 'Foundations');
  assert.equal(deps.contentSchema.safeParse({...content, sections: [{...section, category: 'x'.repeat(81)}]}).success, false);
  assert.equal(deps.contentSchema.safeParse({...content, sections: [{...section, category: '  '}]}).success, false);
  assert.equal(deps.contentSchema.safeParse({...content, sections: [section, section]}).success, false, 'Lesson IDs remain unique');
  const legacy = deps.contentSchema.parse({...content, sections: [{title: 'Legacy lesson', body: ''}]});
  const identified = deps.withLessonIds(legacy.sections);
  assert.ok(identified[0].id); assert.equal(deps.withLessonIds(identified)[0].id, identified[0].id, 'Existing lesson identities survive further edits');
  const a = {...section, id: randomUUID()}, b = {...section, id: randomUUID(), category: 'Practice'}, c = {...section, id: randomUUID()};
  assert.deepEqual(deps.moveLesson([a, b, c], a.id, 1).map(item => item.id), [c.id, b.id, a.id], 'Moving a lesson preserves other modules');
  assert.deepEqual(deps.moveLessonGroup([a, b, c], 'Practice', -1).map(item => item.id), [b.id, a.id, c.id], 'Moving a module preserves its lesson order');
  const delayed = deps.attachLessonVideo([c, a, b], a.id, randomUUID());
  assert.ok(delayed[1].videoId); assert.equal(delayed[0].videoId, undefined, 'Late uploads attach to their captured identity after lesson reordering');

  const productId = addProduct(), secondProduct = addProduct(), otherProduct = addProduct('another-creator');
  let response = await upload(productId); assert.equal(response.status, 201, await response.clone().text());
  const recording = (await response.json()).upload;
  assert.equal(objects.size, 1);
  assert.equal((await upload(productId, new Uint8Array([1, 2]), 1)).status, 500, 'An oversized body is rejected and its reservation cleaned up');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM uploads WHERE status='uploading'").get().n, 0);
  assert.equal((await upload(productId, new Uint8Array([1]), 100 * 1024 * 1024 + 1)).status, 413);
  assert.equal((await upload(productId, new Uint8Array([1]), 1, 'video/quicktime')).status, 400);
  assert.equal((await upload(otherProduct)).status, 404, 'A creator cannot upload into another creator’s product');
  response = await patch(productId, {...content, sections: [{...section, videoId: recording.id}]});
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(JSON.parse(row(productId).content).sections[0].videoId, recording.id);
  assert.equal((await patch(secondProduct, {...content, sections: [{...section, videoId: recording.id}]})).status, 409, 'A recording cannot be attached to a different product, even with the same owner');
  owner = 'another-creator';
  assert.equal((await patch(otherProduct, {...content, sections: [{...section, videoId: recording.id}]})).status, 409, 'A creator cannot attach another creator’s recording');
  assert.equal((await get(recording.id)).status, 403, 'Recordings remain private to authorized viewers');
  assert.equal((await remove(recording.id)).status, 404, 'Another creator cannot delete a recording');
  owner = 'creator';
  assert.equal((await get(recording.id)).status, 200);
  response = await get(recording.id, {range: 'bytes=1-2'}); assert.equal(response.status, 206); assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [2, 3], 'Lesson videos support browser range playback');
  assert.equal((await remove(recording.id)).status, 409, 'An attached recording cannot be deleted');
  assert.equal((await patch(productId, content, 1)).status, 409, 'An old tab cannot replace newer lesson changes');
  assert.equal((await patch(productId, content)).status, 200);
  sqlite.prepare("INSERT INTO growth_funnels (product_id,owner,slug,landing,title,creator_vsl_upload_id,published_at,updated_at) VALUES (?,?,?,'{}',?,?,1,1)").run(productId, owner, randomUUID(), brief.title, recording.id);
  assert.equal((await remove(recording.id)).status, 409, 'A published VSL remains protected after detaching it from lessons');
  sqlite.prepare('UPDATE growth_funnels SET published_at=NULL WHERE product_id=?').run(productId);
  assert.equal((await remove(recording.id)).status, 200);
  assert.equal((await get(recording.id)).status, 404); assert.equal(objects.size, 0);
  response = await upload(productId, new Uint8Array([1, 2]), 2, 'video/mp4', 'voice'); assert.equal(response.status, 201); const voice = (await response.json()).upload;
  assert.ok(sqlite.prepare('SELECT object_key FROM uploads WHERE id=?').get(voice.id).object_key.startsWith('voice/'));
  assert.equal((await patch(productId, {...content, sections: [{...section, videoId: voice.id}]})).status, 409, 'Private creator voice media cannot become a lesson by referencing its ID');
  sqlite.prepare("UPDATE products SET status='published',commerce=? WHERE id=?").run(JSON.stringify({funnel:{enabled:true,blocks:[{visible:true,kind:'video',image:'/api/uploads/'+voice.id}]}}),productId);
  owner = 'another-creator'; assert.equal((await get(voice.id)).status, 404, 'Private voice prefix overrides even legacy public-video configuration'); owner = 'creator';
  assert.equal((await get(voice.id)).status, 200);
  sqlite.prepare("UPDATE products SET status='draft',commerce='{}' WHERE id=?").run(productId); assert.equal((await remove(voice.id)).status, 200);
  response = await upload(productId, new Uint8Array([1, 2]), 2, 'audio/mpeg', 'voice'); assert.equal(response.status, 201); assert.equal((await remove((await response.json()).upload.id)).status, 200);
  console.log('Passed: creator formats, legacy lessons, module ordering, captured upload identity, authenticated uploads, byte/size checks, range playback, cross-product/owner attachment rejection, saved-content conflicts, and attached/published recording deletion protection.');
} finally {sqlite.close();}
