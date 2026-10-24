import { ApiError, database } from './server';
import { creatorPlans, freeCreatorPlan, type CreatorPlanId, type CreatorPlanState } from './creator-plans';

// These identifiers were frozen by FiveGen's server-owned checkout catalog.
// Do not infer a cheaper commission from customer metadata, remaining credits,
// an unverified subscription.created event, or an administrator's AI exemption.
function walletPlan(offer: string, interval: unknown): CreatorPlanId | null {
  if (interval !== 'month' && interval !== 'year') return null;
  if (offer === `subscription:pro:${interval}`) return 'pro';
  if (offer === `subscription:studio:${interval}`) return 'legacy-studio';
  if (offer === 'subscription:scale:month' && interval === 'month') return 'scale';
  return null;
}

/** Return the seller's current, paid commission entitlement in one Stripe mode.
 * Mirrored subscription status AND a verified, not fully reversed paid period
 * must cover now. A scheduled cancellation does not end an already-paid period.
 * No Stripe object IDs or plan claims are accepted from the client. */
export async function creatorPlan(owner: string, mode: 'test' | 'live', now = Date.now()): Promise<CreatorPlanState> {
  if (mode !== 'test' && mode !== 'live') throw new ApiError('Select an explicit payment mode before resolving creator benefits.', 503);
  if (!Number.isSafeInteger(now) || now < 0) throw new ApiError('Invalid creator entitlement time.');
  const environment = mode === 'live' ? 'production' : 'sandbox', db = database();
  const [stripe, paddle] = await Promise.all([
    db.prepare(`SELECT i.offer_id,i.billing_interval,s.subscription_id,
      MIN(p.ends_at,s.period_end) AS paid_through
      FROM wallet_payments p
      JOIN wallet_subscriptions s ON s.subscription_id=p.subscription_id AND s.environment=p.environment AND s.owner=p.owner AND s.intent_id=p.intent_id
      JOIN wallet_checkout_intents i ON i.id=p.intent_id AND i.environment=p.environment AND i.owner=p.owner
      JOIN wallet_customers c ON c.owner=p.owner AND c.environment=p.environment AND c.customer_id=s.customer_id
      WHERE p.owner=? AND p.environment=? AND p.credited=1 AND p.amount>0 AND p.payment_intent IS NOT NULL
      AND p.credits=i.credits AND p.credits>0 AND p.reversed<p.credits
      AND p.starts_at<=? AND p.ends_at>? AND s.period_end>?
      AND s.status IN ('active','trialing')
      AND NOT EXISTS(SELECT 1 FROM wallet_charge_state r WHERE r.payment_intent=p.payment_intent AND r.environment=p.environment AND r.amount>0 AND r.reversed_amount>=r.amount)
      ORDER BY p.ends_at DESC,s.subscription_id`).bind(owner, environment, now, now, now).all(),
    // Paddle checkout is retired, but genuine existing Pro/Studio subscriptions
    // keep their benefit until their verified paid period ends. Only the exact
    // server-created recurring intent identities are recognized.
    db.prepare(`SELECT i.pack_id,i.billing_interval,s.subscription_id,p.ends_at AS paid_through
      FROM paddle_subscription_periods p
      JOIN paddle_subscriptions s ON s.subscription_id=p.subscription_id AND s.environment=p.environment
      JOIN paddle_customers c ON c.customer_id=s.customer_id AND c.environment=s.environment AND c.owner=p.owner
      JOIN paddle_transactions t ON t.transaction_id=p.transaction_id AND t.environment=p.environment AND t.owner=p.owner AND t.customer_id=c.customer_id
      JOIN paddle_checkout_intents i ON i.id=t.intent_id AND i.environment=p.environment AND i.owner=p.owner AND i.price_id=p.price_id
      WHERE p.owner=? AND p.environment=? AND s.status IN ('active','trialing') AND c.status='active'
      AND t.status='completed' AND t.credited=1 AND CAST(t.total AS INTEGER)>0
      AND p.starts_at<=? AND p.ends_at>? AND i.billing_interval IN ('month','year') AND i.pack_id IN ('pro','studio')
      AND (SELECT COALESCE(SUM(CASE WHEN a.action IN ('refund','chargeback') THEN CAST(a.total AS INTEGER) WHEN a.action='chargeback_reverse' THEN -CAST(a.total AS INTEGER) ELSE 0 END),0)
        FROM paddle_adjustments a WHERE a.transaction_id=t.transaction_id AND a.environment=t.environment AND a.status='approved')<CAST(t.total AS INTEGER)
      ORDER BY p.ends_at DESC,s.subscription_id`).bind(owner, environment, now, now).all(),
  ]);
  const candidates: CreatorPlanState[] = [];
  for (const row of stripe.results) {
    const id = walletPlan(String(row.offer_id), row.billing_interval);
    if (id) candidates.push({ ...creatorPlans[id], subscriptionId: String(row.subscription_id), paidThrough: Number(row.paid_through), source: 'stripe' });
  }
  for (const row of paddle.results) {
    const id = row.pack_id === 'pro' ? 'pro' : 'legacy-studio';
    candidates.push({ ...creatorPlans[id], subscriptionId: String(row.subscription_id), paidThrough: Number(row.paid_through), source: 'paddle' });
  }
  // Unexpected overlapping verified subscriptions never double-charge or pick
  // an arbitrary row: honor the lowest paid rate, then the furthest paid end.
  candidates.sort((a, b) => a.commissionBps - b.commissionBps || (b.paidThrough || 0) - (a.paidThrough || 0));
  return candidates[0] || freeCreatorPlan();
}
