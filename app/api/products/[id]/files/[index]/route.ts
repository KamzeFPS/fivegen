import {
  ApiError,
  failure,
  identity,
  ownedProduct,
  productFromRow,
} from "@/lib/server";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  try {
    const u = await identity();
    const { id, index } = await params;
    const p = productFromRow(await ownedProduct(id, u.userId));
    const f = p.content.files?.[Number(index)];
    if (!f) throw new ApiError("File not found.", 404);
    return new Response(f.content, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${f.name}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
