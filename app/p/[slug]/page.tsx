import { notFound,redirect } from "next/navigation";
import { database, productFromRow, binding, stripeConfigured } from "@/lib/server";
import { Brand, Cover } from "@/app/ui-brand";
import { Check, Layers3 } from "lucide-react";
import { money } from "@/lib/product";
import Purchase from "./purchase";
import { quoteProduct } from "@/lib/offers-server";

import { defaultCommerce } from "@/lib/commerce";
import {getPublishedFileSale,fileSalesEnabled} from '@/lib/file-sales';
import {FileSalePageView} from '@/app/file-sale-page-view';
import FileSalePurchase from '@/app/file-sale-purchase';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export const dynamic = "force-dynamic";
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const builder=await database().prepare('SELECT slug FROM product_builder_publications WHERE slug=?').bind(slug).first();
  if(builder)redirect(`/b/${encodeURIComponent(String(builder.slug))}`);
  const sale=await getPublishedFileSale(slug);
  if(sale){
    const user=await getChatGPTUser();
    return <FileSalePageView snapshot={sale.snapshot} coverUrl={sale.snapshot.coverUploadId?`/api/file-sales/cover/${encodeURIComponent(slug)}`:undefined}><FileSalePurchase slug={slug} revisionId={sale.revisionId} ready={sale.readiness.ready} message={sale.readiness.checks.find(c=>!c.ready)?.message||''} email={user?.email}/></FileSalePageView>;
  }
  // The narrow sandbox exception does not reactivate retired legacy stores.
  if(fileSalesEnabled())notFound();
  const row = await database()
    .prepare(
      "SELECT p.*,s.stripe_account,s.name as seller_name FROM products p LEFT JOIN sellers s ON p.owner=s.owner WHERE p.slug=? AND p.status='published'",
    )
    .bind(slug)
    .first();
  if (!row) notFound();
  const p = productFromRow(row);

  const c=p.commerce!;
  const quote=await quoteProduct(slug).then(q=>q.quote).catch(()=>null);
  const available =
    p.price === 0 || !!(row.stripe_account && stripeConfigured() && binding("STRIPE_WEBHOOK_SECRET"));
  return (
    <div className="storefront">
      <nav className="store-nav">
        <a href="/">
          <Brand />
        </a>
        <span>{String(row.seller_name || "Independent creator")}</span>
      </nav>
      <main className="store-layout">
        <div className="store-art">
          <Cover
            product={{ title: p.title, format: p.format, color: p.color }}
            large
          />
        </div>
        <div className="store-meta">
          <span className="store-format">
            {p.format} · Instant digital access
          </span>
          <h1>{p.title}</h1>
          <p>{p.description}</p>
          <Purchase
            slug={p.slug}
            price={p.price}
            available={available}
            billing={p.commerce?.billing||"once"}
            hasCode={!!c.deal.code}
            volume={c.deal.type==="volume"}
            initialQuote={quote}
            endsAt={c.deal.endsAt}
          />
          <ul className="store-benefits">
            {p.content.benefits.map((b, i) => (
              <li key={i}>
                <Check size={16} />
                {b}
              </li>
            ))}
            <li>
              <Layers3 size={16} />
              {p.content.sections.length} thoughtfully organized sections
            </li>
          </ul>
        </div>
      </main>
      <section className="store-content-list">
        <h2>A look inside</h2>
        {p.content.sections.map((s, i) => (
          <div key={i}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            {s.title}
          </div>
        ))}
      </section>
      <footer className="store-footer">
        Created by {String(row.seller_name || "an independent creator")} ·{" "}
        <a href="/">Made with FiveGen.</a>
      </footer>
    </div>
  );
}
