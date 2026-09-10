import { notFound } from "next/navigation";
import { database, productFromRow, binding } from "@/lib/server";
import { Brand, Cover } from "@/app/ui-brand";
import { Check, Layers3 } from "lucide-react";
import { money } from "@/lib/product";
import Purchase from "./purchase";
import { quoteProduct } from "@/lib/offers-server";
import { planFor } from "@/lib/billing";
import { defaultCommerce } from "@/lib/commerce";
export const dynamic = "force-dynamic";
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await database()
    .prepare(
      "SELECT p.*,s.stripe_account,s.name as seller_name FROM products p LEFT JOIN sellers s ON p.owner=s.owner WHERE p.slug=? AND p.status='published'",
    )
    .bind(slug)
    .first();
  if (!row) notFound();
  const p = productFromRow(row);
  const pro=(await planFor(String(row.owner))).tier==="pro";
  const c=pro?p.commerce!:defaultCommerce();
  const quote=await quoteProduct(slug).then(q=>q.quote).catch(()=>null);
  const available =
    p.price === 0 || !!(row.stripe_account && binding("STRIPE_SECRET_KEY"));
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
            whopUrl={p.whopUrl}
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
