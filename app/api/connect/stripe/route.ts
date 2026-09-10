import {
  database,
  failure,
  identity,
  sameOrigin,
  stripe,
  binding,
  ApiError,
} from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const u = await identity();
    if (!binding("STRIPE_SECRET_KEY"))
      throw new ApiError(
        "The platform owner needs to configure Stripe Connect before sellers can connect.",
        503,
      );
    const db = database();
    let s = await db
      .prepare("SELECT stripe_account FROM sellers WHERE owner=?")
      .bind(u.userId)
      .first();
    let account = s?.stripe_account;
    if (!account) {
      const a = await stripe(
        "accounts",
        new URLSearchParams({
          type: "standard",
          email: u.email,
          "metadata[folio_owner]": u.userId,
        }),
      );
      account = a.id;
      await db
        .prepare(
          "INSERT INTO sellers (owner,name,stripe_account,created_at) VALUES (?,?,?,?) ON CONFLICT(owner) DO UPDATE SET stripe_account=excluded.stripe_account",
        )
        .bind(u.userId, "My studio", account, Date.now())
        .run();
    }
    const origin = new URL(req.url).origin;
    const link = await stripe(
      "account_links",
      new URLSearchParams({
        account: String(account),
        type: "account_onboarding",
        refresh_url: `${origin}/?stripe=refresh`,
        return_url: `${origin}/?stripe=connected`,
      }),
    );
    return Response.json({ url: link.url });
  } catch (e) {
    return failure(e);
  }
}
