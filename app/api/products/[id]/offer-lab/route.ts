import { ApiError, failure, identity, sameOrigin } from '@/lib/server';
import { changeOfferLab, getOfferLab } from '@/lib/offer-lab-server';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { const user = await identity(), { id } = await params; return Response.json({ lab: await getOfferLab(id, user.userId) }, { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return failure(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try { sameOrigin(request); const user = await identity(), { id } = await params, body = await request.text(); if (body.length > 24000) throw new ApiError('Please shorten your offer.', 413); return Response.json({ lab: await changeOfferLab(id, user.userId, JSON.parse(body)) }); }
  catch (error) { return failure(error); }
}
