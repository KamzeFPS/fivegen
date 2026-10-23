import { z } from 'zod';
import { ApiError, database, ownedProduct } from './server';
import { commerceMode, refreshCommerceOrderEarnings } from './commerce-v2-server';
import type { CommerceEarningsOrder, CommerceEarningsRefresh, CommerceEarningsReport } from './commerce-earnings';
import { creatorPlan } from './creator-plan-server';
import type { CommerceFeePlanId } from './creator-plans';

const orderLimit = 100;
const refreshLimit = 10;
// Include every required balance-transaction value. Missing fees stay unknown,
// rather than turning a partially populated Stripe record into zero-cost income.
const confirmed = `e.balance_transaction_id IS NOT NULL AND e.settlement_amount IS NOT NULL
  AND e.settlement_currency IS NOT NULL AND e.stripe_fee_amount IS NOT NULL
  AND e.platform_fee_amount IS NOT NULL AND e.creator_net_amount IS NOT NULL`;
const scope = ' AND (? IS NULL OR o.product_id=?)';

export function commerceEarningsPeriod(days: number) {
  if (![0, 7, 30, 90].includes(days)) throw new ApiError('Choose all time, 7, 30, or 90 days.');
  if (days === 0) return 0;
  return Math.floor(Date.now() / 86400000) * 86400000 - (days - 1) * 86400000;
}

async function earningsScope(owner: string, days: number, productId?: string) {
  const from = commerceEarningsPeriod(days);
  if (productId) { z.string().uuid().parse(productId); await ownedProduct(productId, owner); }
  // Fail on an unset/invalid environment. Financial reports must never silently
  // substitute test records when a deployment has lost its mode configuration.
  return { from, mode: commerceMode(), selected: productId || null };
}

const nullableAmount = (value: unknown) => value == null ? null : Number(value);
function earningsOrder(row: Record<string, unknown>): CommerceEarningsOrder {
  const complete = !!row.confirmed, excluded = row.status !== 'paid';
  const legacy = row.fee_plan_id === 'historical' && Number(row.expected_fee_bps) === 0 && row.charge_application_fee_amount != null && Number(row.charge_application_fee_amount) === 0;
  return {
    id: String(row.id), productId: String(row.product_id), title: String(row.title), amount: Number(row.amount), currency: String(row.currency), status: String(row.status),
    feeStatus: excluded ? 'refunded' : legacy ? 'legacy' : complete ? 'confirmed' : 'pending',
    expectedFeeBps: Number(row.expected_fee_bps), expectedFeeAmount: Number(row.expected_fee_amount),
    feePlanId: String(row.fee_plan_id) as CommerceFeePlanId,
    actualChargePlatformFeeAmount: nullableAmount(row.charge_application_fee_amount),
    settlementAmount: complete ? nullableAmount(row.settlement_amount) : null,
    settlementCurrency: complete ? String(row.settlement_currency) : null,
    stripeFeeAmount: complete ? nullableAmount(row.stripe_fee_amount) : null,
    platformFeeAmount: complete ? nullableAmount(row.platform_fee_amount) : null,
    creatorNetAmount: complete ? nullableAmount(row.creator_net_amount) : null,
    availability: String(row.availability || 'pending'), availableAt: nullableAmount(row.available_at),
    paidAt: nullableAmount(row.paid_at), createdAt: Number(row.created_at),
  };
}

