import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import { createStorage } from '../runtime/render/storage.mjs';

// Real schema/SQLite reporting and route boundaries; Stripe is a read-only stub.
const root = resolve('outputs/commerce-earnings-qa', randomUUID()), storage = createStorage(root), db = storage.sqlite;
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
let user = 'creator-a', mode = 'test', activeReads = 0, peakReads = 0;
const calls = [];
const providerFailures = new Set();
const deps = {
  z, ApiError, database: () => storage.DB,
  commerceMode: () => { if (!['test', 'live'].includes(mode)) throw new ApiError('Set an explicit payment mode.', 503); return mode; },
  ownedProduct: async (id, owner) => { const product = db.prepare('SELECT * FROM products WHERE id=? AND owner=?').get(id, owner); if (!product) throw new ApiError('Product not found.', 404); return product; },
  refreshCommerceOrderEarnings: async (id, owner) => {
    const row = db.prepare('SELECT owner,mode,payment_intent FROM commerce_orders WHERE id=?').get(id);
    assert.equal(row.owner, owner); assert.equal(row.mode, mode); assert.ok(row.payment_intent);
    calls.push({ id, owner }); activeReads++; peakReads = Math.max(peakReads, activeReads);
    try { await new Promise(resolve => setTimeout(resolve, 2)); if (id === failedOrder || providerFailures.has(id)) throw new ApiError('Private provider data', 503); return id !== pendingOrder; }
    finally { activeReads--; }
  },
  identity: async () => { if (!user) throw new ApiError('Sign in.', 401); return { userId: user }; },
  sameOrigin: request => { if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('Wrong origin.', 403); },
  failure: error => Response.json({ error: error.message }, { status: error.status || (error.issues ? 400 : 500) }),
};
async function load(path) {
  const key = 'qa' + randomUUID().replaceAll('-', ''); globalThis[key] = { ...deps };
  const source = fs.readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(deps).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); delete globalThis[key]; return module;
}
Object.assign(deps, await load('lib/commerce-earnings-server.ts'));
const route = await load('app/api/commerce/earnings/refresh/route.ts');
const product = randomUUID(), anotherProduct = randomUUID(), foreignProduct = randomUUID(), now = Date.now();
for (const [id, owner] of [[product, 'creator-a'], [anotherProduct, 'creator-a'], [foreignProduct, 'creator-b']])
  db.prepare("INSERT INTO products(id,owner,slug,title,description,audience,format,color,content,created_at,updated_at) VALUES (?,?,?,'A real book','Practical content','Readers','Book','orange','{}',?,?)").run(id, owner, 'book-' + id, now, now);
