import { ApiError, database, failure, productFromRow } from "@/lib/server";
import { productBundle } from "@/lib/bundle";
import { assertSubscriptionAccess, orderItems } from "@/lib/payments";
import {resolveFileSaleAccess} from '@/lib/file-sales';
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
    if(await database().prepare('SELECT product_id FROM product_builder_workspaces WHERE product_id=?').bind(p.id).first())throw new ApiError('Open your purchase in /customer to download this product’s private resources.',403);
    const token = new URL(req.url).searchParams.get("token");
    const sale=await resolveFileSaleAccess(p,token||undefined);
    if(sale)return Response.json({accessPath:`/access/${slug}`,message:'Open your purchase to download the original files or read your course.'},{headers:{'Cache-Control':'private, no-store'}});
    if (Number(p.price) > 0 || p.status !== "published") {
      const order = token
        ? await database()
            .prepare("SELECT * FROM orders WHERE token=?")
            .bind(token)
            .first()
        : null;
      if (!order || (order.product_id!==p.id && !orderItems(order).some(i=>i.id===p.id)))
        throw new ApiError(
          "A verified purchase is required to download this product.",
          403,
        );
      await assertSubscriptionAccess(order);
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