export async function commerceEarnings(owner: string, days: number, productId?: string): Promise<CommerceEarningsReport> {
  const { from, mode, selected } = await earningsScope(owner, days, productId), db = database();
  const filters = ` FROM commerce_orders o LEFT JOIN commerce_earnings e ON e.order_id=o.id
    WHERE o.owner=? AND o.mode=? AND o.status IN ('paid','revoked') AND o.amount>0 AND o.paid_at>=?${scope}`;
  const values = [owner, mode, from, selected, selected];
  const [sales, totals, coverage, orders, plan] = await Promise.all([
    db.prepare(`SELECT o.currency,COUNT(*) orders,SUM(o.amount) gross${filters} AND o.status='paid' GROUP BY o.currency ORDER BY o.currency`).bind(...values).all(),
    db.prepare(`SELECT e.settlement_currency currency,COUNT(*) orders,SUM(e.settlement_amount) gross,
      SUM(e.stripe_fee_amount) stripe_fee,SUM(e.platform_fee_amount) platform_fee,SUM(e.creator_net_amount) creator_net
      ${filters} AND o.status='paid' AND ${confirmed} GROUP BY e.settlement_currency ORDER BY e.settlement_currency`).bind(...values).all(),
    db.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN o.status='paid' AND ${confirmed} THEN 1 ELSE 0 END) confirmed,
      SUM(CASE WHEN o.status='paid' AND NOT (${confirmed}) THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN o.status='paid' AND o.fee_plan_id='historical' AND o.expected_fee_bps=0 AND e.charge_application_fee_amount=0 THEN 1 ELSE 0 END) legacy,
      SUM(CASE WHEN o.status!='paid' THEN 1 ELSE 0 END) excluded${filters}`).bind(...values).first(),
    db.prepare(`SELECT o.id,o.product_id,o.title,o.amount,o.currency,o.status,o.expected_fee_bps,o.expected_fee_amount,o.fee_plan_id,o.paid_at,o.created_at,
      e.charge_application_fee_amount,e.balance_transaction_id,e.settlement_amount,e.settlement_currency,e.stripe_fee_amount,
      e.platform_fee_amount,e.creator_net_amount,e.availability,e.available_at,CASE WHEN ${confirmed} THEN 1 ELSE 0 END confirmed
      ${filters} ORDER BY o.paid_at DESC,o.id DESC LIMIT ${orderLimit}`).bind(...values).all(),
    creatorPlan(owner, mode),
  ]);
  return {
    commissionPercent: plan.commissionPercent,
    creatorPlan: plan,
    sales: sales.results.map(row => ({ currency: String(row.currency), grossAmount: Number(row.gross), orders: Number(row.orders) })),
    totals: totals.results.map(row => ({ currency: String(row.currency), grossAmount: Number(row.gross), stripeFeeAmount: Number(row.stripe_fee), platformFeeAmount: Number(row.platform_fee), creatorNetAmount: Number(row.creator_net), confirmedOrders: Number(row.orders) })),
    coverage: { totalOrders: Number(coverage?.total || 0), confirmedOrders: Number(coverage?.confirmed || 0), pendingOrders: Number(coverage?.pending || 0), legacyOrders: Number(coverage?.legacy || 0), excludedOrders: Number(coverage?.excluded || 0) },
    orders: orders.results.map(earningsOrder), orderLimit,
  };
}

export async function refreshCommerceEarnings(owner: string, days: number, productId?: string): Promise<CommerceEarningsRefresh> {
  const { from, mode, selected } = await earningsScope(owner, days, productId), db = database(), now = Date.now();
  // One shared owner/environment cooldown prevents changing product/period or
  // parallel requests from multiplying provider calls. Claim before Stripe I/O.
  const claim = await db.prepare(`INSERT INTO growth_lead_rate_limits (key,hits,expires_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET hits=hits+1,expires_at=excluded.expires_at
    WHERE growth_lead_rate_limits.expires_at<=? RETURNING key`)
    .bind(`commerce-earnings:${mode}:${owner}`, now + 60000, now).first();
  if (!claim) throw new ApiError('Your earnings were refreshed recently. Please wait one minute before refreshing again.', 429);
  // IDs and Stripe accounts come only from owned, mode-scoped database rows.
  // Reconcile the oldest/unknown records first; no fee changes or charges occur.
  const rows = await db.prepare(`SELECT o.* FROM commerce_orders o LEFT JOIN commerce_earnings e ON e.order_id=o.id
    WHERE o.owner=? AND o.mode=? AND o.status IN ('paid','revoked') AND o.payment_intent IS NOT NULL
    AND o.paid_at>=?${scope} ORDER BY o.earnings_checked_at ASC,CASE WHEN ${confirmed} THEN 1 ELSE 0 END,e.updated_at ASC,o.paid_at DESC LIMIT ${refreshLimit}`)
    .bind(owner, mode, from, selected, selected).all();
  // Advance every selected attempt before provider I/O, including failures and
  // absent balance transactions. Permanently unreadable payments must not
  // monopolize the bounded batch and starve later sales of reconciliation.
  if (rows.results.length) await db.batch(rows.results.map(order => db.prepare('UPDATE commerce_orders SET earnings_checked_at=? WHERE id=? AND owner=? AND mode=?').bind(now, String(order.id), owner, mode)));
  const result: CommerceEarningsRefresh = { refreshed: 0, pending: 0, failed: 0, limit: refreshLimit };
  // At most two read-only provider requests at once. Each fee read has a short
  // timeout and no SDK retries, keeping a ten-order refresh within a web request.
  for (let offset = 0; offset < rows.results.length; offset += 2) {
    const refreshed = await Promise.allSettled(rows.results.slice(offset, offset + 2).map(order => refreshCommerceOrderEarnings(String(order.id), owner)));
    for (const item of refreshed) {
      if (item.status === 'rejected') result.failed++;
      else if (item.value) result.refreshed++;
      else result.pending++;
    }
  }
  return result;
}
