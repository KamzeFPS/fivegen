import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import ts from 'typescript';
import { Paddle, Environment } from '@paddle/paddle-node-sdk';
import { createStorage } from '../runtime/render/storage.mjs';

// Real SQLite, migrations, SQL transactions, and Paddle signature verification.
// Only outbound customer/portal API calls and the session boundary are fixtures.
// Retain the database and every fixture row; never clean up billing state.
const root = resolve('outputs/paddle-qa', randomUUID());
const storage = createStorage(root);
const sdk = new Paddle('pdl_sdbx_apikey_fixture', { environment: Environment.sandbox });
const secret = 'pdl_ntfset_fixture_signing_secret';
const state = { DB: storage.DB, environment: 'sandbox', secret, user: { userId: 'owner-a', email: 'buyer@example.test' }, customerEmail: 'buyer@example.test', portalCalls: [], customerCalls: 0 };
state.paddle = {
  webhooks: sdk.webhooks,
  customers: { async get() { state.customerCalls++; return { email: state.customerEmail }; } },
  customerPortalSessions: { async create(...args) { state.portalCalls.push(args); return { urls: { general: { overview: 'https://sandbox-customer-portal.paddle.com/session-fixture' } } }; } },
};
globalThis.__paddleQA = state;
const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString('base64');
const appServer = compile(`
  export class ApiError extends Error { constructor(message,status=400) { super(message); this.status=status; } }
  export const database=()=>globalThis.__paddleQA.DB;
  export const binding=name=>globalThis.__paddleQA.config?.[name]||'';
  export async function identity(){ if(!globalThis.__paddleQA.user) throw new ApiError('Sign in',401); return globalThis.__paddleQA.user; }
  export function sameOrigin(request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin) throw new ApiError('Origin',403);}
  export function failure(error){return Response.json({error:error.message},{status:error.status||500});}
`);
const paddleServer = compile(`export const paddleServer=()=>globalThis.__paddleQA.paddle; export const paddleEnvironment=()=>globalThis.__paddleQA.environment; export const paddleSigningSecret=()=>globalThis.__paddleQA.secret;`);
const access = compile(readFileSync('lib/paddle/access.ts', 'utf8'));
function moduleFile(path, replacements) {
  let source = readFileSync(path, 'utf8');
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`from '${from}'`, `from '${to}'`);
  return compile(source);
}
const events = moduleFile('lib/paddle/events.ts', { '@paddle/paddle-node-sdk': import.meta.resolve('@paddle/paddle-node-sdk'), '../server': appServer, './access': access, './server': paddleServer });
const account = moduleFile('lib/paddle/account.ts', { '../server': appServer, './access': access, './server': paddleServer });
const { POST } = await import(moduleFile('app/api/webhooks/paddle/route.ts', { '@/lib/server': appServer, '@/lib/paddle/server': paddleServer, '@/lib/paddle/events': events }));
const { POST: portal } = await import(moduleFile('app/api/paddle/portal/route.ts', { '@/lib/server': appServer, '@/lib/paddle/server': paddleServer, '@/lib/paddle/account': account }));
const { dispatchPaddleEvent } = await import(events);
const { subscriptionGrantsAccess, eventTime } = await import(access);
const { paddleAccount, hasPaddlePaidAccess } = await import(account);
const serverConfig = await import(moduleFile('lib/paddle/server.ts', {'../server': appServer, '@paddle/paddle-node-sdk':import.meta.resolve('@paddle/paddle-node-sdk')}));
state.config={PADDLE_ENVIRONMENT:'sandbox',PADDLE_API_KEY:'pdl_sdbx_apikey_fixture',PADDLE_WEBHOOK_SECRET:secret};
assert.equal(serverConfig.paddleSigningSecret(),secret,'A pdl_ntfset_ signing secret is accepted');
assert.ok(serverConfig.paddleServer());
for(const wrong of ['','ntfset_destination_id','pdl_sdbx_apikey_fixture']) {
  state.config.PADDLE_WEBHOOK_SECRET=wrong; assert.throws(()=>serverConfig.paddleSigningSecret(),/signing secret/);
}
state.config.PADDLE_WEBHOOK_SECRET=secret;
state.config.PADDLE_ENVIRONMENT='';assert.throws(()=>serverConfig.paddleEnvironment(),/explicitly/);
state.config.PADDLE_ENVIRONMENT='production';assert.throws(()=>serverConfig.paddleServer(),/credentials/);
for(const release of ['', 'staging', 'typo']){
  state.config.PADDLE_LIVE_RELEASE=release;
  assert.throws(()=>serverConfig.assertPaddleCheckoutReleased(),e=>e.status===503);
}
state.config.PADDLE_LIVE_RELEASE='approved';serverConfig.assertPaddleCheckoutReleased();
state.config.PADDLE_ENVIRONMENT='sandbox';
state.config.PADDLE_LIVE_RELEASE='';serverConfig.assertPaddleCheckoutReleased();
const one = (sql, ...args) => storage.sqlite.prepare(sql).get(...args);
const run = (sql, ...args) => storage.sqlite.prepare(sql).run(...args);
const date = '2026-09-12T08:00:00.000000Z';
const time = n => `2026-09-12T08:00:${String(n).padStart(2,'0')}.000000Z`;
async function delivery(event, options = {}) {
  const raw = JSON.stringify(event, null, 2);
  const ts = Math.floor(Date.now() / 1000) - (options.expired ? 100 : 0);
  const signature = `ts=${ts};h1=${createHmac('sha256', options.wrongSecret ? 'wrong_secret' : secret).update(`${ts}:${raw}`).digest('hex')}`;
  return POST(new Request('https://fivegen.example/api/webhooks/paddle', { method: 'POST', headers: options.missing ? {} : { 'paddle-signature': signature }, body: options.tampered ? raw+' ' : raw }));
}
function event(type, data, occurredAt = date, id = randomUUID()) { return { event_id: id, event_type: type, occurred_at: occurredAt, notification_id: randomUUID(), data }; }
async function dispatch(type, data, occurredAt = date) { return dispatchPaddleEvent({ eventType: type, eventId: randomUUID(), occurredAt, data }, state.environment); }
const customer = { id: 'ctm_qa_a', email: 'buyer@example.test', status: 'active', created_at: date, updated_at: date };
const sub = (status, scheduledChange = null) => ({ id: 'sub_qa_a', customerId: customer.id, status, createdAt: date, updatedAt: date, items: [{ price: { id: 'pri_subscription', productId: 'pro_subscription' }, quantity: 1 }], scheduledChange });
function intent(id = 'intent-a', owner = 'owner-a', environment = 'sandbox') { run('INSERT INTO paddle_checkout_intents (id,environment,owner,email,price_id,pack_id,credits,created_at) VALUES (?,?,?,?,?,?,?,?)',id,environment,owner,'buyer@example.test','pri_qa_starter','starter',1000,Date.now()); }
const tx = (id = 'txn_qa_a', token = 'intent-a') => ({ id, status: 'completed', customerId: customer.id, customData: { fivegen_checkout_intent: token }, currencyCode: 'USD', subscriptionId: null, createdAt: date, updatedAt: date, details: { totals: { total: '1500' } }, items: [{ price: { id: 'pri_qa_starter', billingCycle: null }, quantity: 1 }] });
const adjust = (id, transactionId, total, action = 'refund', status = 'approved') => ({ id, transactionId, total, action, status, totals: { total }, createdAt: date, updatedAt: date });
try {
  const customerEvent = event('customer.created', customer);
  for (const options of [{ missing:true },{ wrongSecret:true },{ tampered:true },{ expired:true }]) {
    assert.equal((await delivery(customerEvent, options)).status,400,'Invalid signatures must not acknowledge delivery');
    assert.equal(one('SELECT count(*) AS n FROM paddle_customers').n,0,'Verification precedes all database effects');
  }
  assert.equal((await delivery(customerEvent)).status,200);
  assert.equal((await delivery(customerEvent)).status,200);
  assert.equal(one('SELECT count(*) AS n FROM paddle_customers').n,1);
  assert.equal(one('SELECT count(*) AS n FROM paddle_webhook_events').n,1);
  const ignore = await delivery(event('fivegen.unknown-event', {}));
  assert.equal(ignore.status,200); assert.equal((await ignore.json()).ignored,true);
  await delivery(event('customer.updated',{...customer,email:'new@example.test',updated_at:time(2)},time(2)));
  await delivery(event('customer.updated',{...customer,email:'stale@example.test'},time(1)));
  assert.equal(one('SELECT email FROM paddle_customers').email,'new@example.test');
  await dispatch('subscription.created',sub('active', {action:'cancel',effectiveAt:time(59)}),time(3));
  assert.ok(subscriptionGrantsAccess(one('SELECT * FROM paddle_subscriptions')));
  await dispatch('subscription.updated',sub('active',{action:'pause',effectiveAt:time(59)}),time(4));
  assert.ok(subscriptionGrantsAccess(one('SELECT * FROM paddle_subscriptions')));
  for (const [index,status] of ['paused','past_due','canceled','active','trialing'].entries()) {
    await dispatch('subscription.updated',sub(status),time(index+5));
    assert.equal(subscriptionGrantsAccess(one('SELECT * FROM paddle_subscriptions')),['active','trialing'].includes(status));
  }
  await dispatch('subscription.canceled',sub('canceled'),time(8));
  assert.equal(one('SELECT status FROM paddle_subscriptions').status,'trialing','Older cancellation cannot replace newer trial state');
  await dispatch('subscription.created',{...sub('active'),id:'sub_qa_early',customerId:'ctm_qa_early'},time(10));
  assert.equal(one('SELECT email FROM paddle_customers WHERE customer_id=?','ctm_qa_early').email,'');
  await delivery(event('customer.created',{...customer,id:'ctm_qa_early',email:'early@example.test'},time(1)));
  assert.equal(one('SELECT email FROM paddle_customers WHERE customer_id=?','ctm_qa_early').email,'early@example.test');
  assert.ok(eventTime('2026-09-12T08:00:00.001999Z')>eventTime('2026-09-12T08:00:00.001001Z'));

  intent();
  const badPrice=tx('txn_bad_price'); badPrice.items[0].price.id='pri_wrong';
  await assert.rejects(dispatch('transaction.completed',badPrice),/intent/);
  const badQuantity=tx('txn_bad_quantity'); badQuantity.items[0].quantity=2;
  await assert.rejects(dispatch('transaction.completed',badQuantity),/intent/);
  state.customerEmail='different@example.test';
  await assert.rejects(dispatch('transaction.completed',tx('txn_bad_email')),/account/);
  state.customerEmail='buyer@example.test';
  await dispatch('transaction.completed',tx());
  await Promise.all([dispatch('transaction.completed',tx()),dispatch('transaction.completed',tx())]);
  assert.equal(one('SELECT credits FROM paddle_test_wallets WHERE owner=?','owner-a').credits,1000,'Duplicate delivery credits once');
  assert.equal(one('SELECT count(*) AS n FROM wallets').n,0,'Sandbox never credits real AI wallets');
  assert.equal(one('SELECT owner FROM paddle_customers WHERE customer_id=?',customer.id).owner,'owner-a');
  assert.ok(await hasPaddlePaidAccess('owner-a'));
  const billing=await paddleAccount('owner-a');
  for(const row of [...billing.customers,...billing.subscriptions,...billing.payments]) assert.equal(Object.getPrototypeOf(row),Object.prototype,'Rows passed to React must be plain objects');
  assert.ok(!await hasPaddlePaidAccess('owner-b'));
  intent('intent-b','owner-b');
  await assert.rejects(dispatch('transaction.completed',tx('txn_other_owner','intent-b')),/another account/);
  await dispatch('transaction.completed',tx('txn_unbound','unknown-intent'));
  assert.equal(one('SELECT owner FROM paddle_transactions WHERE transaction_id=?','txn_unbound').owner,null);
  assert.equal(one('SELECT credits FROM paddle_test_wallets').credits,1000);

  await dispatch('adjustment.updated',adjust('adj_partial','txn_qa_a','375'),time(4));
  await dispatch('adjustment.updated',adjust('adj_partial','txn_qa_a','375'),time(4));
  await dispatch('adjustment.created',adjust('adj_partial','txn_qa_a','375','refund','pending_approval'),time(1));
  assert.equal(one('SELECT credits FROM paddle_test_wallets').credits,750,'Partial refund reverses once and stale pending event is ignored');
  await dispatch('adjustment.created',adjust('adj_chargeback','txn_qa_a','1125','chargeback'),time(6));
  assert.equal(one('SELECT credits FROM paddle_test_wallets').credits,0);
  await dispatch('adjustment.created',adjust('adj_chargeback_reverse','txn_qa_a','1125','chargeback_reverse'),time(7));
  assert.equal(one('SELECT credits FROM paddle_test_wallets').credits,750);
  await dispatch('adjustment.created',adjust('adj_before','txn_qa_late','1500'),time(9));
  await dispatch('transaction.completed',tx('txn_qa_late'),time(2));
  assert.equal(one('SELECT credits FROM paddle_test_wallets').credits,750,'Refund before payment is applied atomically');
  assert.equal(one('SELECT reversed FROM paddle_transactions WHERE transaction_id=?','txn_qa_late').reversed,1000);

  let response=await portal(new Request('https://fivegen.example/api/paddle/portal',{method:'POST',body:JSON.stringify({customerId:'ctm_attacker',subscriptionIds:['sub_attacker']})}));
  assert.equal(response.status,200);
  assert.deepEqual(state.portalCalls.at(-1),[customer.id,['sub_qa_a']],'Portal ignores client supplied IDs');
  state.user=null;
  response=await portal(new Request('https://fivegen.example/api/paddle/portal',{method:'POST'}));
  assert.equal(response.status,401); assert.equal(state.portalCalls.length,1,'Anonymous request cannot mint portal');
  state.user={userId:'owner-b',email:'other@example.test'};
  assert.equal((await portal(new Request('https://fivegen.example/api/paddle/portal',{method:'POST'}))).status,404);
  assert.equal((await paddleAccount('owner-b')).payments.length,0);
  state.user={userId:'owner-a',email:'buyer@example.test'};
  assert.equal((await portal(new Request('https://fivegen.example/api/paddle/portal',{method:'POST',headers:{origin:'https://attacker.example'}}))).status,403);

  // Exercise the production wallet SQL without a real production API or payment.
  state.environment='production';
  intent('intent-production','owner-production','production');
  const productionTx={...tx('txn_qa_production','intent-production'),customerId:'ctm_qa_production'};
  await dispatch('transaction.completed',productionTx);
  await dispatch('transaction.completed',productionTx);
  assert.equal(one('SELECT purchased FROM wallets WHERE owner=?','owner-production').purchased,1000);
  run('UPDATE wallets SET purchased=purchased-200 WHERE owner=?','owner-production');
  await dispatch('adjustment.created',adjust('adj_production','txn_qa_production','1500'),time(10));
  assert.equal(one('SELECT purchased FROM wallets WHERE owner=?','owner-production').purchased,-200,'Already spent refunded credits retain debt');
  assert.equal(one('SELECT credits FROM paddle_test_wallets WHERE owner=?','owner-a').credits,750);
  assert.equal((await paddleAccount('owner-a')).customers.length,0,'Environment switching cannot expose sandbox customers');
  console.log('Paddle webhook checks passed: raw SDK verification, rejection before mutation, typed routing, duplicate/out-of-order state, subscription access, account isolation, atomic fulfillment, refunds, chargebacks, sandbox isolation, and authenticated portal.');
  console.log('Billing QA database retained: '+root);
} finally { storage.close(); }
