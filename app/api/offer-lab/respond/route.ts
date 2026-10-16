import { ApiError, failure, sameOrigin } from '@/lib/server';
import { respondToOffer } from '@/lib/offer-lab-server';
export async function POST(request: Request) {
  try { sameOrigin(request); const body = await request.text(); if (body.length > 5000) throw new ApiError('Please shorten your response.', 413); let input: unknown; try { input = JSON.parse(body); } catch { throw new ApiError('Send a valid response.'); } return Response.json(await respondToOffer(input), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return failure(error); }
}
