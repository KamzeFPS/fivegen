import { notFound } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@/lib/server";
import { getPublicFunnel } from "@/lib/growth-funnel-server";
import { GrowthOptIn } from "@/app/growth-opt-in";
import { CommerceCheckout } from "@/app/commerce-checkout";
import { publicCommerceOffer } from "@/lib/commerce-v2-server";
import { GrowthTracker } from "@/app/growth-tracker";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  try { const { slug } = await params, funnel = await getPublicFunnel(slug); return { title: `${funnel.landing.headline} | ${funnel.title}`, description: funnel.landing.subheadline }; }
  catch (error) { if (error instanceof ApiError && error.status === 404) return { title: "Page unavailable", robots: { index: false } }; throw error; }
}
export default async function GrowthLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const funnel = await getPublicFunnel(slug).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  const landing = funnel.landing;
  const offer = await publicCommerceOffer(slug);
  return <main className="growth-public"><GrowthTracker slug={slug}/>
    <header className="growth-public-header"><span className="growth-public-brand">{funnel.title}</span><a href="#join" className="button secondary">{landing.ctaLabel}</a></header>
    <section className="growth-public-hero"><span className="eyebrow">A NOTE FROM YOUR CREATOR</span><h1>{landing.headline}</h1><p>{landing.subheadline}</p><a href="#join" className="button primary">{landing.ctaLabel}</a></section>
    {funnel.creatorVslUploadId && <section className="growth-public-video"><video controls playsInline preload="metadata" src={`/api/growth/video/${encodeURIComponent(funnel.slug)}`} aria-label={`An introduction to ${funnel.title}`}/></section>}
    <div className="growth-public-grid"><section className="growth-public-copy"><h2>What’s possible</h2><div style={{ whiteSpace: "pre-wrap" }}>{landing.body}</div>{landing.benefits.length > 0 && <ul>{landing.benefits.map((benefit, index) => <li key={index}>{benefit}</li>)}</ul>}</section><section id="join" className="growth-public-form">{offer&&<CommerceCheckout slug={funnel.slug} amount={offer.amount} currency={offer.currency} mode={offer.mode}/>}<GrowthOptIn slug={funnel.slug} ctaLabel={landing.ctaLabel}/></section></div>
    <footer className="growth-public-footer"><span>{funnel.title}</span><Link href="/">Built with 5GEN</Link></footer>
  </main>;
}
