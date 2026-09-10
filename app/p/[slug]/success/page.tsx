import { Brand } from "@/app/ui-brand";
import { ApiError, database, stripe } from "@/lib/server";
import { recordPayment } from "@/lib/payments";
import { Check, ArrowDownToLine } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Success({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { slug } = await params;
  const { session_id } = await searchParams;
  let token = "",
    error = "",
    title = "Your product";
  try {
    if (!session_id || !/^cs_[a-zA-Z0-9_]+$/.test(session_id))
      throw new ApiError(
        "The payment reference is missing. Return to the product page to try again.",
      );
    const p = await database()
      .prepare(
        "SELECT p.*,s.stripe_account FROM products p JOIN sellers s ON p.owner=s.owner WHERE p.slug=?",
      )
      .bind(slug)
      .first();
    if (!p?.stripe_account)
      throw new ApiError("This product could not be found.");
    const session = await stripe(
      `checkout/sessions/${session_id}`,
      undefined,
      String(p.stripe_account),
    );
    if (session.metadata?.product_id !== p.id)
      throw new ApiError("This payment belongs to a different product.");
    const order = await recordPayment(session, String(p.stripe_account));
    token = order!.token;
    title = String(p.title);
  } catch (e) {
    error =
      e instanceof Error
        ? e.message
        : "We could not verify your payment yet. Please refresh this page.";
  }
  return (
    <div className="storefront">
      <nav className="store-nav">
        <a href="/">
          <Brand />
        </a>
      </nav>
      <main className="delivery-card panel">
        <span className="success-symbol">
          <Check size={30} />
        </span>
        <h1>
          {error ? "Let’s check your payment." : "Something good is yours."}
        </h1>
        <p>
          {error ||
            `Thank you for purchasing ${title}. Download your product below, and save this page for future access.`}
        </p>
        {token && (
          <a
            className="button primary"
            href={`/api/download/${slug}?token=${encodeURIComponent(token)}`}
          >
            <ArrowDownToLine size={18} />
            Download your product
          </a>
        )}
        <a className="text-link" href={`/p/${slug}`}>
          Back to product
        </a>
      </main>
    </div>
  );
}
