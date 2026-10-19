import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import ts from 'typescript';
import { createStorage } from '../runtime/render/storage.mjs';

const root = resolve('outputs/creator-plan-qa', randomUUID()), storage = createStorage(root), db = storage.sqlite;
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const deps = { ApiError, database: () => storage.DB };
async function load(path) {
  const key = 'creatorPlanQa' + randomUUID().replaceAll('-', ''); globalThis[key] = { ...deps };
  const source = readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(deps).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  try { return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); } finally { delete globalThis[key]; }
}
Object.assign(deps, await load('lib/creator-plans.ts'));
Object.assign(deps, await load('lib/creator-plan-server.ts'));
const now = Date.UTC(2026, 9, 19, 12);
function funding({ owner = 'owner-' + randomUUID(), environment = 'production', offer = 'subscription:pro:month', interval = 'month', status = 'active', start = now - 1000, end = now + 30 * 86400000, credited = 1, reversed = 0, amount = 2900, credits = 2500 } = {}) {
  const id = randomUUID(), intent = 'intent-' + id, customer = 'cus_' + id, subscription = 'sub_' + id, payment = 'invoice-' + id, pi = 'pi_' + id;
  db.prepare('INSERT INTO wallet_customers(key,owner,environment,customer_id) VALUES(?,?,?,?)').run(environment + ':' + owner, owner, environment, customer);
  db.prepare("INSERT INTO wallet_checkout_intents(id,owner,environment,offer_id,email,amount,credits,billing_interval,status,created_at) VALUES(?,?,?,?,?,?,?,?, 'complete',?)").run(intent, owner, environment, offer, 'creator@example.test', amount, credits, interval, now);
  db.prepare('INSERT INTO wallet_subscriptions(subscription_id,owner,environment,customer_id,intent_id,status,cancel_at,period_end,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(subscription, owner, environment, customer, intent, status, null, end, now);
  db.prepare('INSERT INTO wallet_payments(id,owner,environment,intent_id,payment_intent,subscription_id,amount,credits,credited,reversed,starts_at,ends_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(payment, owner, environment, intent, pi, subscription, amount, credits, credited, reversed, start, end, now);
  return { owner, intent, customer, subscription, payment, pi, environment, amount, credits, start, end };
}
const plan = (fixture, mode = 'live', at = now) => deps.creatorPlan(typeof fixture === 'string' ? fixture : fixture.owner, mode, at);
try {
  assert.equal((await plan('new-creator')).id, 'free');
  assert.equal((await plan('kamzewac@gmail.com')).commissionBps, 500, 'An admin AI exemption never waives seller commission');
  await assert.rejects(() => plan('owner', 'invalid'), error => error.status === 503);
  const pro = funding();
  assert.equal((await plan(pro)).id, 'pro'); assert.equal((await plan(pro)).commissionBps, 300); assert.equal((await plan(pro)).paidThrough, pro.end);
  assert.equal((await plan(pro, 'test')).id, 'free', 'Live subscription never grants a sandbox benefit');
  assert.equal((await plan('someone-else')).id, 'free', 'Another seller cannot reuse paid access');
  db.prepare('UPDATE wallet_subscriptions SET cancel_at=? WHERE subscription_id=?').run(pro.end, pro.subscription);
  assert.equal((await plan(pro)).id, 'pro', 'Cancellation scheduled at period end preserves paid benefits');
  for (const status of ['past_due', 'paused', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired']) {
    db.prepare('UPDATE wallet_subscriptions SET status=? WHERE subscription_id=?').run(status, pro.subscription);
    assert.equal((await plan(pro)).id, 'free', status + ' does not grant discounted commission');
  }
  db.prepare("UPDATE wallet_subscriptions SET status='trialing' WHERE subscription_id=?").run(pro.subscription);
  assert.equal((await plan(pro)).id, 'pro', 'Trialing is allowed only with an actual paid period');
  db.prepare('UPDATE wallet_payments SET credited=0 WHERE id=?').run(pro.payment); assert.equal((await plan(pro)).id, 'free', 'Subscription status alone is insufficient');
  db.prepare('UPDATE wallet_payments SET credited=1 WHERE id=?').run(pro.payment);
  db.prepare("INSERT INTO subscription_credit_grants(id,owner,environment,transaction_id,subscription_id,credits,remaining,starts_at,expires_at) VALUES(?,?,?,?,?,?,0,?,?)").run('spent-' + pro.payment, pro.owner, pro.environment, pro.payment, pro.subscription, pro.credits, pro.start, pro.end);
  assert.equal((await plan(pro)).id, 'pro', 'Spending all AI credits does not disable the paid commission rate');
  assert.equal((await plan(pro, 'live', pro.end)).id, 'free', 'An expired verified period loses the benefit, even before a status webhook arrives');
  db.prepare('UPDATE wallet_subscriptions SET period_end=? WHERE subscription_id=?').run(now - 1, pro.subscription); assert.equal((await plan(pro)).id, 'free', 'A stale paid invoice cannot override the current subscription period');
  db.prepare('UPDATE wallet_subscriptions SET period_end=? WHERE subscription_id=?').run(pro.end, pro.subscription);
  db.prepare('UPDATE wallet_payments SET reversed=? WHERE id=?').run(pro.credits, pro.payment); assert.equal((await plan(pro)).id, 'free', 'Fully refunded subscription is not a paid entitlement');
  db.prepare('UPDATE wallet_payments SET reversed=? WHERE id=?').run(pro.credits - 1, pro.payment); assert.equal((await plan(pro)).id, 'pro', 'Partial refund keeps remaining paid entitlement');
  db.prepare('INSERT INTO wallet_charge_state(charge_id,environment,payment_intent,amount,reversed_amount,event_time) VALUES(?,?,?,?,?,?)').run('ch-' + pro.pi, pro.environment, pro.pi, pro.amount, pro.amount, now);
  assert.equal((await plan(pro)).id, 'free', 'Recorded full charge reversal blocks benefits even before credit reconciliation');
  db.prepare('UPDATE wallet_charge_state SET reversed_amount=0 WHERE payment_intent=?').run(pro.pi);
  db.prepare('UPDATE wallet_customers SET customer_id=? WHERE owner=?').run('cus_wrong', pro.owner); assert.equal((await plan(pro)).id, 'free', 'Customer identity must be bound to the owner');
  for (const [offer, interval, expected, bps] of [
    ['subscription:pro:year', 'year', 'pro', 300],
    ['subscription:studio:month', 'month', 'legacy-studio', 300],
    ['subscription:studio:year', 'year', 'legacy-studio', 300],
    ['subscription:scale:month', 'month', 'scale', 0],
    ['subscription:scale:year', 'year', 'free', 500],
    ['pack:scale', null, 'free', 500],
    ['subscription:admin:month', 'month', 'free', 500],
    ['subscription:scale:month', 'year', 'free', 500],
  ]) {
    const fixture = funding({ offer, interval }); const result = await plan(fixture);
    assert.equal(result.id, expected, offer + ' exact identity'); assert.equal(result.commissionBps, bps);
  }
  assert.equal((await plan(funding({ start: now + 1 }))).id, 'free', 'A future paid period cannot grant benefits early');
  assert.equal((await plan(funding({ environment: 'sandbox' }), 'test')).id, 'pro');
  function paddleFunding({ owner = 'paddle-' + randomUUID(), pack = 'pro', status = 'active', environment = 'production' } = {}) {
    const id = randomUUID(), customer = 'ctm_' + id, subscription = 'sub_' + id, transaction = 'txn_' + id, intent = 'intent-' + id, price = 'pri_' + id, date = new Date(now).toISOString();
    db.prepare('INSERT INTO paddle_customers(customer_id,environment,email,owner,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(customer, environment, 'creator@example.test', owner, date, date);
    db.prepare('INSERT INTO paddle_subscriptions(subscription_id,environment,customer_id,status,price_id,product_id,items,created_at,updated_at,event_time) VALUES(?,?,?,?,?,?,?,?,?,?)').run(subscription, environment, customer, status, price, 'pro_' + id, '[]', date, date, now);
    db.prepare('INSERT INTO paddle_checkout_intents(id,environment,owner,email,price_id,pack_id,credits,billing_interval,created_at) VALUES(?,?,?,?,?,?,2500,?,?)').run(intent, environment, owner, 'creator@example.test', price, pack, 'year', now);
    db.prepare('INSERT INTO paddle_transactions(transaction_id,environment,customer_id,owner,intent_id,status,currency,total,credits,credited,created_at,updated_at,event_time) VALUES(?,?,?,?,?,?,?,?,0,1,?,?,?)').run(transaction, environment, customer, owner, intent, 'completed', 'USD', '29000', date, date, now);
    db.prepare('INSERT INTO paddle_subscription_periods(transaction_id,environment,owner,subscription_id,price_id,credits,starts_at,ends_at) VALUES(?,?,?,?,?,2500,?,?)').run(transaction, environment, owner, subscription, price, now - 1000, now + 365 * 86400000);
    return { owner, environment, transaction, subscription, intent, date };
  }
  const paddle = paddleFunding(); assert.equal((await plan(paddle)).id, 'pro'); assert.equal((await plan(paddle)).source, 'paddle');
  db.prepare("UPDATE paddle_subscriptions SET scheduled_change_action='cancel',scheduled_change_at=? WHERE subscription_id=?").run(new Date(now + 100000).toISOString(), paddle.subscription);
  assert.equal((await plan(paddle)).id, 'pro', 'Paddle scheduled cancellation preserves the verified current paid period');
  const adjustment = (action, total) => db.prepare('INSERT INTO paddle_adjustments(adjustment_id,environment,transaction_id,action,status,total,created_at,updated_at,event_time) VALUES(?,?,?,?,?,?,?,?,?)').run('adj_' + randomUUID(), paddle.environment, paddle.transaction, action, 'approved', String(total), paddle.date, paddle.date, now);
  adjustment('chargeback', 29000); assert.equal((await plan(paddle)).id, 'free');
  adjustment('chargeback_reverse', 29000); assert.equal((await plan(paddle)).id, 'pro');
  adjustment('refund', 10000); assert.equal((await plan(paddle)).id, 'pro');
  adjustment('refund', 19000); assert.equal((await plan(paddle)).id, 'free', 'Aggregate approved refunds cannot preserve a fully refunded entitlement');
  const studio = paddleFunding({ pack: 'studio' }); assert.equal((await plan(studio)).id, 'legacy-studio'); assert.equal((await plan(studio)).commissionBps, 300);
  assert.equal((await plan(paddleFunding({ pack: 'scale' }))).id, 'free', 'Legacy Paddle cannot claim a new Scale plan through metadata');
  const unbound = paddleFunding(); db.prepare('UPDATE paddle_checkout_intents SET price_id=? WHERE id=?').run('pri_wrong', unbound.intent); assert.equal((await plan(unbound)).id, 'free', 'Paddle requires the original bound price and intent');
  assert.equal((await plan(paddleFunding({ status: 'paused' }))).id, 'free');
  console.log('Passed: Free/Creator Pro/Scale commission entitlements from verified owner-bound paid periods, exact frozen offer identities, annual/legacy preservation, status and expiry, spent credits, refunds/chargebacks, mode isolation, legacy Paddle scheduled cancellation, and no admin bypass. No provider calls.');
  console.log('Permanent QA records retained: ' + root);
} finally { storage.close(); }
