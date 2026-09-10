import { z } from "zod";
import {
  ApiError,
  database,
  failure,
  identity,
  ownedProduct,
  sameOrigin,
} from "@/lib/server";
import { providerKey, providerSettings } from "@/lib/ai";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await identity();
    const { id } = await params;
    await ownedProduct(id, u.userId);
    const a = await database()
      .prepare(
        "SELECT id,kind,name,prompt,status,error,created_at FROM assets WHERE product_id=? AND owner=? ORDER BY created_at DESC",
      )
      .bind(id, u.userId)
      .all();
    return Response.json({ assets: a.results });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let id = "";
  try {
    sameOrigin(req);
    const u = await identity();
    const { id: productId } = await params;
    await ownedProduct(productId, u.userId);
    const d = z
      .object({
        kind: z.enum(["image", "video"]),
        prompt: z.string().min(15).max(2500),
        name: z.string().min(1).max(100),
        aspect: z.enum(["1:1", "16:9", "9:16"]).default("1:1"),
      })
      .parse(await req.json());
    const db = database();
    const active = await db
      .prepare(
        "SELECT COUNT(*) as n FROM assets WHERE owner=? AND status IN ('queued','running')",
      )
      .bind(u.userId)
      .first<{ n: number }>();
    if ((active?.n || 0) >= 4)
      throw new ApiError(
        "You already have four media jobs running. Wait for one to finish.",
        429,
      );
    const key = await providerKey(u.userId, "fal");
    const { config } = await providerSettings(u.userId);
    id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO assets (id,owner,product_id,kind,name,prompt,status,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        u.userId,
        productId,
        d.kind,
        d.name,
        d.prompt,
        "submitting",
        Date.now(),
      )
      .run();
    const endpoint = d.kind === "image" ? config.imageModel : config.videoModel;
    const r = await fetch(`https://queue.fal.run/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: d.prompt,
        aspect_ratio: d.aspect,
        ...(d.kind === "image"
          ? { num_images: 1, output_format: "jpeg" }
          : { duration: "5", generate_audio: true }),
      }),
    });
    const result = (await r.json()) as any;
    if (!r.ok)
      throw new ApiError(
        typeof result.detail === "string"
          ? result.detail
          : "Media provider could not start generation. Check your key and account credits.",
        502,
      );
    if (!result.request_id || !result.status_url || !result.response_url)
      throw new ApiError("Media provider returned an incomplete job.", 502);
    for (const link of [result.status_url, result.response_url])
      if (new URL(link).origin !== "https://queue.fal.run")
        throw new ApiError("Unexpected provider response.", 502);
    await db
      .prepare("UPDATE assets SET status=?,remote=? WHERE id=?")
      .bind(
        "queued",
        JSON.stringify({
          requestId: result.request_id,
          statusUrl: result.status_url,
          responseUrl: result.response_url,
        }),
        id,
      )
      .run();
    return Response.json({ id, status: "queued" });
  } catch (e) {
    if (id)
      await database()
        .prepare("UPDATE assets SET status=?,error=? WHERE id=?")
        .bind(
          "failed",
          e instanceof Error ? e.message.slice(0, 500) : "Failed",
          id,
        )
        .run();
    return failure(e);
  }
}
