import { briefSchema, blueprint, slugify } from "@/lib/product";
import {
  ApiError,
  database,
  failure,
  identity,
  productFromRow,
  sameOrigin,
} from "@/lib/server";
import { providerSettings } from "@/lib/ai";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const u = await identity();
    const brief = briefSchema.parse(await req.json());
    const db = database();
    const count = await db
      .prepare("SELECT COUNT(*) as n FROM products WHERE owner=?")
      .bind(u.userId)
      .first<{ n: number }>();
    if ((count?.n || 0) >= 200)
      throw new ApiError("This workspace has reached its 200-product limit.");
    const ai = await providerSettings(u.userId);
    const enabled = ai.connected[ai.config.textProvider];
    const id = crypto.randomUUID();
    const slug = slugify(brief.title) + "-" + id.slice(0, 6);
    const now = Date.now();
    const statements = [
      db
        .prepare(
          "INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          u.userId,
          slug,
          brief.title,
          brief.description,
          brief.audience,
          brief.format,
          Math.round(brief.price * 100),
          brief.color,
          JSON.stringify(blueprint(brief)),
          "draft",
          now,
          now,
        ),
    ];
    if (enabled)
      statements.push(
        db
          .prepare(
            "INSERT INTO generation (product_id,owner,brief,stage,status,lease,updated_at) VALUES (?,?,?,-1,?,0,?)",
          )
          .bind(id, u.userId, JSON.stringify(brief), "queued", now),
      );
    await db.batch(statements);
    const row = await db
      .prepare("SELECT * FROM products WHERE id=?")
      .bind(id)
      .first();
    return Response.json({
      product: productFromRow(row!),
      mode: enabled ? "ai" : "starter",
    });
  } catch (e) {
    return failure(e);
  }
}
