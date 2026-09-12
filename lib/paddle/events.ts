import { EventName, type EventEntity, type CustomerNotification, type SubscriptionNotification, type TransactionNotification, type AdjustmentNotification } from '@paddle/paddle-node-sdk';
import { ApiError, database } from '../server';
import { eventTime } from './access';
import { paddleServer } from './server';

type Environment = 'sandbox' | 'production';
type Context = { environment: Environment; time: number; occurredAt: string };
type Intent = { id: string; environment: Environment; owner: string; email: string; price_id: string; credits: number };

function ensureCustomer(id: string, context: Context, email = '') {
  return database().prepare("INSERT OR IGNORE INTO paddle_customers (customer_id,environment,email,created_at,updated_at,event_time) VALUES (?,?,?,?,?,0)")
    .bind(id, context.environment, email, context.occurredAt, context.occurredAt);
}

export async function handleCustomer(customer: CustomerNotification, context: Context) {
  if (!customer.id || !customer.email) throw new ApiError('Incomplete Paddle customer event.', 422);
  await database().prepare(`INSERT INTO paddle_customers (customer_id,environment,email,status,created_at,updated_at,event_time) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(customer_id) DO UPDATE SET email=excluded.email,status=excluded.status,created_at=excluded.created_at,updated_at=excluded.updated_at,event_time=excluded.event_time
    WHERE paddle_customers.environment=excluded.environment AND excluded.event_time>paddle_customers.event_time`)
    .bind(customer.id, context.environment, customer.email, customer.status, customer.createdAt, customer.updatedAt, context.time).run();
}

export async function handleSubscription(subscription: SubscriptionNotification, context: Context) {
  const items = subscription.items.map(item => ({ priceId: item.price?.id, productId: item.price?.productId ?? item.product?.id, quantity: item.quantity }));
  if (!subscription.customerId || !items.length || items.some(item => !item.priceId || !item.productId)) throw new ApiError('Incomplete Paddle subscription event.', 422);
  // At equal timestamps, prefer an actual cancellation over an older active
  // representation. Later reactivation timestamps still replace stale state.
  const rank = "CASE status WHEN 'canceled' THEN 4 WHEN 'paused' THEN 3 WHEN 'past_due' THEN 2 WHEN 'active' THEN 1 ELSE 0 END";
  const nextRank = rank.replaceAll('status', 'excluded.status');
  const oldRank = rank.replaceAll('status', 'paddle_subscriptions.status');
  await database().batch([
    ensureCustomer(subscription.customerId, context),
    database().prepare(`INSERT INTO paddle_subscriptions (subscription_id,environment,customer_id,status,price_id,product_id,items,scheduled_change_action,scheduled_change_at,created_at,updated_at,event_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(subscription_id) DO UPDATE SET status=excluded.status,price_id=excluded.price_id,product_id=excluded.product_id,items=excluded.items,scheduled_change_action=excluded.scheduled_change_action,scheduled_change_at=excluded.scheduled_change_at,updated_at=excluded.updated_at,event_time=excluded.event_time
      WHERE paddle_subscriptions.environment=excluded.environment AND paddle_subscriptions.customer_id=excluded.customer_id AND
      (excluded.event_time>paddle_subscriptions.event_time OR (excluded.event_time=paddle_subscriptions.event_time AND (${nextRank})>(${oldRank})))`)
      .bind(subscription.id, context.environment, subscription.customerId, subscription.status, items[0].priceId!, items[0].productId!, JSON.stringify(items), subscription.scheduledChange?.action ?? null, subscription.scheduledChange?.effectiveAt ?? null, subscription.createdAt, subscription.updatedAt, context.time),
  ]);
}

function money(value: string | undefined) {
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 1_000_000_000_000) throw new ApiError('Invalid Paddle amount.', 422);
  return value;
}

function reversalStatements(transactionId: string, environment: Environment): D1PreparedStatement[] {
  // Recompute from the latest state of each adjustment, so duplicates,
  // chargeback reversals, and refunds arriving before payment are all safe.
  const refunded = `(SELECT COALESCE(SUM(CASE WHEN action IN ('refund','chargeback') THEN CAST(total AS INTEGER) WHEN action='chargeback_reverse' THEN -CAST(total AS INTEGER) ELSE 0 END),0) FROM paddle_adjustments WHERE transaction_id=t.transaction_id AND environment=t.environment AND status='approved')`;
  const target = `CASE WHEN CAST(t.total AS INTEGER)>0 THEN CAST((t.credits * min(CAST(t.total AS INTEGER),max(0,${refunded}))+CAST(t.total AS INTEGER)-1)/CAST(t.total AS INTEGER) AS INTEGER) ELSE 0 END`;
  const wallet = environment === 'sandbox' ? 'paddle_test_wallets' : 'wallets';
  const column = environment === 'sandbox' ? 'credits' : 'purchased';
  return [
    database().prepare(`UPDATE ${wallet} SET ${column}=${column}-(SELECT (${target})-t.reversed FROM paddle_transactions t WHERE t.transaction_id=? AND t.environment=?)
      WHERE owner=(SELECT owner FROM paddle_transactions WHERE transaction_id=? AND environment=? AND credited=1)`)
      .bind(transactionId, environment, transactionId, environment),
    database().prepare(`UPDATE paddle_transactions AS t SET reversed=${target} WHERE transaction_id=? AND environment=? AND credited=1`).bind(transactionId, environment),
  ];
}