function order({ owner = 'creator-a', productId = product, paymentMode = 'test', amount = 100, currency = 'usd', status = 'paid', bps = 500, expected = 5, timestamp = now, paymentIntent = true } = {}) {
  const id = randomUUID(); db.prepare(`INSERT INTO commerce_orders(id,owner,product_id,account_id,mode,email,amount,currency,title,status,payment_intent,access_hash,created_at,paid_at,expected_fee_bps,expected_fee_amount)
    VALUES (?,?,?,'acct_fixture',?,'buyer@example.test',?,?,'A real book',?,?, 'hash',?,?,?,?)`).run(id, owner, productId, paymentMode, amount, currency, status, paymentIntent ? 'pi_' + id : null, timestamp, status === 'pending' ? null : timestamp, bps, expected); return id;
}
function settlement(id, { gross = 100, currency = 'usd', stripe = 34, platform = 5, net = gross - stripe - platform, chargeFee = platform, complete = true } = {}) {
  db.prepare(`INSERT INTO commerce_earnings(order_id,charge_id,charge_application_fee_amount,refunded_amount,disputed,balance_transaction_id,settlement_amount,settlement_currency,stripe_fee_amount,platform_fee_amount,creator_net_amount,availability,available_at,updated_at)
    VALUES (?,?,?,0,0,?,?,?,?,?,?,'pending',?,?)`).run(id, 'ch_' + id, chargeFee, complete ? 'txn_' + id : null, complete ? gross : null, complete ? currency : null, complete ? stripe : null, complete ? platform : null, complete ? net : null, now + 86400000, now);
}
const legacyOrder = order({ bps: 0, expected: 0 }); settlement(legacyOrder, { platform: 0 });
const chargedOrder = order(); settlement(chargedOrder);
const pendingOrder = order({ amount: 200, expected: 10 }); settlement(pendingOrder, { chargeFee: 10, complete: false });
const refundedOrder = order({ amount: 300, expected: 15, status: 'revoked' }); settlement(refundedOrder, { gross: 300, stripe: 39, platform: 15 });
const fxOrder = order({ amount: 1000, expected: 50 }); settlement(fxOrder, { gross: 900, currency: 'eur', stripe: 56, platform: 45, chargeFee: 50 });
const jpyOrder = order({ amount: 500, expected: 25 }); settlement(jpyOrder, { gross: 700, currency: 'jpy', stripe: 80, platform: 35, chargeFee: 25 });
const failedOrder = order({ bps: 0, expected: 0 });
// Isolated records must never inflate the selected owner's test earnings.
settlement(order({ owner: 'creator-b', productId: foreignProduct, amount: 99900 }), { gross: 99900 });
settlement(order({ paymentMode: 'live', amount: 88800 }), { gross: 88800 });
settlement(order({ timestamp: now - 100 * 86400000, amount: 77700 }), { gross: 77700 });
settlement(order({ productId: anotherProduct, amount: 600 }), { gross: 600 });
order({ status: 'pending', amount: 12345 });
const base = 'https://fivegen.test/api/commerce/earnings/refresh';
const post = (body, origin = 'https://fivegen.test') => route.POST(new Request(base, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
try {
  const report = await deps.commerceEarnings('creator-a', 30, product);
  assert.deepEqual(report.sales, [{ currency: 'usd', grossAmount: 2000, orders: 6 }]);
  assert.deepEqual(report.coverage, { totalOrders: 7, confirmedOrders: 4, pendingOrders: 2, legacyOrders: 1, excludedOrders: 1 });
  assert.deepEqual(report.totals.find(row => row.currency === 'usd'), { currency: 'usd', grossAmount: 200, stripeFeeAmount: 68, platformFeeAmount: 5, creatorNetAmount: 127, confirmedOrders: 2 });
  assert.deepEqual(report.totals.find(row => row.currency === 'eur'), { currency: 'eur', grossAmount: 900, stripeFeeAmount: 56, platformFeeAmount: 45, creatorNetAmount: 799, confirmedOrders: 1 });
  assert.equal(report.totals.find(row => row.currency === 'jpy').creatorNetAmount, 585, 'Zero-decimal settlement amounts remain raw Stripe minor units');
  const old = report.orders.find(row => row.id === legacyOrder); assert.equal(old.feeStatus, 'legacy'); assert.equal(old.actualChargePlatformFeeAmount, 0); assert.equal(old.creatorNetAmount, 66);
  const pending = report.orders.find(row => row.id === pendingOrder); assert.equal(pending.feeStatus, 'pending'); assert.equal(pending.actualChargePlatformFeeAmount, 10); assert.equal(pending.stripeFeeAmount, null); assert.equal(pending.creatorNetAmount, null);
  const absent = report.orders.find(row => row.id === failedOrder); assert.equal(absent.feeStatus, 'pending'); assert.equal(absent.actualChargePlatformFeeAmount, null, 'An old row is not proof of a zero application fee until Stripe verifies it');
  assert.equal(report.orders.find(row => row.id === refundedOrder).feeStatus, 'refunded');
  assert.equal(report.orders.find(row => row.id === fxOrder).currency, 'usd'); assert.equal(report.orders.find(row => row.id === fxOrder).settlementCurrency, 'eur');
  assert.equal((await deps.commerceEarnings('creator-a', 30)).sales[0].grossAmount, 2600, 'Workspace report includes another owned product');
  await assert.rejects(() => deps.commerceEarnings('creator-a', 30, foreignProduct), error => error.status === 404);
  await assert.rejects(() => deps.commerceEarnings('creator-a', 999), error => error.status === 400);
  mode = ''; await assert.rejects(() => deps.commerceEarnings('creator-a', 30), error => error.status === 503); mode = 'test';
  const countBefore = db.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n;
  assert.equal((await post({ days: 30, productId: product }, 'https://evil.example')).status, 403);
  assert.equal((await post({ days: 30, productId: foreignProduct })).status, 404);
  assert.equal((await post({ days: 30, productId: product, orderId: failedOrder })).status, 400, 'Client cannot choose arbitrary payment identifiers');
  user = ''; assert.equal((await post({ days: 30 })).status, 401); user = 'creator-a'; assert.equal(calls.length, 0, 'Authentication/ownership/CSRF failures make no provider reads');
  const response = await post({ days: 30, productId: product }); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { refreshed: 5, pending: 1, failed: 1, limit: 10 }); assert.equal(calls.length, 7); assert.ok(calls.every(call => call.owner === 'creator-a'));
  assert.equal(peakReads, 2, 'Fee reads never exceed two concurrent Stripe requests');
  assert.equal((await post({ days: 7, productId: anotherProduct })).status, 429, 'Changing product or period cannot bypass the owner cooldown'); assert.equal(calls.length, 7);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n, countBefore, 'Read-only reconciliation never creates a sale or changes commission policy');
  db.prepare('UPDATE growth_lead_rate_limits SET expires_at=0 WHERE key=?').run('commerce-earnings:test:creator-a');
  for (let index = 0; index < 105; index++) order({ amount: 100 });
  const large = await deps.commerceEarnings('creator-a', 30, product); assert.equal(large.orders.length, 100); assert.equal(large.coverage.totalOrders, 112); assert.equal(large.sales[0].grossAmount, 12500, 'Aggregate totals include every sale beyond the recent ledger limit');
  const refresh = await post({ days: 30, productId: product }); assert.equal(refresh.status, 200); assert.equal(calls.length, 17, 'Each owner refresh reads at most ten payments');
  assert.ok(!JSON.stringify(await refresh.json()).includes('Private provider data'), 'Provider details never leak through the refresh result');
  // A full batch of unreadable historical payments cannot starve later sales.
  const recoveryProduct = randomUUID(), recoveryOwner = 'creator-recovery';
  db.prepare("INSERT INTO products(id,owner,slug,title,description,audience,format,color,content,created_at,updated_at) VALUES (?,?,?,'A real book','Practical content','Readers','Book','orange','{}',?,?)").run(recoveryProduct, recoveryOwner, 'book-' + recoveryProduct, now, now);
  const blockedOrders = Array.from({ length: 10 }, () => order({ owner: recoveryOwner, productId: recoveryProduct }));
  blockedOrders.forEach(id => providerFailures.add(id));
  const readableOrders = Array.from({ length: 2 }, () => order({ owner: recoveryOwner, productId: recoveryProduct }));
  readableOrders.forEach(id => db.prepare('UPDATE commerce_orders SET earnings_checked_at=1 WHERE id=?').run(id));
  user = recoveryOwner;
  const blockedRefresh = await post({ days: 30, productId: recoveryProduct }); assert.equal(blockedRefresh.status, 200);
  assert.deepEqual(await blockedRefresh.json(), { refreshed: 0, pending: 0, failed: 10, limit: 10 });
  assert.ok(blockedOrders.every(id => db.prepare('SELECT earnings_checked_at FROM commerce_orders WHERE id=?').get(id).earnings_checked_at > 1), 'Failed reads advance attempt timestamps without fabricating fee records');
  db.prepare('UPDATE growth_lead_rate_limits SET expires_at=0 WHERE key=?').run('commerce-earnings:test:' + recoveryOwner);
  const callsBeforeRetry = calls.length, recoveredRefresh = await post({ days: 30, productId: recoveryProduct }); assert.equal(recoveredRefresh.status, 200);
  assert.deepEqual(await recoveredRefresh.json(), { refreshed: 2, pending: 0, failed: 8, limit: 10 });
  assert.ok(readableOrders.every(id => calls.slice(callsBeforeRetry).some(call => call.id === id)), 'The next refresh reaches later readable sales after a full failed batch');
  const unverified = await deps.commerceEarnings(recoveryOwner, 30, recoveryProduct); assert.equal(unverified.coverage.confirmedOrders, 0); assert.equal(unverified.coverage.pendingOrders, 12); assert.equal(unverified.totals.length, 0, 'Attempt markers are never proof of actual fees or earnings');
  console.log('Passed: actual Stripe-fee/net reporting, no guessed fees, historical zero commission, excluded refunds, FX/zero-decimal settlements, exact aggregates beyond the 100-row ledger, owner/product/mode/date isolation, auth/CSRF/strict refresh payload, owner-wide cooldown and ten-payment read cap.');
  console.log('QA records retained: ' + root);
} finally { storage.close(); }
