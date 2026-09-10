import { z } from "zod";
import { briefSchema, contentSchema } from "@/lib/product";
import { advancedCommerce, commerceSchema, defaultCommerce } from "@/lib/commerce";
import { requirePro } from "@/lib/billing";
import { validateRelated } from "@/lib/offers-server";
import {
  ApiError,
  database,
  failure,
  identity,
  ownedProduct,
  productFromRow,
  sameOrigin,
} from "@/lib/server";
const updateSchema = briefSchema.extend({
  slug: z
    .string()
    .min(3)
    .max(70)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(["draft", "published"]),
  content: contentSchema,
  commerce: commerceSchema.optional(),
  expectedUpdatedAt:z.number().int().optional(),
});
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const u = await identity();
    const { id } = await params;
    const existing = productFromRow(await ownedProduct(id, u.userId));
    const data = updateSchema.parse(await req.json());
    const commerce=data.commerce||existing.commerce||defaultCommerce();
    const commerceChanged=JSON.stringify(commerce)!==JSON.stringify(existing.commerce);
    if(commerceChanged && advancedCommerce(commerce))await requirePro(u.userId);
    if(commerceChanged)await validateRelated(u.userId,id,commerce);
    if(commerce.billing!=="once" && data.price<0.5)throw new ApiError("Subscriptions need a price of at least $0.50.");
    const job = await database()
      .prepare("SELECT status FROM generation WHERE product_id=?")
      .bind(id)
      .first();
    if (job && job.status !== "completed")
      throw new ApiError(
        "Finish or cancel AI generation before saving or publishing this product.",
        409,
      );
    const collision = await database()
      .prepare("SELECT id FROM products WHERE slug=? AND id<>?")
      .bind(data.slug, id)
      .first();
    if (collision)
      throw new ApiError(
        "This product URL is already taken. Try another name.",
        409,
      );
    const saved = await database()
      .prepare(
        "UPDATE products SET slug=?,title=?,description=?,audience=?,format=?,price=?,color=?,content=?,status=?,commerce=?,updated_at=? WHERE id=? AND owner=? AND (? IS NULL OR updated_at=?)",
      )
      .bind(
        data.slug,
        data.title,
        data.description,
        data.audience,
        data.format,
        Math.round(data.price * 100),
        data.color,
        JSON.stringify(data.content),
        data.status,
        JSON.stringify(commerce),
        Math.max(Date.now(),existing.updatedAt+1),
        id,
        u.userId,
        data.expectedUpdatedAt??null,
        data.expectedUpdatedAt??null,
      )
      .run();
    if(!saved.meta.changes)throw new ApiError("This product changed. Read the latest version before editing again.",409);
    return Response.json({
      product: productFromRow(await ownedProduct(id, u.userId)),
    });
  } catch (e) {
    return failure(e);
  }
}
