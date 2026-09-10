import { ApiError, database, failure, productFromRow } from "@/lib/server";
import { productBundle } from "@/lib/bundle";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const p = await database()
      .prepare("SELECT * FROM products WHERE slug=?")
      .bind(slug)
      .first();
    if (!p) throw new ApiError("Product not found.", 404);
    const token = new URL(req.url).searchParams.get("token");
    if (Number(p.price) > 0 || p.status !== "published") {
      const order = token
        ? await database()
            .prepare("SELECT id FROM orders WHERE token=? AND product_id=?")
            .bind(token, p.id)
            .first()
        : null;
      if (!order)
        throw new ApiError(
          "A verified purchase is required to download this product.",
          403,
        );
    }
    const product = productFromRow(p);
    return new Response(productBundle(product, false), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${product.slug}.zip"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
