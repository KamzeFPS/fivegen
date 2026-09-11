import {generationDirection} from "@/lib/product-recipes";
import { z } from "zod";
import { briefSchema, contentSchema, fileSchema } from "@/lib/product";
import {
  ApiError,
  database,
  failure,
  identity,
  ownedProduct,
  productFromRow,
  sameOrigin,
} from "@/lib/server";
import {reserveCredits,refundCredits} from "@/lib/credits";
import {claimProductRun,releaseUnstartedRun,productAllowance} from "@/lib/product-allowance";
import {textCredits} from "@/lib/credit-policy";
import {providerSettings} from "@/lib/ai";
import { textGeneration, productSystem } from "@/lib/ai";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await identity();
    const { id } = await params;
    await ownedProduct(id, u.userId);
    const job = await database()
      .prepare(
        "SELECT stage,status,error,updated_at,run_id FROM generation WHERE product_id=? AND owner=?",
      )
      .bind(id, u.userId)
      .first();
    const run=job?.run_id?await database().prepare("SELECT mode FROM ai_product_runs WHERE id=? AND state<>'released'").bind(job.run_id).first():null;
    return Response.json({ job, mode:run?.mode||null, allowance:await productAllowance(u.userId) });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const u = await identity();
    const { id } = await params;
    await ownedProduct(id, u.userId);
    const db = database();
    const job = await db
      .prepare("SELECT lease FROM generation WHERE product_id=? AND owner=?")
      .bind(id, u.userId)
      .first<{ lease: number }>();
    if (job && job.lease > Date.now())
      throw new ApiError(
        "The current section is still generating. Wait for it to finish before stopping.",
        409,
      );
    await db
      .prepare("DELETE FROM generation WHERE product_id=? AND owner=?")
      .bind(id, u.userId)
      .run();
    return Response.json({ cancelled: true });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let id = "",
    owner = "",
    locked = false;
  let creditId="",runId="";
  try {
    sameOrigin(req);
    const input=z.object({allowCredits:z.boolean().default(false),maxStepCredits:z.number().int().min(0).max(160).optional()}).parse(await req.json().catch(()=>({})));
    const u = await identity();
    owner = u.userId;
    id = (await params).id;
    const db = database();
    let p = productFromRow(await ownedProduct(id, owner));
    if (p.status === "published")
      throw new ApiError("Unpublish this product before generating new content.", 409);
    let job = await db
      .prepare("SELECT * FROM generation WHERE product_id=? AND owner=?")
      .bind(id, owner)
      .first();
    if (!job) {
      await db
        .prepare(
          "INSERT INTO generation (product_id,owner,brief,stage,status,lease,updated_at) VALUES (?,?,?,-1,?,0,?)",
        )
        .bind(id, owner, JSON.stringify(p), "queued", Date.now())
        .run();
      job = await db
        .prepare("SELECT * FROM generation WHERE product_id=?")
        .bind(id)
        .first();
    }
    if (job!.status === "completed")
      return Response.json({ product: p, done: true });
    if(Number(job!.attempts||0)>=3)throw new ApiError("This step has failed three times. Stop this generation and adjust the brief before retrying.",429);
    const lock = await db
      .prepare(
        "UPDATE generation SET lease=?,status=?,error=NULL WHERE product_id=? AND owner=? AND lease<?",
      )
      .bind(Date.now() + 180000, "running", id, owner, Date.now())
      .run();
    if (!lock.meta.changes)
      throw new ApiError(
        "This product is already generating. Please wait a moment.",
        409,
      );
    locked = true;
    const ai=await providerSettings();
    const run=await claimProductRun(owner,id,job!.run_id?String(job!.run_id):null,input.allowCredits);
    runId=run.id;
    if(run.mode==='credits'){const cost=textCredits(ai.config.textProvider);if(input.maxStepCredits!==undefined&&cost>input.maxStepCredits)throw new ApiError('The AI price changed. Review the updated credit cost before continuing.',402);creditId=crypto.randomUUID();await reserveCredits(owner,creditId,"text",cost);}
    const brief = briefSchema.parse(JSON.parse(String(job!.brief)));
    const siblings=await db.prepare("SELECT title,description FROM products WHERE owner=? AND id<>? ORDER BY created_at DESC LIMIT 12").bind(owner,id).all();
    const context = JSON.stringify(brief)+"\n"+generationDirection(brief,id)+"\nAvoid duplicating these existing products: "+JSON.stringify(siblings.results);
    const stage = Number(job!.stage);
    if (stage === -1) {
      const d = z
        .object({
          sections: z
            .array(
              z.object({
                title: z.string().min(1).max(150),
                objective: z.string().min(1).max(1500),
              }),
            )
            .min(3)
            .max(30),
          benefits: z.array(z.string().max(300)).min(3).max(8),
        })
        .parse(
          await textGeneration(
            owner,
            productSystem,
            `Design the complete architecture of this digital product. Creator brief: ${context}. The format can be any digital product, including guides, lesson systems, spreadsheets, calculators, scripts, checklists, business systems, or creative resources. Follow the format-specific architecture above. For challenges use exactly the requested number of days. For coaching use three resources: preparation, the agenda for ONE human-delivered session, and follow-up. For template kits use 3–6 tools. Otherwise choose 4–8 substantive units that fit the deliverable. Return JSON: {"sections":[{"title":"...","objective":"Detailed contents and intended outcomes"}],"benefits":["..."]}. No vague filler.`,
            5000,
          ),
        );
      if(brief.format==='Challenge'&&d.sections.length!==(brief.duration||7))throw new ApiError('The generated plan did not match your requested number of days. Retry to correct the outline.',502);
      p.content = {
        ...p.content,
        sections: d.sections.map((s) => ({
          id:crypto.randomUUID(),
          title: s.title,
          body: "",
          objective: s.objective,
        })),
        benefits: d.benefits,
      };
    } else if (stage < p.content.sections.length) {
      const s = p.content.sections[stage];
      const d = z
        .object({ body: z.string().min(300).max(18000) })
        .parse(
          await textGeneration(
            owner,
            productSystem,
            `Write the finished, publication-ready content for section ${stage + 1} of this product. Brief: ${context}. Full table of contents: ${p.content.sections.map((s) => s.title).join("; ")}. This section: ${JSON.stringify(s)}. Previous section summary: ${stage > 0 ? p.content.sections[stage - 1].body.slice(-1800) : "Introduction"}. Return JSON {"body":"Complete section content with clear paragraph breaks"}. Match the unit to the format. A challenge day or template instruction can be 150–350 useful words; a course lesson should be focused and practice-based; a guide or playbook can be ${brief.quality === "balanced" ? "400–650" : "700–1100"} words. Include concrete examples, step-by-step applications, common mistakes, and a relevant exercise or usable template. For software/tool products, explain usage and exact requirements; code deliverables will follow in the final step. Do not tell the creator to write the content. Produce it.`,
            brief.quality === "balanced" ? 6500 : 10000,
          ),
        );
      p.content.sections[stage] = { ...s, body: d.body };
    } else {
      const d = z
        .object({
          launch: z.string().min(600).max(50000),
          salesCopy: z.string().min(150).max(15000),
          files: z.array(fileSchema).max(12),
          imagePrompt: z.string().min(30).max(4000),
          videoPrompt: z.string().min(30).max(2500),
        })
        .parse(
          await textGeneration(
            owner,
            productSystem,
            `Complete the commercial package for this product. Brief: ${context}. Sections: ${p.content.sections.map((s) => s.title + ": " + s.body.slice(0, 400)).join("\n")}. Return JSON {"launch":"7-day launch calendar, 5 complete launch emails, 15 social posts with hooks, 3 ad variants and a 15-second video script; written out in full","salesCopy":"finished honest sales page copy with headline, offer, audience, benefits and FAQ","files":[{"name":"filename.csv or .html or .md or .txt or .json or .js or .css or .py","content":"complete usable contents","description":"purpose"}],"imagePrompt":"production-ready art direction for a product marketing image, incorporating product title, distinct visual identity and readable typography","videoPrompt":"production-ready 5-second cinematic product promo with clear subject, camera, action, lighting and sound"}. Provide 3–6 useful supporting files actually tailored to the product. For spreadsheet products include a working CSV structure with formulas and example rows. For calculators include a self-contained HTML tool with inline CSS and JavaScript. For code templates include complete working source and usage instructions; no secrets or external network calls. For courses include a workbook and quizzes with answers. Do not fabricate external platform formats such as .notion. Deliver useful open formats. No fake reviews or income guarantees.`,
            14000,
          ),
        );
      p.content = { ...p.content, ...d };
    }
    p.content = contentSchema.parse(p.content);
    p.updatedAt = Math.max(Date.now(), p.updatedAt + 1);
    const done = stage >= p.content.sections.length;
    await db.batch([
      db
        .prepare(
          "UPDATE products SET content=?,updated_at=? WHERE id=? AND owner=?",
        )
        .bind(JSON.stringify(p.content), p.updatedAt, id, owner),
      db
        .prepare(
          "UPDATE generation SET stage=?,status=?,lease=0,error=NULL,attempts=0,updated_at=? WHERE product_id=? AND owner=?",
        )
        .bind(stage + 1, done ? "completed" : "queued", Date.now(), id, owner),
      db.prepare("UPDATE credit_usage SET state='completed' WHERE id=? AND state='reserved'").bind(creditId),
      db.prepare("UPDATE ai_product_runs SET state=? WHERE id=?").bind(done?'completed':'active',runId),
    ]);
    locked = false;
    return Response.json({
      product: p,
      done,
      stage: stage + 1,
      total: p.content.sections.length + 1,
      mode:run.mode,
    });
  } catch (e) {
    if(creditId)await refundCredits(creditId);
    if(runId)await releaseUnstartedRun(runId);
    if (locked)
      await database()
        .prepare(
          "UPDATE generation SET status=?,error=?,lease=0,attempts=attempts+?,updated_at=? WHERE product_id=? AND owner=?",
        )
        .bind(
          "failed",
          e instanceof Error ? e.message.slice(0, 500) : "Generation failed",
          e instanceof ApiError && e.status !== 502 ? 0 : 1,
          Date.now(),
          id,
          owner,
        )
        .run();
    return failure(e);
  }
}
