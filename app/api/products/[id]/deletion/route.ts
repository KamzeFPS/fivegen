import { getProductDeletion } from '@/lib/product-deletion-server';
import { failure, identity } from '@/lib/server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await identity(), { id } = await params;
    return Response.json(await getProductDeletion(id, user.userId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
