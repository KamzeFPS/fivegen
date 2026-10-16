import { env } from "cloudflare:workers";
import { ApiError, database, failure } from "@/lib/server";
import { getPublicFunnel } from "@/lib/growth-funnel-server";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params, funnel = await getPublicFunnel(slug);
    if (!funnel.creatorVslUploadId) throw new ApiError("Video not found.", 404);
    const file = await database().prepare("SELECT object_key,mime,size FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND mime IN ('video/mp4','video/webm') AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(funnel.creatorVslUploadId, funnel.productId, funnel.owner).first();
    if (!file) throw new ApiError("Video not found.", 404);
    const size = Number(file.size); let range: { offset: number; length: number } | undefined;
    if (request.headers.has("range")) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range")!);
      const invalid = () => new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Cache-Control": "no-store" } });
      if (!match || (!match[1] && !match[2])) return invalid();
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      const end = match[1] && match[2] ? Number(match[2]) : size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return invalid();
      range = { offset: start, length: Math.min(end, size - 1) - start + 1 };
    }
    const object = await (env as unknown as { BUCKET: R2Bucket }).BUCKET?.get(String(file.object_key), range ? { range } : undefined);
    if (!object) throw new ApiError("Video is unavailable.", 404);
    return new Response(object.body, { status: range ? 206 : 200, headers: {
      "Content-Type": String(file.mime), "Content-Length": String(range?.length || size), "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      ...(range ? { "Content-Range": `bytes ${range.offset}-${range.offset + range.length - 1}/${size}` } : {}),
    } });
  } catch (error) { return failure(error); }
}
