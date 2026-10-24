import { failure, identity, sameOrigin } from '@/lib/server';
import { publishProductPage, unpublishProductPage } from '@/lib/product-page-server';

type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(request: Request, { params }: Context) {
  try { sameOrigin(request); const user = await identity(), { id } = await params; return Response.json({ page: await publishProductPage(id, user.userId, await request.json()) }, { headers }); }
  catch (error) { return failure(error); }
}
export async function DELETE(request: Request, { params }: Context) {
  try { sameOrigin(request); const user = await identity(), { id } = await params; return Response.json({ page: await unpublishProductPage(id, user.userId, await request.json()) }, { headers }); }
  catch (error) { return failure(error); }
}
