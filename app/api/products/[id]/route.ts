import { z } from "zod";
import { briefSchema, contentSchema, publishContentError } from "@/lib/product";
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
import {experienceSchema} from "@/lib/experience";
const updateSchema = briefSchema.extend({
  slug: z
    .string()
    .min(3)
    .max(70)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(["draft", "published"]),
  content: contentSchema,
  commerce: commerceSchema.optional(),
  experience:experienceSchema.optional(),
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
    const contentError = publishContentError(data.content);
    if (data.status === "published" && contentError) throw new ApiError(contentError, 409);
    const commerce=data.commerce||existing.commerce||defaultCommerce();
    const experience=data.experience||existing.experience||experienceSchema.parse({});
    if(JSON.stringify(experience)!==JSON.stringify(existing.experience)&&(experience.booking.enabled||experience.community.enabled))await requirePro(u.userId);
    const uploadIds=[...new Set([...data.content.sections.map(s=>s.videoId),experience.booking.confirmationVideoId,...commerce.funnel.blocks.map(b=>b.image.startsWith("/api/uploads/")?b.image.split("/").pop():null)].filter(Boolean))];
    for(const uploadId of uploadIds){const a=await database().prepare("SELECT id,mime FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed'").bind(uploadId,id,u.userId).first();if(!a)throw new ApiError("A linked file is unavailable or belongs to another product. Upload it here first.",409);const usedAsVideo=data.content.sections.some(s=>s.videoId===uploadId)||experience.booking.confirmationVideoId===uploadId||commerce.funnel.blocks.some(b=>b.kind==='video'&&b.image===`/api/uploads/${uploadId}`);if(usedAsVideo&&!String(a.mime).startsWith('video/'))throw new ApiError("Choose an MP4 or WebM recording for your video.",409);}
    if(data.status==='published'){
      if(data.format==='Template kit'&&!data.content.files?.length)throw new ApiError("Add the usable templates in Product files before publishing your kit.",409);
      if(data.format==='Community'&&!experience.community.enabled)throw new ApiError("Enable your private community in Delivery before publishing.",409);
      if(data.format==='Coaching session'&&(!experience.booking.enabled||!experience.booking.meetingUrl))throw new ApiError("Enable bookings and add a meeting link in Delivery before publishing coaching.",409);
    }
    if(data.status==="published"&&commerce.funnel.enabled){
      if(commerce.funnel.kind==="vsl"&&!commerce.funnel.blocks.some(b=>b.visible&&b.kind==="video"&&b.image))throw new ApiError("Add your sales video before publishing a VSL funnel.",409);
      if(["booking","post_booking"].includes(commerce.funnel.kind)&&!experience.booking.enabled)throw new ApiError("Enable bookings in Delivery before publishing this funnel.",409);
      if(commerce.funnel.kind==="free_guide"){const target=commerce.funnel.leadProductId;if(!target&&data.price!==0)throw new ApiError("Choose a published free guide to deliver from this funnel.",409);if(target){const guide=await database().prepare("SELECT id FROM products WHERE id=? AND owner=? AND price=0 AND status='published'").bind(target,u.userId).first();if(!guide)throw new ApiError("Your lead magnet must be a published free product.",409);}}
    }
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
        "UPDATE products SET slug=?,title=?,description=?,audience=?,format=?,price=?,color=?,content=?,status=?,commerce=?,experience=?,updated_at=? WHERE id=? AND owner=? AND (? IS NULL OR updated_at=?)",
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
        JSON.stringify(experience),
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
