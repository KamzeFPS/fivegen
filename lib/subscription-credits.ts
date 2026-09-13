import {database} from './server';
import {monthlyWindow} from './credit-policy';

export function spendableGrant(now:number) {
  // Negative balances from refunded, already-spent credits remain debts after
  // expiry or cancellation. Paused/past-due credits resume only with actual status.
  return `(g.remaining<0 OR (g.starts_at<=${now} AND g.expires_at>${now} AND EXISTS(SELECT 1 FROM paddle_subscriptions s WHERE s.subscription_id=g.subscription_id AND s.environment=g.environment AND s.status IN ('active','trialing'))))`;
}
export async function refreshSubscriptionCredits(owner:string,environment='production',now=Date.now()) {
  const db=database();
  const periods=await db.prepare(`SELECT p.* FROM paddle_subscription_periods p JOIN paddle_subscriptions s ON s.subscription_id=p.subscription_id AND s.environment=p.environment WHERE p.owner=? AND p.environment=? AND p.starts_at<=? AND p.ends_at>? AND s.status IN ('active','trialing')`).bind(owner,environment,now,now).all();
  const statements:D1PreparedStatement[]=[];
  for(const period of periods.results){
    const cycle=monthlyWindow(Number(period.starts_at),Number(period.ends_at),now);
    const id=`${environment}:${period.transaction_id}:${cycle.start}`;
    statements.push(db.prepare('INSERT OR IGNORE INTO subscription_credit_grants (id,owner,environment,transaction_id,subscription_id,credits,remaining,starts_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id,owner,environment,period.transaction_id,period.subscription_id,period.credits,period.credits,cycle.start,cycle.end));
  }
  // Recompute refunds from permanent adjustment records. This also catches an
  // adjustment delivered before its payment, and chargeback reversals.
  const refunded=`(SELECT COALESCE(SUM(CASE WHEN action IN ('refund','chargeback') THEN CAST(total AS INTEGER) WHEN action='chargeback_reverse' THEN -CAST(total AS INTEGER) ELSE 0 END),0) FROM paddle_adjustments a WHERE a.transaction_id=g.transaction_id AND a.environment=g.environment AND a.status='approved')`;
  const total=`(SELECT CAST(total AS INTEGER) FROM paddle_transactions t WHERE t.transaction_id=g.transaction_id AND t.environment=g.environment)`;
  const target=`min(g.credits,max(0,CAST((g.credits*max(0,${refunded})+${total}-1)/${total} AS INTEGER)))`;
  statements.push(db.prepare(`UPDATE subscription_credit_grants AS g SET remaining=remaining-((${target})-reversed),reversed=${target} WHERE owner=? AND environment=? AND ${total}>0`).bind(owner,environment));
  await db.batch(statements);
}
export async function subscriptionCreditBalance(owner:string,environment='production',now=Date.now()) {
  await refreshSubscriptionCredits(owner,environment,now);
  const row=await database().prepare(`SELECT COALESCE(SUM(g.remaining),0) balance,MIN(CASE WHEN g.expires_at>? THEN g.expires_at ELSE NULL END) expires FROM subscription_credit_grants g WHERE owner=? AND environment=? AND ${spendableGrant(now)}`).bind(now,owner,environment).first<{balance:number;expires:number|null}>();
  return {included:Number(row?.balance||0),renewsAt:row?.expires??null};
}
