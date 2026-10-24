import { failure } from '@/lib/server';
import { productPageImage } from '@/lib/product-page-server';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  try { const { slug, kind } = await params; return await productPageImage(slug, kind); }
  catch (error) { return failure(error); }
}
