import { z } from "zod";
import { database, failure, sameOrigin } from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { slug } = z
      .object({ slug: z.string().max(80) })
      .parse(await req.json());
    const p = await database()
      .prepare(
        "SELECT id,owner FROM products WHERE slug=? AND status='published'",
      )
      .bind(slug)
      .first();
    if (p)
      await database()
        .prepare(
          "INSERT INTO visits (id,product_id,owner,created_at) VALUES (?,?,?,?)",
        )
        .bind(crypto.randomUUID(), p.id, p.owner, Date.now())
        .run();
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
