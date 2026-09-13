import { database } from '../server';
import { subscriptionGrantsAccess } from './access';
import { paddleEnvironment } from './server';
import {subscriptionCreditBalance} from '../subscription-credits';

export async function paddleAccount(owner: string) {
  const environment = paddleEnvironment();
  const db = database();
  const [customers, subscriptions, payments, testWallet] = await Promise.all([
    db.prepare('SELECT customer_id,email FROM paddle_customers WHERE environment=? AND owner=? ORDER BY updated_at DESC').bind(environment, owner).all<{ customer_id: string; email: string }>(),
    db.prepare('SELECT s.* FROM paddle_subscriptions s JOIN paddle_customers c ON s.customer_id=c.customer_id AND s.environment=c.environment WHERE c.owner=? AND s.environment=? ORDER BY s.updated_at DESC').bind(owner, environment).all<{ subscription_id: string; customer_id: string; status: string; scheduled_change_action: string | null; scheduled_change_at: string | null }>(),
    db.prepare('SELECT t.transaction_id,t.status,t.credits,t.credited,t.reversed,t.created_at,p.credits AS monthly_credits FROM paddle_transactions t LEFT JOIN paddle_subscription_periods p ON p.transaction_id=t.transaction_id AND p.environment=t.environment WHERE t.environment=? AND t.owner=? ORDER BY t.created_at DESC LIMIT 30').bind(environment, owner).all<{ transaction_id: string; status: string; credits: number; credited: number; reversed: number; created_at: string; monthly_credits:number|null }>(),
    db.prepare('SELECT credits FROM paddle_test_wallets WHERE owner=?').bind(owner).first<{ credits: number }>(),
  ]);
  // node:sqlite returns rows with a null prototype. Normalize them before they
  // cross React's server-to-client boundary; JSON API responses do this too.
  const credits=await subscriptionCreditBalance(owner,environment);
  return { environment, subscriptionCredits:credits.included,creditsResetAt:credits.renewsAt,customers: customers.results.map(row => ({ ...row })), subscriptions: subscriptions.results.map(row => ({ ...row })), payments: payments.results.map(row => ({ ...row })), hasPaidAccess: subscriptions.results.some(subscriptionGrantsAccess), sandboxCredits: environment === 'sandbox' ? (testWallet?.credits ?? 0)+credits.included : null };
}

export async function hasPaddlePaidAccess(owner: string): Promise<boolean> {
  const environment = paddleEnvironment();
  const rows = await database().prepare("SELECT s.status FROM paddle_subscriptions s JOIN paddle_customers c ON s.customer_id=c.customer_id AND s.environment=c.environment WHERE c.owner=? AND s.environment=? AND s.status IN ('active','trialing') LIMIT 1").bind(owner, environment).all<{ status: string }>();
  return rows.results.some(subscriptionGrantsAccess);
}
