import { ApiError, database, ownedProduct } from "@/lib/server";
import { getGrowth } from "@/lib/growth-server";
import { landingSnapshotSchema, marketingConsentText, type GrowthLead, type PublishedFunnel,type FunnelVideoDraft } from "@/lib/growth-funnel";
import { enrollAutomationLead } from "@/lib/automation-server";

function funnelFromRow(row: Record<string, unknown>): PublishedFunnel {
  return { slug: String(row.slug), title: String(row.title), landing: landingSnapshotSchema.parse(JSON.parse(String(row.landing))), creatorVslUploadId: row.creator_vsl_upload_id ? String(row.creator_vsl_upload_id) : null, publishedAt: row.published_at == null ? null : Number(row.published_at), updatedAt: Number(row.updated_at) };
}
export async function getOwnedFunnel(productId: string, owner: string) {
  await ownedProduct(productId, owner);
  const row = await database().prepare("SELECT * FROM growth_funnels WHERE product_id=? AND owner=?").bind(productId, owner).first();
  return row ? funnelFromRow(row) : null;
}
export async function getPublicFunnel(slug: string) {
  const row = await database().prepare("SELECT f.* FROM growth_funnels f JOIN products p ON p.id=f.product_id AND p.owner=f.owner WHERE f.slug=? AND f.published_at IS NOT NULL").bind(slug).first();
  if (!row) throw new ApiError("This page is unavailable.", 404);
  return { ...funnelFromRow(row), productId: String(row.product_id), owner: String(row.owner) };
}
export async function getOwnedFunnelVideoDraft(productId:string,owner:string):Promise<FunnelVideoDraft>{
 await ownedProduct(productId,owner);
 const row=await database().prepare('SELECT creator_vsl_upload_id,updated_at FROM growth_funnel_drafts WHERE product_id=? AND owner=?').bind(productId,owner).first();
 if(row)return {creatorVslUploadId:row.creator_vsl_upload_id?String(row.creator_vsl_upload_id):null,updatedAt:Number(row.updated_at)};
 const published=await database().prepare('SELECT creator_vsl_upload_id FROM growth_funnels WHERE product_id=? AND owner=?').bind(productId,owner).first();
 return {creatorVslUploadId:published?.creator_vsl_upload_id?String(published.creator_vsl_upload_id):null,updatedAt:0};
}
export async function saveFunnelVideoDraft(productId:string,owner:string,input:{creatorVslUploadId:string|null;expectedUpdatedAt:number}){
 await ownedProduct(productId,owner);
 if(input.creatorVslUploadId){const video=await database().prepare("SELECT id FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND mime IN ('video/mp4','video/webm') AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(input.creatorVslUploadId,productId,owner).first();if(!video)throw new ApiError('Choose a completed video uploaded to this product.',409);}
 const now=Math.max(Date.now(),input.expectedUpdatedAt+1);
 const result=await database().prepare(`INSERT INTO growth_funnel_drafts(product_id,owner,creator_vsl_upload_id,updated_at)
 SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?)
 AND (?=0 OR EXISTS(SELECT 1 FROM growth_funnel_drafts WHERE product_id=? AND owner=?))
 AND (? IS NULL OR EXISTS(SELECT 1 FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND mime IN ('video/mp4','video/webm') AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)))
 ON CONFLICT(product_id) DO UPDATE SET creator_vsl_upload_id=excluded.creator_vsl_upload_id,updated_at=excluded.updated_at WHERE growth_funnel_drafts.owner=excluded.owner AND growth_funnel_drafts.updated_at=?`)
 .bind(productId,owner,input.creatorVslUploadId,now,productId,owner,input.expectedUpdatedAt,productId,owner,input.creatorVslUploadId,input.creatorVslUploadId,productId,owner,input.expectedUpdatedAt).run();
 if(!result.meta.changes)throw new ApiError('Your saved video selection changed in another tab. Reload it before saving. Your current selection is still here.',409);
 return getOwnedFunnelVideoDraft(productId,owner);
}
export async function publishFunnel(productId: string, owner: string, input: { expectedUpdatedAt: number; expectedGrowthUpdatedAt: number; creatorVslUploadId: string | null;expectedVideoDraftUpdatedAt?:number }) {
  const product = await ownedProduct(productId, owner);
  const growth = await getGrowth(productId, owner);
  if (growth.updatedAt !== input.expectedGrowthUpdatedAt) throw new ApiError("Your draft changed. Reload it before publishing.", 409);
  if (!growth.assets) throw new ApiError("Save landing page copy before publishing.");
  const landing = landingSnapshotSchema.parse(growth.assets.landing);
  if (input.creatorVslUploadId) {
    const video = await database().prepare("SELECT id FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND mime IN ('video/mp4','video/webm') AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)").bind(input.creatorVslUploadId, productId, owner).first();
    if (!video) throw new ApiError("Choose a completed video uploaded to this product.", 409);
  }
  const videoGuard=input.expectedVideoDraftUpdatedAt===undefined?'':`AND ((?=0 AND NOT EXISTS(SELECT 1 FROM growth_funnel_drafts WHERE product_id=? AND owner=?)) OR EXISTS(SELECT 1 FROM growth_funnel_drafts WHERE product_id=? AND owner=? AND updated_at=?))`;
  const videoGuardValues=input.expectedVideoDraftUpdatedAt===undefined?[]:[input.expectedVideoDraftUpdatedAt,productId,owner,productId,owner,input.expectedVideoDraftUpdatedAt];
  const now = Math.max(Date.now(), input.expectedUpdatedAt + 1);
  const result = await database().prepare(`INSERT INTO growth_funnels (product_id,owner,slug,title,landing,creator_vsl_upload_id,published_at,updated_at)
    SELECT ?,?,?,?,?,?,?,? WHERE (?=0 OR EXISTS (SELECT 1 FROM growth_funnels WHERE product_id=? AND owner=?))
    AND EXISTS (SELECT 1 FROM growth_workspaces WHERE product_id=? AND owner=? AND updated_at=? AND lease<?)
    ${videoGuard}
    ON CONFLICT(product_id) DO UPDATE SET title=excluded.title,landing=excluded.landing,creator_vsl_upload_id=excluded.creator_vsl_upload_id,published_at=excluded.published_at,updated_at=excluded.updated_at
    WHERE growth_funnels.owner=excluded.owner AND growth_funnels.updated_at=?`)
    .bind(productId, owner, String(product.slug), String(product.title), JSON.stringify(landing), input.creatorVslUploadId, now, now, input.expectedUpdatedAt, productId, owner, productId, owner, input.expectedGrowthUpdatedAt, now,...videoGuardValues, input.expectedUpdatedAt).run();
  if (!result.meta.changes) throw new ApiError("The published page changed in another tab. Reload before publishing.", 409);
  return getOwnedFunnel(productId, owner);
}
export async function unpublishFunnel(productId: string, owner: string) {
  await ownedProduct(productId, owner);
  await database().prepare("UPDATE growth_funnels SET published_at=NULL,updated_at=MAX(updated_at+1,?) WHERE product_id=? AND owner=?").bind(Date.now(), productId, owner).run();
  return getOwnedFunnel(productId, owner);
}
export async function limitLeadCapture(productId: string, email: string) {
  const now = Date.now(), window = 15 * 60 * 1000;
  // Portable across Cloudflare and Render: arbitrary forwarded-IP headers are
  // never trusted. Bound repeat attempts per address plus aggregate page traffic.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${productId}:${Math.floor(now / window)}:${email}`));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  for (const [key, limit, expires] of [[`email:${hash}`, 10, now + window], [`page:${productId}:${Math.floor(now / 3600000)}`, 200, now + 3600000]] as const) {
    const row = await database().prepare("INSERT INTO growth_lead_rate_limits (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits").bind(key, expires).first();
    if (Number(row?.hits) > limit) throw new ApiError("Too many requests. Please try again later.", 429);
  }
  await database().prepare("DELETE FROM growth_lead_rate_limits WHERE expires_at<?").bind(now).run();
}
export async function captureLead(funnel: Awaited<ReturnType<typeof getPublicFunnel>>, input: { name: string; email: string; marketing: boolean }) {
  const now = Date.now(), source = `/g/${funnel.slug}`;
  // Attribution and ownership are derived from the published page, never the visitor.
  // A repeat signup cannot remove earlier consent, notes, or the creator's status.
  const result = await database().prepare(`INSERT INTO growth_leads (id,owner,product_id,email,name,marketing,consent_text,consent_at,source,last_source,status,notes,created_at,last_seen_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,'new','',?,?,? WHERE EXISTS (SELECT 1 FROM growth_funnels WHERE product_id=? AND owner=? AND published_at IS NOT NULL)
    ON CONFLICT(product_id,email) DO UPDATE SET name=excluded.name,marketing=MAX(growth_leads.marketing,excluded.marketing),consent_text=CASE WHEN excluded.marketing=1 THEN excluded.consent_text ELSE growth_leads.consent_text END,consent_at=CASE WHEN excluded.marketing=1 THEN excluded.consent_at ELSE growth_leads.consent_at END,last_source=excluded.last_source,last_seen_at=excluded.last_seen_at,updated_at=MAX(growth_leads.updated_at+1,excluded.updated_at)`)
    .bind(crypto.randomUUID(), funnel.owner, funnel.productId, input.email, input.name, input.marketing ? 1 : 0, input.marketing ? marketingConsentText : "", input.marketing ? now : null, source, source, now, now, now, funnel.productId, funnel.owner).run();
  if (!result.meta.changes) throw new ApiError("This page is unavailable.", 404);
  // Enrollment independently checks saved consent, suppression and activation.
  // A worker reconciliation pass recovers if the process stops after lead storage.
  await enrollAutomationLead(funnel.productId, funnel.owner, input.email).catch(() => { console.error('Lead automation will retry during reconciliation.'); });
}
export function leadFromRow(row: Record<string, unknown>): GrowthLead {
  return { id: String(row.id), productId: String(row.product_id), productTitle: String(row.product_title), name: String(row.name), email: String(row.email), marketing: !!row.marketing, consentText: String(row.consent_text), consentAt: row.consent_at == null ? null : Number(row.consent_at), source: String(row.source), lastSource: String(row.last_source), status: row.status as GrowthLead["status"], notes: String(row.notes), createdAt: Number(row.created_at), lastSeenAt: Number(row.last_seen_at), updatedAt: Number(row.updated_at) };
}
