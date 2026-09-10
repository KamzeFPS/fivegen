import { z } from "zod";
import { ApiError, database, failure, sameOrigin, stripe } from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { slug } = z
      .object({ slug: z.string().max(80) })
      .parse(await req.json());
    const db = database();
    const p = await db
      .prepare(
        "SELECT p.*,s.stripe_account FROM products p LEFT JOIN sellers s ON p.owner=s.owner WHERE p.slug=? AND p.status='published'",
      )
      .bind(slug)
      .first();
    if (!p) throw new ApiError("This product is unavailable.", 404);
    const origin = new URL(req.url).origin;
    if (Number(p.price) === 0)
      return Response.json({ url: `${origin}/api/download/${slug}` });
    if (!p.stripe_account)
      throw new ApiError("This creator has not connected payments yet.", 409);
    const account = await stripe(`accounts/${p.stripe_account}`);
    if (!account.charges_enabled)
      throw new ApiError("This creator’s payment setup is not complete.", 409);
    const session = await stripe(
      "checkout/sessions",
      new URLSearchParams({
        mode: "payment",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(p.price),
        "line_items[0][price_data][product_data][name]": String(p.title),
        "line_items[0][quantity]": "1",
        success_url: `${origin}/p/${slug}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/p/${slug}`,
        "metadata[product_id]": String(p.id),
        "metadata[owner]": String(p.owner),
        "metadata[expected_amount]": String(p.price),
      }),
      String(p.stripe_account),
    );
    return Response.json({ url: session.url });
  } catch (e) {
    return failure(e);
  }
}
