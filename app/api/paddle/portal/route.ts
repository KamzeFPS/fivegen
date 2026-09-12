import { ApiError, failure, identity, sameOrigin } from '@/lib/server';
import { paddleAccount } from '@/lib/paddle/account';
import { paddleServer } from '@/lib/paddle/server';

export async function POST(request: Request) {
  try {
    // Authenticate before any account lookup or Paddle API call. No customer
    // ID, subscription ID, or email from the request body is ever trusted.
    const user = await identity();
    sameOrigin(request);
    const account = await paddleAccount(user.userId);
    const customer = account.customers[0];
    if (!customer) throw new ApiError('Your Paddle billing profile will appear after your first verified purchase.', 404);
    const subscriptionIds = account.subscriptions.filter(subscription => subscription.customer_id === customer.customer_id).map(subscription => subscription.subscription_id).slice(0, 25);
    const session = await paddleServer().customerPortalSessions.create(customer.customer_id, subscriptionIds);
    const url = new URL(session.urls.general.overview);
    if (url.protocol !== 'https:' || !['customer-portal.paddle.com', 'sandbox-customer-portal.paddle.com'].includes(url.hostname)) throw new ApiError('Paddle returned an unexpected portal URL.', 502);
    return Response.json({ url: url.href }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
