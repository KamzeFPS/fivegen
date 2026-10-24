import { failure, identity, sameOrigin } from '@/lib/server';
import { getProductPage, saveProductPage } from '@/lib/product-page-server';

type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(_request: Request, { params }: Context) {
  try { const user = await identity(), { id } = await params; return Response.json({ page: await getProductPage(id, user.userId) }, { headers }); }
  catch (error) { return failure(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try { sameOrigin(request); const user = await identity(), { id } = await params; return Response.json({ page: await saveProductPage(id, user.userId, await request.json()) }, { headers }); }
  catch (error) { return failure(error); }
}
