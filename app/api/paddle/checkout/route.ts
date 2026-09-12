import { z } from 'zod';
import { ApiError, binding, database, failure, identity, sameOrigin } from '@/lib/server';
import { parsePaddleConfig } from '@/lib/paddle/catalog';
import { paddleServer, paddleSigningSecret } from '@/lib/paddle/server';

export async function POST(request: Request) {
  try {
    const user = await identity();
    sameOrigin(request);
    const { priceId } = z.object({ priceId: z.string() }).strict().parse(await request.json());
    const config = parsePaddleConfig(binding);
    paddleSigningSecret();
    paddleServer();
    const tier = config.tiers.find(tier => tier.priceId === priceId);
    if (!tier) throw new ApiError('Choose a valid credit pack.');
    const id = crypto.randomUUID();
    await database().prepare('INSERT INTO paddle_checkout_intents (id,environment,owner,email,price_id,pack_id,credits,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, config.environment, user.userId, user.email, tier.priceId, tier.packId, tier.credits, Date.now()).run();
    return Response.json({ customData: { fivegen_checkout_intent: id }, email: user.email }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
