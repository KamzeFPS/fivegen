import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ApiError } from "@/lib/server";
import { getPublicProductPage } from "@/lib/product-page-server";
import {Brand} from '@/app/ui-brand';
import {ProductPageExperiment} from "@/app/product-page-experiment";
import {publicPageMetadata} from '@/lib/seo';
import {publicHostAppOrigin} from '@/lib/public-host';

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
    return publicPageMetadata({title: `${page.config.seoTitle || page.product.title} | FiveGen`, description: page.config.seoDescription || page.product.description.slice(0, 300), path: '/product/' + encodeURIComponent(slug)});
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { title: "Product page unavailable | FiveGen", robots: { index: false, follow: false } };
    throw error;
  }
}

export default async function PublicProductPage({ params, searchParams }: ProductPageRouteProps) {
  const { slug } = await params;
  const page = await getPublicProductPage(slug).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  const query = await searchParams;
  const canonicalOrigin=await publicHostAppOrigin();
  const reviewOrderId = !canonicalOrigin&&typeof query.order === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.order) ? query.order : undefined;
  return <main className="product-public-shell">
    <header className="product-public-header"><a href={canonicalOrigin||'/'} aria-label="FiveGen home"><Brand/></a><nav aria-label="Product access"><a href={(canonicalOrigin||'')+'/customer'}>My purchases</a><a href={`mailto:kamzewac@gmail.com?subject=${encodeURIComponent(`Product page report: ${page.product.title}`)}`}>Report product</a></nav></header>
    <ProductPageExperiment canonicalOrigin={canonicalOrigin} pageId={page.pageId} pageVersion={page.publishedAt} publishedAt={page.publishedAt} product={page.product} config={page.config} commerce={page.commerce} reviewSummary={page.reviewSummary} iconUrl={page.config.iconUploadId ? (canonicalOrigin||'')+`/api/product-pages/${encodeURIComponent(slug)}/image/icon` : null} bannerUrl={page.config.bannerUploadId ? (canonicalOrigin||'')+`/api/product-pages/${encodeURIComponent(slug)}/image/banner` : null} funnelPath={canonicalOrigin&&page.funnelPath?.startsWith('/')?canonicalOrigin+page.funnelPath:page.funnelPath} reviewOrderId={reviewOrderId}/>
  </main>;
}