export async function handleTransaction(transaction: TransactionNotification, context: Context) {
  if (transaction.status !== 'completed' || !transaction.customerId) throw new ApiError('Incomplete Paddle payment event.', 422);
  const total = money(transaction.details?.totals?.total);
  const token = transaction.customData?.fivegen_checkout_intent;
  const db = database();
  const intent = typeof token === 'string' ? await db.prepare('SELECT * FROM paddle_checkout_intents WHERE id=? AND environment=?').bind(token, context.environment).first<Intent>() : null;
  let owner: string | null = null;
  if (intent) {
    if (transaction.subscriptionId || transaction.items.length !== 1 || transaction.items[0].price?.id !== intent.price_id || transaction.items[0].quantity !== 1 || transaction.items[0].price?.billingCycle || Number(total) <= 0) throw new ApiError('Paddle credit purchase does not match its server checkout intent.', 409);
    const customer = await paddleServer().customers.get(transaction.customerId);
    if (customer.email.toLowerCase() !== intent.email.toLowerCase()) throw new ApiError('Paddle customer does not match the signed-in checkout account.', 409);
    const bound = await db.prepare('SELECT owner,environment FROM paddle_customers WHERE customer_id=?').bind(transaction.customerId).first<{ owner: string | null; environment: string }>();
    if (bound && (bound.environment !== context.environment || (bound.owner && bound.owner !== intent.owner))) throw new ApiError('This Paddle customer is already linked to another account.', 409);
    owner = intent.owner;
  }
  const statements = [ensureCustomer(transaction.customerId, context, intent?.email)];
  if (owner) statements.push(db.prepare('UPDATE paddle_customers SET owner=COALESCE(owner,?) WHERE customer_id=? AND environment=?').bind(owner, transaction.customerId, context.environment));
  statements.push(db.prepare(`INSERT INTO paddle_transactions (transaction_id,environment,customer_id,owner,intent_id,status,currency,total,credits,created_at,updated_at,event_time)
    SELECT ?,?,?,CASE WHEN EXISTS(SELECT 1 FROM paddle_customers WHERE customer_id=? AND environment=? AND owner=?) THEN ? ELSE NULL END,?,?,?,?,?,?,?,?
    ON CONFLICT(transaction_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,event_time=excluded.event_time
    WHERE paddle_transactions.environment=excluded.environment AND excluded.event_time>paddle_transactions.event_time`)
    .bind(transaction.id, context.environment, transaction.customerId, transaction.customerId, context.environment, owner, owner, intent?.id ?? null, transaction.status, transaction.currencyCode, total, intent?.credits ?? 0, transaction.createdAt, transaction.updatedAt, context.time));
  if (owner && intent) {
    const wallet = context.environment === 'sandbox' ? 'paddle_test_wallets' : 'wallets';
    const column = context.environment === 'sandbox' ? 'credits' : 'purchased';
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO ${wallet} (owner) VALUES (?)`).bind(owner),
      db.prepare(`UPDATE ${wallet} SET ${column}=${column}+(SELECT credits FROM paddle_transactions WHERE transaction_id=?) WHERE owner=? AND EXISTS(SELECT 1 FROM paddle_transactions WHERE transaction_id=? AND owner=? AND environment=? AND credited=0)`).bind(transaction.id, owner, transaction.id, owner, context.environment),
      db.prepare('UPDATE paddle_transactions SET credited=1 WHERE transaction_id=? AND owner=? AND environment=? AND credited=0').bind(transaction.id, owner, context.environment),
    );
  }
  statements.push(...reversalStatements(transaction.id, context.environment));
  await db.batch(statements);
  if (owner) {
    const saved = await db.prepare('SELECT owner FROM paddle_transactions WHERE transaction_id=?').bind(transaction.id).first<{ owner: string | null }>();
    if (saved?.owner !== owner) throw new ApiError('Paddle customer account binding needs review.', 409);
  }
}

export async function handleAdjustment(adjustment: AdjustmentNotification, context: Context) {
  const total = money(adjustment.totals.total);
  await database().batch([
    database().prepare(`INSERT INTO paddle_adjustments (adjustment_id,environment,transaction_id,action,status,total,created_at,updated_at,event_time) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(adjustment_id) DO UPDATE SET status=excluded.status,total=excluded.total,updated_at=excluded.updated_at,event_time=excluded.event_time
      WHERE paddle_adjustments.environment=excluded.environment AND excluded.event_time>paddle_adjustments.event_time`)
      .bind(adjustment.id, context.environment, adjustment.transactionId, adjustment.action, adjustment.status, total, adjustment.createdAt, adjustment.updatedAt, context.time),
    ...reversalStatements(adjustment.transactionId, context.environment),
  ]);
}

export async function dispatchPaddleEvent(event: EventEntity, environment: Environment): Promise<boolean> {
  const context = { environment, time: eventTime(event.occurredAt), occurredAt: event.occurredAt };
  switch (event.eventType) {
    case EventName.CustomerCreated: case EventName.CustomerUpdated:
      await handleCustomer(event.data, context); break;
    case EventName.SubscriptionCreated: case EventName.SubscriptionUpdated: case EventName.SubscriptionCanceled:
    case EventName.SubscriptionActivated: case EventName.SubscriptionTrialing: case EventName.SubscriptionPaused:
    case EventName.SubscriptionPastDue: case EventName.SubscriptionResumed:
      await handleSubscription(event.data, context); break;
    case EventName.TransactionCompleted:
      await handleTransaction(event.data, context); break;
    case EventName.AdjustmentCreated: case EventName.AdjustmentUpdated:
      await handleAdjustment(event.data, context); break;
    default: return false;
  }
  // A crash before this audit insert is safe: each handler above can be replayed.
  await database().prepare('INSERT OR IGNORE INTO paddle_webhook_events (event_id,environment,event_type,occurred_at,processed_at) VALUES (?,?,?,?,?)')
    .bind(event.eventId, environment, event.eventType, event.occurredAt, Date.now()).run();
  return true;
}
