import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ApiError } from "@/lib/server";
import { getPublicProductPage } from "@/lib/product-page-server";
import { ProductPageView } from "@/app/product-page-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type ProductPageRouteProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string | string[] }>;
};

export async function generateMetadata({ params }: Pick<ProductPageRouteProps, "params">): Promise<Metadata> {
  try {
    const { slug } = await params;
    const page = await getPublicProductPage(slug);
    return { title: `${page.product.title} | FiveGen`, description: page.product.description.slice(0, 300) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { title: "Product page unavailable | FiveGen", robots: { index: false, follow: false } };
    throw error;
  }
}

export default async function PublicProductPage({ params, searchParams }: ProductPageRouteProps) {
  const { slug } = await params;
  const page = await getPublicProductPage(slug).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  const query = await searchParams;
  const reviewOrderId = typeof query.order === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.order) ? query.order : undefined;
  return <main className="product-public-shell">
    <header className="product-public-header"><a href="/" aria-label="FiveGen home"><img src="/brand/fivegen-transparent.webp" alt="FiveGen"/></a><nav aria-label="Product access"><a href="/customer">My purchases</a><a href={`mailto:kamzewac@gmail.com?subject=${encodeURIComponent(`Product page report: ${page.product.title}`)}`}>Report product</a></nav></header>
    <ProductPageView product={page.product} config={page.config} reviewSummary={page.reviewSummary} iconUrl={page.config.iconUploadId ? `/api/product-pages/${encodeURIComponent(slug)}/image/icon` : null} bannerUrl={page.config.bannerUploadId ? `/api/product-pages/${encodeURIComponent(slug)}/image/banner` : null} funnelPath={page.funnelPath} reviewOrderId={reviewOrderId}/>
  </main>;
}
