import { env } from "cloudflare:workers";
import { ApiError, database, failure, identity } from "@/lib/server";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await identity();
    const { id } = await params;
    const a = await database()
      .prepare(
        "SELECT object_key,kind,name FROM assets WHERE id=? AND owner=? AND status='completed'",
      )
      .bind(id, u.userId)
      .first();
    if (!a) throw new ApiError("Asset not found.", 404);
    const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
    const obj = await bucket?.get(String(a.object_key));
    if (!obj) throw new ApiError("This file is not available.", 404);
    const ext = a.kind === "image" ? "jpg" : "mp4";
    const name = String(a.name)
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 70);
    return new Response(obj.body, {
      headers: {
        "Content-Type": a.kind === "image" ? "image/jpeg" : "video/mp4",
        "Content-Length": String(obj.size),
        "Cache-Control": "private, max-age=600",
        "X-Content-Type-Options": "nosniff",
        ...(new URL(req.url).searchParams.has("download")
          ? { "Content-Disposition": `attachment; filename="${name}.${ext}"` }
          : {}),
      },
    });
  } catch (e) {
    return failure(e);
  }
}
