import { z } from "zod";
import { sectionSchema } from "@/lib/product";
import {
  ApiError,
  database,
  failure,
  identity,
  ownedProduct,
  productFromRow,
  sameOrigin,
} from "@/lib/server";
import {reserveCredits,refundCredits,completeCredits} from "@/lib/credits";
import {textCredits} from "@/lib/credit-policy";
import {providerSettings} from "@/lib/ai";
import { productSystem, textGeneration } from "@/lib/ai";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let creditId="";
  try {
    sameOrigin(req);
    const u = await identity();
    const { id } = await params;
    const raw = await ownedProduct(id, u.userId);
    const p = productFromRow(raw);
    const job = await database()
      .prepare("SELECT status FROM generation WHERE product_id=?")
      .bind(id)
      .first();
    if (job && job.status !== "completed")
      throw new ApiError("Finish or stop the current generation first.", 409);
    const data = z
      .object({
        index: z.number().int().min(0).max(29),
        instructions: z.string().min(8).max(4000),
      })
      .parse(await req.json());
    const section = p.content.sections[data.index];
    if (!section) throw new ApiError("Section not found.", 404);
    creditId=crypto.randomUUID();
    const ai=await providerSettings();
    await reserveCredits(u.userId,creditId,"text",textCredits(ai.config.textProvider));
    const revised = sectionSchema.parse(
      await textGeneration(
        u.userId,
        productSystem,
        `Improve this finished section of "${p.title}" for ${p.audience}. Creator instructions: ${data.instructions}. Current section: ${JSON.stringify(section)}. Return JSON {"title":"section title","body":"the complete improved section"}. Keep all useful details unless asked to remove them. Make the requested changes and deliver polished final content.`,
        10000,
      ),
    );
    p.content.sections[data.index] = revised;
    const result = await database()
      .prepare(
        "UPDATE products SET content=?,updated_at=? WHERE id=? AND owner=? AND updated_at=?",
      )
      .bind(JSON.stringify(p.content), Date.now(), id, u.userId, raw.updated_at)
      .run();
    if (!result.meta.changes)
      throw new ApiError(
        "The product was edited while AI was working. Reload before retrying.",
        409,
      );
    await completeCredits(creditId);
    return Response.json({
      product: productFromRow(await ownedProduct(id, u.userId)),
    });
  } catch (e) {
    if(creditId)await refundCredits(creditId);
    return failure(e);
  }
}
