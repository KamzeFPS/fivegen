import { failure, identity, ownedProduct, productFromRow } from "@/lib/server";
import { productBundle } from "@/lib/bundle";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await identity();
    const { id } = await params;
    const p = productFromRow(await ownedProduct(id, u.userId));
    return new Response(productBundle(p), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${p.slug}-complete-package.zip"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
