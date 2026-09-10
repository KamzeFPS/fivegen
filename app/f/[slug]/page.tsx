import { notFound } from "next/navigation";
import { binding,database,productFromRow } from "@/lib/server";
import { planFor } from "@/lib/billing";
import { quoteProduct } from "@/lib/offers-server";
import { FunnelView } from "@/app/funnel-view";
import { Brand } from "@/app/ui-brand";
import Purchase from "@/app/p/[slug]/purchase";
export const dynamic="force-dynamic";
export default async function Funnel({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;const row=await database().prepare("SELECT p.*,s.stripe_account,s.name as seller_name FROM products p LEFT JOIN sellers s ON p.owner=s.owner WHERE p.slug=? AND p.status='published'").bind(slug).first();if(!row)notFound();
  const p=productFromRow(row),c=p.commerce!;if(!c.funnel.enabled||(await planFor(String(row.owner))).tier!=="pro")notFound();
  const quote=await quoteProduct(slug).then(q=>q.quote).catch(()=>null);
  return <div className="published-funnel"><nav className="store-nav"><a href="/"><Brand/></a><span>{String(row.seller_name||"Independent creator")}</span></nav><FunnelView funnel={c.funnel} checkout={<Purchase slug={slug} price={p.price} available={p.price===0||!!(row.stripe_account&&binding("STRIPE_SECRET_KEY"))} whopUrl={p.whopUrl} billing={c.billing} hasCode={!!c.deal.code} volume={c.deal.type==="volume"} initialQuote={quote} cta={c.funnel.cta} endsAt={c.deal.endsAt}/>}/><footer className="store-footer"><a href={`/p/${slug}`}>Product details</a><a href="/">Made with FiveGen</a></footer></div>;
}
