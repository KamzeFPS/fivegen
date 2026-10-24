import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { z } from 'zod';
import { createStorage } from '../runtime/render/storage.mjs';

// Real additive migration, SQLite services and route. Authentication is the
// only fixture: no user data, AI, payments or running automations are contacted.
const root = resolve('outputs/marketing-plugins-qa', randomUUID()), initialMigrations = resolve(root, 'before-migration');
fs.mkdirSync(initialMigrations, { recursive: true });
for (const name of fs.readdirSync('drizzle').filter(name => /^\d+_.*\.sql$/.test(name) && Number(name.slice(0, 4)) < 19)) fs.copyFileSync(resolve('drizzle', name), resolve(initialMigrations, name));
let storage = createStorage(root, initialMigrations), sql = storage.sqlite;
const originalOwner = 'marketing-plugin-fixture', legacyId = randomUUID(), newId = randomUUID(), otherId = randomUUID(), now = Date.now();
let owner = originalOwner;
const insertProduct = (id, account, status = 'draft') => sql.prepare("INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) VALUES (?,?,?,'Owned book','An original book','Readers','Book',1500,'orange','{\"chapters\":[\"Original content\"]}',?,?,?)").run(id, account, id, status, now, now);
insertProduct(legacyId, originalOwner, 'published'); insertProduct(otherId, 'another-owner', 'published');
sql.prepare('INSERT INTO growth_workspaces (product_id,owner,brief,assets,updated_at) VALUES (?,?,?,?,?)').run(legacyId, originalOwner, '{"retained":"brief"}', '{"retained":"VSL"}', now);
sql.prepare('INSERT INTO growth_funnels (product_id,owner,slug,title,landing,published_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(legacyId, originalOwner, `retained-${legacyId}`, 'Existing live funnel', '{"retained":"landing"}', now, now);
sql.prepare("INSERT INTO automation_sequences (id,owner,product_id,trigger,status,draft,approved,revision,approved_revision,activated_at,updated_at) VALUES (?,?,?,'lead','active','{}','{}',1,1,?,?)").run(randomUUID(), originalOwner, legacyId, now, now);
sql.prepare("INSERT INTO automation_jobs (id,enrollment_id,owner,product_id,step_index,status,due_at) VALUES (?,?,?,?,0,'pending',?)").run(randomUUID(), randomUUID(), originalOwner, legacyId, now + 60000);
sql.prepare('INSERT INTO creator_campaigns (product_id,owner,title,items,updated_at) VALUES (?,?,?,?,?)').run(legacyId, originalOwner, 'Existing campaign', '[{"retained":"draft"}]', now);
sql.prepare("INSERT INTO creator_voice_sources (id,owner,product_id,title,kind,transcript,permission,approved,updated_at) VALUES (?,?,?,'Original voice','text','Retain my voice',1,1,?)").run(randomUUID(), originalOwner, legacyId, now);
sql.prepare("INSERT INTO offer_experiments (product_id,owner,slug,draft,published,status,revision,published_revision,published_at,updated_at) VALUES (?,?,?,'{}','{}','published',1,1,?,?)").run(legacyId, originalOwner, `offer-${legacyId}`, now, now);
function stateTables() { return sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('fivegen_migrations','product_marketing_plugins') ORDER BY name").all(); }
function durableState(tables = stateTables()) {
  return JSON.stringify(tables.map(({ name }) => [name, sql.prepare(`SELECT * FROM "${name}"`).all()]));
}
const historicalTables = stateTables(), beforeMigration = durableState(historicalTables); storage.close(); storage = createStorage(root); sql = storage.sqlite;
assert.equal(durableState(historicalTables), beforeMigration, 'Migration does not alter any historical content or customer state; later additive infrastructure tables are not historical data');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM product_marketing_plugins').get().n, 0, 'Migration never auto-installs a tool based on legacy content');
insertProduct(newId, originalOwner);
const beforeMutations = durableState();
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const dependencies = {
  z, ApiError, database: () => storage.DB,
  ownedProduct: async (id, account) => { const row = sql.prepare('SELECT * FROM products WHERE id=? AND owner=?').get(id, account); if (!row) throw new ApiError('Product not found.', 404); return row; },
  identity: async () => { if (!owner) throw new ApiError('Sign in.', 401); return { userId: owner }; },
  sameOrigin: request => { const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) throw new ApiError('This request is not allowed.', 403); },
  failure: error => Response.json({ error: error.message }, { status: error.status || (error.issues ? 400 : 500) }),
};
async function load(path) {
  const key = `marketingPluginQa${randomUUID().replaceAll('-', '')}`; globalThis[key] = { ...dependencies };
  const source = fs.readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); delete globalThis[key]; return result;
}
Object.assign(dependencies, await load('lib/marketing-plugins.ts'));
Object.assign(dependencies, await load('lib/marketing-plugin-server.ts'));
const route = await load('app/api/products/[id]/marketing-plugins/route.ts');
const request = (id, body, origin = 'http://localhost') => new Request(`http://localhost/api/products/${id}/marketing-plugins`, { method: body ? 'PATCH' : 'GET', headers: { origin, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
const get = id => route.GET(request(id), { params: Promise.resolve({ id }) }), patch = (id, body, origin) => route.PATCH(request(id, body, origin), { params: Promise.resolve({ id }) });
async function response(result, status = 200) { const data = await result.json(); assert.equal(result.status, status, JSON.stringify(data)); assert.equal(result.headers.get('cache-control'), 'private, no-store'); return data; }
try {
  assert.deepEqual(await response(await get(legacyId)), { installed: [], updatedAt: 0 }, 'Even a published book with all historical tools opens only the product dashboard');
  assert.deepEqual(await response(await get(newId)), { installed: [], updatedAt: 0 });
  assert.deepEqual(dependencies.readMarketingPluginIds('["funnel","funnel","unknown","vsl"]'), ['vsl', 'funnel']);
  assert.deepEqual(dependencies.readMarketingPluginIds('malformed'), []);
  owner = ''; await response(await get(legacyId), 401); await response(await patch(legacyId, { pluginId: 'vsl', enabled: true, expectedUpdatedAt: 0 }), 401); owner = originalOwner;
  await response(await get(otherId), 404); await response(await patch(otherId, { pluginId: 'vsl', enabled: true, expectedUpdatedAt: 0 }), 404);
  await response(await patch(legacyId, { pluginId: 'vsl', enabled: true, expectedUpdatedAt: 0 }, 'https://outsider.example'), 403);
  for (const invalid of [{ pluginId: 'crm', enabled: true, expectedUpdatedAt: 0 }, { pluginId: 'vsl', enabled: 'yes', expectedUpdatedAt: 0 }, { pluginId: 'vsl', enabled: true, expectedUpdatedAt: -1 }, { pluginId: 'vsl', enabled: true, expectedUpdatedAt: 0, owner: 'another-owner' }]) await response(await patch(legacyId, invalid), 400);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM product_marketing_plugins').get().n, 0, 'Rejected mutations do not create preferences');
  let state = await response(await patch(legacyId, { pluginId: 'vsl', enabled: true, expectedUpdatedAt: 0 }));
  assert.deepEqual(state.installed, ['vsl']); assert.ok(state.updatedAt > 0);
  assert.deepEqual(await response(await get(legacyId)), state, 'Installation persists on reload');
  assert.deepEqual(await response(await patch(legacyId, { pluginId: 'vsl', enabled: true, expectedUpdatedAt: state.updatedAt })), state, 'Repeated explicit installation is a no-op');
  await response(await patch(legacyId, { pluginId: 'funnel', enabled: true, expectedUpdatedAt: 0 }), 409);
  for (const pluginId of dependencies.marketingPluginIds.filter(id => id !== 'vsl')) state = await response(await patch(legacyId, { pluginId, enabled: true, expectedUpdatedAt: state.updatedAt }));
  assert.deepEqual(state.installed, [...dependencies.marketingPluginIds]);
  assert.deepEqual(await response(await get(newId)), { installed: [], updatedAt: 0 }, 'Installation remains specific to one product');
  for (const pluginId of dependencies.marketingPluginIds) state = await response(await patch(legacyId, { pluginId, enabled: false, expectedUpdatedAt: state.updatedAt }));
  assert.deepEqual(state.installed, []); assert.deepEqual(await response(await get(legacyId)), state, 'Removing every optional plugin persists a dashboard-only workspace');
  const simultaneous = await Promise.all([patch(newId, { pluginId: 'vsl', enabled: true, expectedUpdatedAt: 0 }), patch(newId, { pluginId: 'funnel', enabled: true, expectedUpdatedAt: 0 })]);
  assert.deepEqual(simultaneous.map(item => item.status).sort(), [200, 409], 'Concurrent first writes cannot overwrite one another');
  assert.equal((await response(await get(newId))).installed.length, 1);
  assert.equal(durableState(), beforeMutations, 'Install/remove does not modify product content, public funnels, campaigns, offer tests, voice sources, active sequences, queued jobs, customer state, or any existing table');
  assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length, 0);
  console.log('Passed: additive migration, new and legacy opt-in defaults, authenticated owner-only API, input validation, same-origin protection, no-store responses, per-product persistence, all six install/removal paths, stale/concurrent updates, and byte-identical legacy content/live marketing data.');
  console.log('QA fixtures retained: ' + root);
} finally { storage.close(); }
