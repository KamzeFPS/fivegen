import { z } from "zod";
import {
  binding,
  database,
  failure,
  identity,
  productFromRow,
  sameOrigin,
  stripe,
} from "@/lib/server";
import { providerSettings } from "@/lib/ai";
import { planFor } from "@/lib/billing";
import {isAdmin} from "@/lib/admin";
import {creditBalance} from "@/lib/credits";
import {textCredits} from "@/lib/credit-policy";
export async function GET() {
  try {
    const user = await identity();
    const db = database();
    const [p, o, v, s, ai] = await Promise.all([
      db
        .prepare(
          "SELECT * FROM products WHERE owner=? ORDER BY created_at DESC",
        )
        .bind(user.userId)
        .all(),
      db
        .prepare(
          "SELECT o.*,p.title FROM orders o LEFT JOIN products p ON o.product_id=p.id WHERE o.owner=? AND o.provider<>'free' ORDER BY o.created_at DESC LIMIT 10000",
        )
        .bind(user.userId)
        .all(),
      db
        .prepare("SELECT created_at FROM visits WHERE owner=? AND created_at>?")
        .bind(user.userId, Date.now() - 90 * 86400000)
        .all(),
      db
        .prepare("SELECT * FROM sellers WHERE owner=?")
        .bind(user.userId)
        .first(),
      providerSettings(user.userId),
    ]);
    let stripeReady = false;
    if (s?.stripe_account && binding("STRIPE_SECRET_KEY")) {
      try {
        const acct = await stripe(`accounts/${s.stripe_account}`);
        stripeReady = acct.charges_enabled === true;
      } catch {
        /* Connection remains visible; checkout validates again. */
      }
    }
    return Response.json({
      admin:isAdmin(user),credits:await creditBalance(user.userId),textCost:textCredits(ai.config.textProvider),
      plan: await planFor(user.userId),
      products: p.results.map(productFromRow),
      orders: o.results.map((r) => ({
        id: r.id,
        productId: r.product_id,
        email: r.email,
        amount: r.amount,
        platformFee:r.platform_fee,
        provider: r.provider,
        createdAt: r.created_at,
        title: r.title,
      })),
      visits: v.results.map((r) => ({ createdAt: r.created_at })),
      settings: {
        name: s?.name || "My studio",
        stripeAccount: s?.stripe_account || null,
      },
      capabilities: {
        ai: ai.connected[ai.config.textProvider]&&!ai.config.paused,
        stripe: !!binding("STRIPE_SECRET_KEY"),
        domain: binding("PRODUCT_DOMAIN") || null,
      },
      stripeReady,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const u = await identity();
    const d = z
      .object({ name: z.string().trim().min(1).max(60) })
      .parse(await req.json());
    await database()
      .prepare(
        "INSERT INTO sellers (owner,name,created_at) VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name",
      )
      .bind(u.userId, d.name, Date.now())
      .run();
    return Response.json({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
