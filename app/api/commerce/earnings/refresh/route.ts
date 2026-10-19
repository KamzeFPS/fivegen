import { z } from 'zod';
import { failure, identity, sameOrigin } from '@/lib/server';
import { refreshCommerceEarnings } from '@/lib/commerce-earnings-server';

export async function POST(request: Request) {
  try {
    const user = await identity();
    sameOrigin(request);
    const input = z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30), productId: z.string().uuid().optional() }).strict().parse(await request.json());
    return Response.json(await refreshCommerceEarnings(user.userId, input.days, input.productId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
