import { briefSchema, emptyContent, slugify } from "@/lib/product";
import {
  ApiError,
  database,
  failure,
  identity,
  productFromRow,
  sameOrigin,
} from "@/lib/server";
import { providerSettings } from "@/lib/ai";
import { planFor } from "@/lib/billing";
import {readExperience} from "@/lib/experience";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const u = await identity();
    const input = briefSchema.extend({generationMode:z.enum(["auto","manual"]).default("auto")}).parse(await req.json());
    const brief = briefSchema.parse(input);
    const db = database();
    const plan = await planFor(u.userId);
    if (plan.used >= plan.limit)
      throw new ApiError(`Your ${plan.tier === "free" ? "Free" : "Pro"} plan includes ${plan.limit} products.${plan.tier === "free" ? " Upgrade to Pro for 100 products." : " Your existing products remain available."}`, 403);
    const ai = await providerSettings(u.userId);
    const enabled = input.generationMode !== "manual" && ai.connected[ai.config.textProvider]&&!ai.config.paused;
    if (input.generationMode !== "manual" && !enabled)
      throw new ApiError("AI generation is currently unavailable. Try again later, or choose a blank manual draft.", 503);
    const id = crypto.randomUUID();
    const slug = slugify(brief.title) + "-" + id.slice(0, 6);
    const now = Date.now();
    const statements = [
      db
        .prepare(
          "INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at,experience) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM products WHERE owner=?) < ?",
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
          JSON.stringify(emptyContent(brief)),
          "draft",
          now,
          now,
          JSON.stringify(readExperience(plan.tier==="pro"?{community:{enabled:brief.format==="Community"},booking:{enabled:brief.format==="Coaching session"}}:{})),
          u.userId,
          plan.limit,
        ),
    ];
    if (enabled)
      statements.push(
        db
          .prepare(
            "INSERT INTO generation (product_id,owner,brief,stage,status,lease,updated_at) SELECT ?,?,?,-1,?,0,? WHERE EXISTS (SELECT 1 FROM products WHERE id=?)",
          )
          .bind(id, u.userId, JSON.stringify(brief), "queued", now, id),
      );
    await db.batch(statements);
    const row = await db
      .prepare("SELECT * FROM products WHERE id=?")
      .bind(id)
      .first();
    if (!row) throw new ApiError("Your product limit has been reached. Upgrade your plan to keep creating.",403);
    return Response.json({
      product: productFromRow(row!),
      mode: enabled ? "ai" : "manual",
    });
  } catch (e) {
    return failure(e);
  }
}
