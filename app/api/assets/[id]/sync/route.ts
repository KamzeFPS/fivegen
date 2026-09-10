import { env } from "cloudflare:workers";
import {
  ApiError,
  database,
  failure,
  identity,
  sameOrigin,
} from "@/lib/server";
import { providerKey } from "@/lib/ai";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const u = await identity();
    const { id } = await params;
    const db = database();
    const a = await db
      .prepare("SELECT * FROM assets WHERE id=? AND owner=?")
      .bind(id, u.userId)
      .first();
    if (!a) throw new ApiError("Asset not found.", 404);
    if (["completed", "failed"].includes(String(a.status)))
      return Response.json({ status: a.status });
    if (!a.remote)
      throw new ApiError("The provider has not returned a job yet.", 409);
    const remote = JSON.parse(String(a.remote));
    const key = await providerKey(u.userId, "fal");
    const headers = { Authorization: `Key ${key}` };
    for (const link of [remote.statusUrl, remote.responseUrl])
      if (new URL(link).origin !== "https://queue.fal.run")
        throw new ApiError("Invalid provider job.", 502);
    const r = await fetch(remote.statusUrl, { headers });
    const s = (await r.json()) as any;
    if (!r.ok)
      throw new ApiError("Could not check this job. Try again shortly.", 502);
    if (s.status !== "COMPLETED") {
      await db
        .prepare("UPDATE assets SET status=? WHERE id=?")
        .bind(s.status === "IN_PROGRESS" ? "running" : "queued", id)
        .run();
      return Response.json({
        status: s.status === "IN_PROGRESS" ? "running" : "queued",
      });
    }
    const result = await fetch(remote.responseUrl, { headers });
    const d = (await result.json()) as any;
    if (!result.ok || d.error) {
      const message =
        typeof d.detail === "string"
          ? d.detail
          : typeof d.error === "string"
            ? d.error
            : "The provider could not generate this asset.";
      await db
        .prepare("UPDATE assets SET status=?,error=? WHERE id=?")
        .bind("failed", message.slice(0, 500), id)
        .run();
      return Response.json({ status: "failed", error: message });
    }
    const media = a.kind === "image" ? d.images?.[0] : d.video;
    if (!media?.url)
      throw new ApiError("The provider returned no media file.", 502);
    const url = new URL(media.url);
    if (
      url.protocol !== "https:" ||
      !(url.hostname === "fal.media" || url.hostname.endsWith(".fal.media"))
    )
      throw new ApiError("Unexpected media host.", 502);
    const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
    if (!bucket)
      throw new ApiError(
        "Media storage is unavailable. The generation is complete; retry saving shortly.",
        503,
      );
    const file = await fetch(url, { redirect: "error" });
    if (!file.ok || !file.body)
      throw new ApiError(
        "Could not download the generated asset. Try again.",
        502,
      );
    const length = Number(file.headers.get("content-length"));
    if (!length || length > 100 * 1024 * 1024)
      throw new ApiError(
        "The generated asset exceeds the 100 MB storage limit.",
        413,
      );
    const objectKey = `${u.userId}/${a.product_id}/${id}.${a.kind === "image" ? "jpg" : "mp4"}`;
    await bucket.put(objectKey, file.body, {
      httpMetadata: {
        contentType: a.kind === "image" ? "image/jpeg" : "video/mp4",
      },
    });
    await db
      .prepare("UPDATE assets SET status=?,object_key=? WHERE id=?")
      .bind("completed", objectKey, id)
      .run();
    return Response.json({ status: "completed" });
  } catch (e) {
    return failure(e);
  }
}
