import { env } from "cloudflare:workers";
import { z } from "zod";
import { ApiError, database, failure, identity, ownedProduct, sameOrigin } from "@/lib/server";
import { reserveCredits, refundCredits, reserveAIBudget } from "@/lib/credits";
import { creditPolicy } from "@/lib/credit-policy";
import { providerKey, providerSettings } from "@/lib/ai";
import { designImageCredits, designImageQualitySchema } from "@/lib/design-image";
import { generateOpenAIImage, imageGenerationReadiness } from "@/lib/openai-image";
import {hasUnlimitedGeneration} from '@/lib/generation-access';

const inputSchema = z.object({
  requestId: z.string().min(8).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  kind: z.enum(["image", "video"]),
  prompt: z.string().min(15).max(2500),
  name: z.string().min(1).max(100),
  aspect: z.enum(["1:1", "16:9", "9:16"]).default("1:1"),
  quality: designImageQualitySchema.default("medium"),
  maxCredits:z.number().int().min(0).max(160).optional(),
});
type AssetRow = { id: string; owner: string; product_id: string; status: string; remote: string | null; error: string | null };
const pendingLeaseMs = 10 * 60 * 1000;
async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
}
// Keep asset URLs UUID-shaped while accepting the existing MCP requestId contract.
function assetId(hash: string) { return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`; }
function metadata(row: AssetRow) {
  try { return JSON.parse(row.remote || "{}") as { provider?: string; requestHash?: string; leaseExpiresAt?: number }; }
  catch { return {}; }
}
async function expireImageLease(row: AssetRow) {
  const remote = metadata(row);
  if (row.status !== "submitting" || remote.provider !== "openai" || !remote.leaseExpiresAt || remote.leaseExpiresAt > Date.now()) return;
  const expired = await database().prepare("UPDATE assets SET status='failed',error=? WHERE id=? AND owner=? AND status='submitting' AND remote=?")
    .bind("This image request could not be confirmed. Credits returned. Start a new generation when ready.", row.id, row.owner, row.remote).run();
  if (expired.meta.changes) await refundCredits(row.id);
}
async function replay(row: AssetRow, owner: string, productId: string, requestHash: string) {
  if (row.owner !== owner || row.product_id !== productId || metadata(row).requestHash !== requestHash)
    throw new ApiError("This requestId was used for different inputs. Use a new ID.", 409);
  await expireImageLease(row);
  const current = await database().prepare("SELECT status,error FROM assets WHERE id=? AND owner=?").bind(row.id, owner).first<{status:string;error:string|null}>();
  return Response.json({ id: row.id, status: current!.status, ...(current!.error ? {error:current!.error} : {}) });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await identity(), { id } = await params;
    await ownedProduct(id, u.userId);
    const stale = await database().prepare("SELECT id,owner,product_id,status,remote,error FROM assets WHERE product_id=? AND owner=? AND kind='image' AND status='submitting'").bind(id,u.userId).all<AssetRow>();
    for (const row of stale.results) await expireImageLease(row);
    const assets = await database().prepare("SELECT id,kind,name,prompt,status,error,created_at FROM assets WHERE product_id=? AND owner=? ORDER BY created_at DESC").bind(id, u.userId).all();
    return Response.json({ assets: assets.results }, {headers:{'Cache-Control':'private, no-store'}});
  } catch (e) { return failure(e); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let id = "", owner = "", claimed = false;
  try {
    sameOrigin(req);
    const u = await identity(), { id: productId } = await params;
    owner = u.userId;
    const product = await ownedProduct(productId, owner);
    if (product.archived_at != null) throw new ApiError("Restore this product before generating new assets.",409);
    const d = inputSchema.parse(await req.json()), db = database();
    id = assetId(await digest(`${owner}:${d.requestId}`));
    const requestHash = await digest(JSON.stringify([owner,productId,d.kind,d.name,d.prompt,d.aspect,d.kind === 'image' ? d.quality : null]));
    const old = await db.prepare("SELECT id,owner,product_id,status,remote,error FROM assets WHERE id=?").bind(id).first<AssetRow>();
    if (old) return await replay(old,owner,productId,requestHash);
    if(d.maxCredits!==undefined){const quotedCost=await hasUnlimitedGeneration(owner)?0:d.kind==='image'?designImageCredits(d.quality):creditPolicy.video;if(quotedCost>d.maxCredits)throw new ApiError(`This asset needs ${quotedCost} credits. Review the price before approving it.`,402);}

    const bucket = (env as unknown as {BUCKET?:R2Bucket}).BUCKET;
    if (d.kind === 'image') {
      if (!bucket) throw new ApiError("Image storage is temporarily unavailable. Your credits have not been spent.",503);
      const readiness = await imageGenerationReadiness(owner);
      if (!readiness.ready) throw new ApiError(readiness.message || "Image generation is temporarily unavailable.",503);
    }
    const remote = {provider:d.kind === 'image' ? 'openai' : 'fal',requestHash,leaseExpiresAt:Date.now()+pendingLeaseMs};
    // Claim before credits or provider work. The capacity check and insert are atomic.
    const claim = await db.prepare("INSERT OR IGNORE INTO assets (id,owner,product_id,kind,name,prompt,status,remote,created_at) SELECT ?,?,?,?,?,?,'submitting',?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=? AND archived_at IS NULL) AND (SELECT COUNT(*) FROM assets WHERE owner=? AND status IN ('submitting','queued','running'))<4")
      .bind(id,owner,productId,d.kind,d.name,d.prompt,JSON.stringify(remote),Date.now(),productId,owner,owner).run();
    if (!claim.meta.changes) {
      const existing = await db.prepare("SELECT id,owner,product_id,status,remote,error FROM assets WHERE id=?").bind(id).first<AssetRow>();
      if (existing) return await replay(existing,owner,productId,requestHash);
      throw new ApiError("You already have four media jobs running, or this product is no longer available. Wait for a job to finish and refresh.",429);
    }
    claimed = true;
    await reserveCredits(owner,id,d.kind,d.kind === 'image' ? designImageCredits(d.quality) : creditPolicy.video);
    if (d.kind === 'image') {
      const image = await generateOpenAIImage({owner,prompt:d.prompt,quality:d.quality,size:d.aspect === '16:9' ? '1536x864' : d.aspect === '9:16' ? '864x1536' : '1024x1024',background:'opaque',outputFormat:'jpeg'});
      const objectKey = `${owner}/${productId}/${id}.jpg`;
      await bucket!.put(objectKey,image.bytes,{httpMetadata:{contentType:'image/jpeg'}});
      let saved:D1Result[];
      try {
        saved = await db.batch([
          db.prepare("UPDATE assets SET status='completed',object_key=? WHERE id=? AND owner=? AND status='submitting' AND remote=? AND EXISTS(SELECT 1 FROM products WHERE id=assets.product_id AND owner=assets.owner AND archived_at IS NULL) AND EXISTS(SELECT 1 FROM credit_usage WHERE id=assets.id AND owner=assets.owner AND state='reserved')").bind(objectKey,id,owner,JSON.stringify(remote)),
          db.prepare("UPDATE credit_usage SET state='completed' WHERE id=? AND owner=? AND state='reserved' AND EXISTS(SELECT 1 FROM assets WHERE id=credit_usage.id AND owner=credit_usage.owner AND status='completed' AND object_key=?)").bind(id,owner,objectKey),
        ]);
      } catch (error) { await bucket!.delete(objectKey); throw error; }
      if (!saved[0].meta.changes || !saved[1].meta.changes) { await bucket!.delete(objectKey); throw new ApiError("This product was archived or the image request expired before it could be saved. Credits returned.",409); }
      return Response.json({id,status:'completed'});
    }

    // Existing FAL video submission and historical FAL sync remain unchanged.
    const key = await providerKey(owner,'fal'), {config} = await providerSettings(owner);
    await reserveAIBudget(700000,owner);
    const response = await fetch(`https://queue.fal.run/${config.videoModel}`,{method:'POST',signal:AbortSignal.timeout(150000),headers:{Authorization:`Key ${key}`,'Content-Type':'application/json'},body:JSON.stringify({prompt:d.prompt,aspect_ratio:d.aspect,duration:'5',generate_audio:true})});
    const result = await response.json() as {request_id?:string;status_url?:string;response_url?:string};
    if (!response.ok) throw new ApiError("Video generation is temporarily unavailable. Please try again later.",502);
    if (!result.request_id || !result.status_url || !result.response_url) throw new ApiError("Media provider returned an incomplete job.",502);
    for (const link of [result.status_url,result.response_url]) if (new URL(link).origin !== 'https://queue.fal.run') throw new ApiError("Unexpected provider response.",502);
    const queued = await db.prepare("UPDATE assets SET status='queued',remote=? WHERE id=? AND owner=? AND status='submitting' AND EXISTS(SELECT 1 FROM products WHERE id=assets.product_id AND owner=assets.owner AND archived_at IS NULL)").bind(JSON.stringify({...remote,requestId:result.request_id,statusUrl:result.status_url,responseUrl:result.response_url}),id,owner).run();
    if (!queued.meta.changes) throw new ApiError("This product was archived before its video job could be saved. Credits returned.",409);
    return Response.json({id,status:'queued'});
  } catch (e) {
    if (claimed) {
      await refundCredits(id);
      const message = e instanceof ApiError ? e.message : "Generation could not be completed. Credits returned.";
      await database().prepare("UPDATE assets SET status='failed',error=? WHERE id=? AND owner=? AND status='submitting'").bind(message.slice(0,500),id,owner).run();
      const response = failure(e);
      return Response.json({...await response.json() as Record<string,unknown>,id,status:'failed'},{status:response.status});
    }
    return failure(e);
  }
}
