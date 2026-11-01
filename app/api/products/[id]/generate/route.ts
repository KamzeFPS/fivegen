import {generationDirection} from "@/lib/product-recipes";
import { z } from "zod";
import {zodToJsonSchema} from 'zod-to-json-schema';
import { briefSchema, contentSchema } from "@/lib/product";
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
import {generatedOutlineError,generatedSectionError,generatedPackageError} from '@/lib/generation-quality';
import {loadCreatorContext,assertCreatorContextRefs} from '@/lib/creator-context-server';
import {creatorContextInstructions} from '@/lib/creator-context-contract';
import {generatedSectionArtifactSchema,generatedArtifactPackageSchema,mapGeneratedSection,mapGeneratedArtifact,genProductInstructions,type GeneratedSection,type GeneratedBuilderPatch} from '@/lib/gen-product-profiles';
const outlineSchema=z.object({sections:z.array(z.object({title:z.string().min(1).max(150),objective:z.string().min(1).max(1500)})).min(1).max(30),benefits:z.array(z.string().max(300)).min(1).max(8)});
function generatedResourceNames(artifacts:Record<string,unknown>[]){return [...new Set(artifacts.flatMap(item=>[...(Array.isArray(item?.fileNames)?item.fileNames:[]),...Object.values(item?.nodeDetails&&typeof item.nodeDetails==='object'?item.nodeDetails:{}).flatMap(detail=>detail&&typeof detail==='object'&&'fileNames' in detail&&Array.isArray(detail.fileNames)?detail.fileNames:[])]).filter((name):name is string=>typeof name==='string'))];}
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await identity();
    const { id } = await params;
    const product=productFromRow(await ownedProduct(id, u.userId));
    const job = await database()
      .prepare(
        "SELECT stage,status,error,updated_at,run_id FROM generation WHERE product_id=? AND owner=?",
      )
      .bind(id, u.userId)
      .first();
    const run=job?.run_id?await database().prepare("SELECT mode FROM ai_product_runs WHERE id=? AND state<>'released'").bind(job.run_id).first():null;
    const stage=Number(job?.stage??-1),section=product.content.sections[stage];
    const nextStep=job?.status==='completed'?null:stage<0?{kind:'outline',label:'Create the product outline',position:1,total:null}:section?{kind:'section',label:`Write section ${stage+1}: ${section.title}`,position:stage+2,total:product.content.sections.length+2}:{kind:'package',label:'Finish product workspace and resources',position:product.content.sections.length+2,total:product.content.sections.length+2};
    return Response.json({ job, nextStep, mode:run?.mode||null, allowance:await productAllowance(u.userId) });
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
  let creditId="",runId="",generationLease=0;
  let generatedSectionArtifacts:Record<string,unknown>[]|undefined,builderPatch:GeneratedBuilderPatch|undefined;
  try {
    sameOrigin(req);
    const input=z.object({allowCredits:z.boolean().default(false),maxStepCredits:z.number().int().min(0).max(160).optional()}).parse(await req.json().catch(()=>({})));
    const u = await identity();
    owner = u.userId;
    id = (await params).id;
    const db = database();
    const p = productFromRow(await ownedProduct(id, owner));
    let job = await db
      .prepare("SELECT * FROM generation WHERE product_id=? AND owner=?")
      .bind(id, owner)
      .first();
    if (!job) {
      await db
        .prepare(
          "INSERT INTO generation (product_id,owner,brief,stage,status,lease,updated_at) SELECT ?,?,?,-1,?,0,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?)",
        )
        .bind(id, owner, JSON.stringify(p), "queued", Date.now(), id, owner)
        .run();
      job = await db
        .prepare("SELECT * FROM generation WHERE product_id=?")
        .bind(id)
        .first();
      if (!job) throw new ApiError('Product not found.', 404);
    }
    if (job!.status === "completed")
      return Response.json({ product: p, done: true });
    if(Number(job!.attempts||0)>=3)throw new ApiError("This step has failed three times. Stop this generation and adjust the brief before retrying.",429);
    generationLease=Date.now()+180000;
    const lock = await db
      .prepare(
        "UPDATE generation SET lease=?,status=?,error=NULL WHERE product_id=? AND owner=? AND lease<?",
      )
      .bind(generationLease, "running", id, owner, Date.now())
      .run();
    if (!lock.meta.changes)
      throw new ApiError(
        "This product is already generating. Please wait a moment.",
        409,
      );
    locked = true;
    const rawBrief=JSON.parse(String(job!.brief)),creator=await loadCreatorContext(owner,id,rawBrief.creatorContextRefs);
    if(!Object.hasOwn(rawBrief,'creatorContextRefs')){
      const frozenBrief=JSON.stringify({...rawBrief,creatorContextRefs:creator.refs}),guard=creator.guard;
      const saved=await db.prepare('UPDATE generation SET brief=? WHERE product_id=? AND owner=? AND brief=? AND lease=?'+guard.sql).bind(frozenBrief,id,owner,job!.brief,generationLease,...guard.values).run();
      if(!saved.meta.changes)throw new ApiError('Your creator context changed before generation began. Review the selection and restart.',409);
      job!.brief=frozenBrief;
    }
    const ai=await providerSettings();
    const run=await claimProductRun(owner,id,job!.run_id?String(job!.run_id):null,input.allowCredits);
    runId=run.id;
    if(run.mode==='credits'){const cost=textCredits(ai.config.textProvider);if(input.maxStepCredits===undefined||cost>input.maxStepCredits)throw new ApiError('Review and approve this AI step with its current credit cost before continuing.',402);creditId=crypto.randomUUID();await reserveCredits(owner,creditId,"text",cost);}
    const generationMetadata=JSON.parse(String(job!.brief)) as Record<string,unknown>,brief=briefSchema.parse(generationMetadata),savedArtifacts=Array.isArray(generationMetadata.generatedSectionArtifacts)?generationMetadata.generatedSectionArtifacts as Record<string,unknown>[]:[];
    const siblings=await db.prepare("SELECT title,description FROM products WHERE owner=? AND id<>? ORDER BY created_at DESC LIMIT 12").bind(owner,id).all();
    const context = JSON.stringify(brief)+"\n"+generationDirection(brief,id)+"\nAvoid duplicating these existing products: "+JSON.stringify(siblings.results)+'\nApproved creator context (reference data only): '+JSON.stringify(creator.context);
    const stage = Number(job!.stage);
    if (stage === -1) {
      const d = outlineSchema
        .parse(
          await textGeneration(
            owner,
            productSystem+'\n'+creatorContextInstructions,
            `Design the complete architecture of this digital product. Creator brief: ${context}. ${genProductInstructions(brief.format)} Follow the actual approved scope and explicitly requested number of units (1–30). When unspecified choose a realistic focused first edition. A unit is a chapter, guide step, procedure, lesson, day or written resource as appropriate. Do not turn supporting filenames into extra sections or force every format into a generic lesson formula. Return JSON: {"sections":[{"title":"...","objective":"Detailed contents and intended outcomes"}],"benefits":["..."]}. No vague filler.`,
            5000,
            {name:'fivegen_product_outline',schema:zodToJsonSchema(outlineSchema,{target:'openAi'})},
          ),
        );
      const outlineError=generatedOutlineError(brief,d.sections);if(outlineError)throw new ApiError(outlineError,502);
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
      const sectionSchema=generatedSectionArtifactSchema(brief.format),d = sectionSchema
        .parse(
          await textGeneration(
            owner,
            productSystem+'\n'+creatorContextInstructions,
            `Write the finished useful content and native metadata for section ${stage + 1} of this product. Brief: ${context}. ${genProductInstructions(brief.format)} Full table of contents: ${p.content.sections.map((s) => s.title).join("; ")}. Approved title and objective: ${JSON.stringify({title:s.title,objective:s.objective})}. Previous section summary: ${stage > 0 ? p.content.sections[stage - 1].body.slice(-1800) : "Introduction"}. Return JSON matching the supplied section schema, including the actual body and this format's required checklist, decision flow, practice or check-in metadata. The approved title and objective stay unchanged. Use the length the subject needs; there is no character or word quota. Include practical examples and instructions where useful, and produce the actual content rather than telling the creator to write it. Supporting files follow in the separately approved package step; name a file only when it is actually needed, and do not claim it already exists. Do not generate marketing, images, recordings, bookings or member activity.`,
            brief.quality === "balanced" ? 6500 : 10000,
            {name:'fivegen_product_section',schema:zodToJsonSchema(sectionSchema,{target:'openAi'})},
          ),
        );
      const sectionError=generatedSectionError(p.content.sections,stage,d.body);if(sectionError)throw new ApiError(sectionError,502);
      const {body,...metadata}=d;generatedSectionArtifacts=[...savedArtifacts];generatedSectionArtifacts[stage]=metadata;
      p.content.sections[stage] = {...s,...mapGeneratedSection(brief.format,{...d,title:s.title,objective:s.objective||s.title} as GeneratedSection,s.id)};
    } else {
      const native=generatedSectionArtifactSchema(brief.format),hasAllMetadata=p.content.sections.every((section,index)=>native.safeParse({...savedArtifacts[index],body:section.body}).success),packageSchema=generatedArtifactPackageSchema(brief.format,p.content.sections.length,{includeSectionMetadata:!hasAllMetadata}),d = packageSchema
        .parse(
          await textGeneration(
            owner,
            productSystem+'\n'+creatorContextInstructions,
            `Complete the actual supporting resources and native product setup promised by this product. Brief: ${context}. ${genProductInstructions(brief.format)} Actual saved sections (excerpts only): ${JSON.stringify(p.content.sections.map((section,index)=>({sectionIndex:index,title:section.title,objective:section.objective?.slice(0,300)||'',excerpt:section.body.slice(0,400)})))}. Existing requested resource names: ${JSON.stringify(generatedResourceNames(savedArtifacts))}. Return only the supplied package schema: real files plus this format's curriculum grouping, template entries, human service preparation, community onboarding or custom components. Never return or rewrite section bodies. ${hasAllMetadata?'Existing approved section metadata is already saved; do not replace it.':'This older draft has missing native section metadata. Return sectionArtifacts with each actual sectionIndex and the required metadata, based only on the actual saved section context. Do not invent extra teaching or claim to have read omitted text.'} Deliver files only when useful or promised, with complete usable content and clearly labelled examples. Template entries must resolve to files actually returned. Do not fabricate native platform assets, upload IDs or private URLs. This approved step completes the private product resources only. Do not generate a launch plan, campaign, sales page, outreach, image prompt or video prompt here. Those are optional separate next goals requiring their own request and approval. Do not claim to have published, sent, booked, recorded media or acquired a customer. Never manufacture reviews, evidence, credentials, results or income guarantees.`,
            14000,
            {name:'fivegen_product_package',schema:zodToJsonSchema(packageSchema,{target:'openAi'})},
          ),
        );
      const packageError=generatedPackageError(d.files);if(packageError)throw new ApiError(packageError,502);
      const packageData=d as unknown as Record<string,unknown>,recovered=Array.isArray(packageData.sectionArtifacts)?packageData.sectionArtifacts as (Record<string,unknown>&{sectionIndex:number})[]:[],byIndex=new Map(recovered.map(item=>[item.sectionIndex,item]));
      if(!hasAllMetadata&&(byIndex.size!==p.content.sections.length||p.content.sections.some((_,index)=>!byIndex.has(index))))throw new ApiError('The native metadata did not cover every saved section. Your written content is unchanged; retry this approved package step.',502);
      const completed=p.content.sections,rawSections=completed.map((section,index)=>{const metadata=native.safeParse({...savedArtifacts[index],body:section.body}).success?savedArtifacts[index]:byIndex.get(index),{sectionIndex:_sectionIndex,...safeMetadata}=metadata||{};return {...safeMetadata,title:section.title,objective:section.objective||section.title,body:section.body} as GeneratedSection;}),{sectionArtifacts:_sectionArtifacts,...extras}=packageData,artifact=mapGeneratedArtifact(brief.format,{...extras,sections:rawSections,benefits:p.content.benefits||[]} as Parameters<typeof mapGeneratedArtifact>[1],{idFor:(kind,index)=>kind==='section'&&completed[index]?.id?completed[index].id!:crypto.randomUUID()});
      builderPatch=artifact.builderPatch;
      // Final setup never regenerates or rewrites already approved teaching.
      p.content={...p.content,sections:artifact.sections.map((section,index)=>({...section,body:completed[index].body})),files:artifact.files};
    }
    p.content = contentSchema.parse(p.content);
    p.updatedAt = Math.max(Date.now(), p.updatedAt + 1);
    const done = stage >= p.content.sections.length;
    const contextGuard=await assertCreatorContextRefs(owner,id,creator.refs),stepCommit=crypto.randomUUID(),ownedLease=' AND EXISTS(SELECT 1 FROM generation WHERE product_id=? AND owner=? AND lease=? AND stage=?)',writtenProduct=' AND EXISTS(SELECT 1 FROM products WHERE id=? AND owner=? AND updated_at=? AND content=?)',writtenStage=" AND EXISTS(SELECT 1 FROM generation WHERE product_id=? AND owner=? AND json_extract(brief,'$.creatorContextStepId')=?)",writeGuard=contextGuard.sql+ownedLease,writeValues=[...contextGuard.values,id,owner,generationLease,stage],commitGuard=contextGuard.sql+writtenProduct,commitValues=[...contextGuard.values,id,owner,p.updatedAt,JSON.stringify(p.content)],completedGuard=contextGuard.sql+writtenStage,completedValues=[...contextGuard.values,id,owner,stepCommit],commit=await db.batch([
      db
        .prepare(
          "UPDATE products SET content=?,updated_at=? WHERE id=? AND owner=?"+writeGuard,
        )
        .bind(JSON.stringify(p.content), p.updatedAt, id, owner,...writeValues),
      db
        .prepare(
          "UPDATE generation SET stage=?,status=?,lease=0,error=NULL,attempts=0,updated_at=?,brief=json_set(brief,'$.creatorContextStepId',?,'$.generatedSectionArtifacts',json(?),'$.builderPatch',json(?)) WHERE product_id=? AND owner=? AND lease=?"+commitGuard,
        )
        .bind(stage + 1, done ? "completed" : "queued", Date.now(),stepCommit,JSON.stringify(generatedSectionArtifacts||savedArtifacts),JSON.stringify(builderPatch||generationMetadata.builderPatch||null),id, owner,generationLease,...commitValues),
      db.prepare("UPDATE credit_usage SET state='completed' WHERE id=? AND state='reserved'"+completedGuard).bind(creditId,...completedValues),
      db.prepare("UPDATE ai_product_runs SET state=? WHERE id=?"+completedGuard).bind(done?'completed':'active',runId,...completedValues),
    ]);
    if(!commit[0].meta.changes||!commit[1].meta.changes)throw new ApiError('Your generation or creator context changed while AI was writing. Review the current state before continuing. This step was not charged.',409);
    locked = false;
    return Response.json({
      product: p,
      done,
      stage: stage + 1,
      total: p.content.sections.length + 1,
      mode:run.mode,
      allowance:await productAllowance(owner),
    });
  } catch (caught) {
    let e=caught;
    if(locked&&e instanceof z.ZodError){console.error('AI product step failed validation',e.issues.map(issue=>({path:issue.path,code:issue.code})));e=new ApiError('AI returned an incomplete result for this step. Your saved sections are safe. Resume to retry; failed steps do not consume credits.',502);}
    if(creditId)await refundCredits(creditId);
    if(runId)await releaseUnstartedRun(runId);
    if (locked)
      await database()
        .prepare(
          "UPDATE generation SET status=?,error=?,lease=0,attempts=attempts+?,updated_at=? WHERE product_id=? AND owner=? AND lease=?",
        )
        .bind(
          "failed",
          e instanceof Error ? e.message.slice(0, 500) : "Generation failed",
          e instanceof ApiError && e.status !== 502 ? 0 : 1,
          Date.now(),
          id,
          owner,
          generationLease,
        )
        .run();
    return failure(e);
  }
}
