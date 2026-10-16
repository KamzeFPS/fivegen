import { failure, identity, sameOrigin } from '@/lib/server';
import { getGrowth, saveGrowth } from '@/lib/growth-server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await identity(), { id } = await params;
    return Response.json({ growth: await getGrowth(id, user.userId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const user = await identity(), { id } = await params;
    return Response.json({ growth: await saveGrowth(id, user.userId, await request.json()) });
  } catch (error) { return failure(error); }
}
