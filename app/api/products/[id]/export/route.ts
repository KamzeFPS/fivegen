import { failure, identity, ownedProduct, productFromRow } from "@/lib/server";
import { productHtml } from "@/lib/export";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await identity();
    const { id } = await params;
    const p = productFromRow(await ownedProduct(id, u.userId));
    return new Response(productHtml(p), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${p.slug}.html"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
