import { z } from 'zod';
import { ApiError, binding, database, failure, identity, sameOrigin } from '@/lib/server';
import { parsePaddleConfig } from '@/lib/paddle/catalog';
import { assertPaddleCheckoutReleased, paddleServer, paddleSigningSecret } from '@/lib/paddle/server';

export async function POST(request: Request) {
  try {
    const user = await identity();
    sameOrigin(request);
    assertPaddleCheckoutReleased();
    const { priceId } = z.object({ priceId: z.string() }).strict().parse(await request.json());
    const config = parsePaddleConfig(binding);
    paddleSigningSecret();
    paddleServer();
    const tier = [...config.tiers,...(config.subscriptions||[])].find(tier => tier.priceId === priceId);
    if (!tier) throw new ApiError('Choose a valid credit pack.');
    if(tier.billingInterval){
      const existing=await database().prepare("SELECT s.subscription_id FROM paddle_subscriptions s JOIN paddle_customers c ON c.customer_id=s.customer_id AND c.environment=s.environment WHERE c.owner=? AND s.environment=? AND s.status IN ('active','trialing','past_due','paused') LIMIT 1").bind(user.userId,config.environment).first();
      if(existing)throw new ApiError('You already have a subscription. Manage it in Account & billing; use a credit pack for extra credits.',409);
    }
    const id = crypto.randomUUID();
    await database().prepare('INSERT INTO paddle_checkout_intents (id,environment,owner,email,price_id,pack_id,credits,created_at,billing_interval) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id, config.environment, user.userId, user.email, tier.priceId, tier.packId, tier.credits, Date.now(),tier.billingInterval||null).run();
    return Response.json({ customData: { fivegen_checkout_intent: id }, email: user.email }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
