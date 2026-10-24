import { failure, sameOrigin } from '@/lib/server';
import { addProductReview, getPublicProductReviews } from '@/lib/product-page-server';

type Context = { params: Promise<{ slug: string }> };
const headers = { 'Cache-Control': 'no-store' };
export async function GET(_request: Request, { params }: Context) {
  try { const { slug } = await params; return Response.json({ reviewSummary: await getPublicProductReviews(slug) }, { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  try { sameOrigin(request); const { slug } = await params; return Response.json({ reviewSummary: await addProductReview(request, slug, await request.json()) }, { status: 201, headers }); }
  catch (error) { return failure(error); }
}
