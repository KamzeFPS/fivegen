"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, Eye, Film, Globe, Loader2, Save, Upload } from "lucide-react";
import type { Product } from "@/lib/product";
import type { Growth, GrowthAssets } from "@/lib/growth";
import {useRegisterEditorSave} from './editor-save-registry';
import { landingSnapshotSchema, type PublishedFunnel,type FunnelVideoDraft } from "@/lib/growth-funnel";

type UploadFile = { purpose?: string; id: string; name: string; mime: string; size: number };
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(data.error || "Please try again."); return data;
}
function blankAssets(): GrowthAssets { return { vsl: "", followUp: "", landing: { headline: "", subheadline: "", body: "", benefits: [], ctaLabel: "Request details", thankYou: "Thank you for your interest. Your request has been shared with the creator." } }; }
type FunnelPanelProps = { product: Product; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void };
export function GrowthFunnelPanel(props: FunnelPanelProps) { return <FunnelWorkspace key={props.product.id} {...props}/>; }
function FunnelWorkspace({ product, onDirtyChange, onBusyChange }: FunnelPanelProps) {
  const [growth, setGrowth] = useState<Growth | null>(null), [saved, setSaved] = useState("");
  const [funnel, setFunnel] = useState<PublishedFunnel | null>(null), [uploads, setUploads] = useState<UploadFile[]>([]), [videoId, setVideoId] = useState("");
  const [videoBaseline,setVideoBaseline]=useState(""),[videoRevision,setVideoRevision]=useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [preview, setPreview] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const dirty = !!growth && JSON.stringify(growth.assets) !== saved;
  const videoDirty = videoId !== (funnel?.creatorVslUploadId || "");
  const videoDraftDirty=videoId!==videoBaseline;
  useEffect(() => { onDirtyChange?.(dirty || videoDraftDirty); return () => onDirtyChange?.(false); }, [dirty, videoDraftDirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy || uploading); return () => onBusyChange?.(false); }, [busy, uploading, onBusyChange]);
  useEffect(() => { let active = true;
    Promise.all([api<{ growth: Growth }>(`/api/products/${product.id}/growth`), api<{ funnel: PublishedFunnel | null;videoDraft:FunnelVideoDraft }>(`/api/products/${product.id}/growth/publish`), api<{ uploads: UploadFile[] }>(`/api/products/${product.id}/uploads`)]).then(([g, f, files]) => { if (!active) return; setGrowth(g.growth); setSaved(JSON.stringify(g.growth.assets)); setFunnel(f.funnel); const selection=f.videoDraft?(f.videoDraft.creatorVslUploadId||""):(f.funnel?.creatorVslUploadId||"");setVideoId(selection);setVideoBaseline(selection);setVideoRevision(f.videoDraft?.updatedAt||0); setUploads(files.uploads.filter(file => ["video/mp4", "video/webm"].includes(file.mime) && file.purpose !== "voice")); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [product.id]);
  const assets = growth?.assets || blankAssets(), landing = assets.landing;
  function updateLanding(patch: Partial<GrowthAssets["landing"]>) { if (!growth) return; setGrowth({ ...growth, assets: { ...assets, landing: { ...landing, ...patch } } }); setNotice(""); }
  async function save() {
    if (!growth) return null;
    const next = await api<{ growth: Growth }>(`/api/products/${product.id}/growth`, "PATCH", { brief: growth.brief, assets: growth.assets, expectedUpdatedAt: growth.updatedAt });
    setGrowth(next.growth); setSaved(JSON.stringify(next.growth.assets)); return next.growth as Growth;
  }
  async function action(kind: "save" | "publish" | "unpublish") {
    if(busy||uploading||!growth)return false;setBusy(true); setError(""); setNotice("");
    try {
      if (kind === "unpublish") { const data = await api<{ funnel: PublishedFunnel | null }>(`/api/products/${product.id}/growth/publish`, "DELETE"); setFunnel(data.funnel); setNotice("Your public page is now offline."); }
      else {
        if (kind === "publish") { const validation = landingSnapshotSchema.safeParse(landing); if (!validation.success) throw new Error("Add a headline, page copy, button label and thank-you message. Keep benefits under 500 characters each."); }
        const next = dirty ? await save() : growth;
        let savedVideoRevision=videoRevision;
        if(videoDraftDirty){const result=await api<{videoDraft:FunnelVideoDraft}>(`/api/products/${product.id}/growth/publish`,"PATCH",{creatorVslUploadId:videoId||null,expectedUpdatedAt:videoRevision});setVideoBaseline(result.videoDraft.creatorVslUploadId||"");setVideoRevision(result.videoDraft.updatedAt);savedVideoRevision=result.videoDraft.updatedAt;}
        if (kind === "save") setNotice("Copy and video selection saved privately. Your public page is unchanged.");
        else if (next) { const data = await api<{ funnel: PublishedFunnel }>(`/api/products/${product.id}/growth/publish`, "POST", { expectedUpdatedAt: funnel?.updatedAt || 0, expectedGrowthUpdatedAt: next.updatedAt, creatorVslUploadId: videoId || null,expectedVideoDraftUpdatedAt:savedVideoRevision }); setFunnel(data.funnel); setNotice("Your landing page is live. Share its link to collect leads."); }
      }
      return true;
    } catch (e) { setError((e as Error).message);return false; } finally { setBusy(false); }
  }
  async function upload(file: File) {
    setError(""); if (!["video/mp4", "video/webm"].includes(file.type) || file.size < 1 || file.size > 100 * 1024 * 1024) { setError("Choose an MP4 or WebM video up to 100 MB."); return; }
    setUploading(true);
    try { const response = await fetch(`/api/products/${product.id}/uploads?name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "Content-Type": file.type, "X-File-Size": String(file.size) }, body: file }); const data = await response.json() as { upload: UploadFile; error?: string }; if (!response.ok) throw new Error(data.error || "Upload failed. Please retry."); setUploads(items => [data.upload, ...items]); setVideoId(data.upload.id); setNotice("Video uploaded privately. Publish the page to share this recording."); } catch (e) { setError((e as Error).message); } finally { setUploading(false); }
  }
  useRegisterEditorSave({label:"Funnel copy and video draft",dirty:dirty||videoDraftDirty,busy:busy||uploading,save:()=>action("save"),priority:20});
  if (loading) return <div className="growth-loading" role="status"><Loader2 className="spin" size={20}/>Loading your funnel…</div>;
  if (!growth) return <p className="error-banner" role="alert">{error || "Could not load this workspace. Reload to try again."}</p>;
  return <div className="growth-workspace growth-funnel-panel">
    <div className="growth-heading"><div><span className="eyebrow">FUNNEL</span><h2>A home for your next customer.</h2><p>Shape your landing page, add your recorded VSL, and collect interested leads.</p></div><span className={`growth-status ${funnel?.publishedAt ? "is-live" : ""}`}><Globe size={14}/>{funnel?.publishedAt ? "Live" : "Private draft"}</span></div>
    {error && <p className="error-banner" role="alert">{error}</p>}{notice && <p className="growth-notice" role="status"><Check size={16}/>{notice}</p>}
    <div className="growth-editor-grid"><section className="growth-card"><div className="growth-card-heading"><h3>Landing page copy</h3><button className="button secondary" onClick={() => setPreview(!preview)}><Eye size={15}/>{preview ? "Edit copy" : "Preview"}</button></div>
      {preview ? <div className="growth-draft-preview"><span className="eyebrow">DRAFT PREVIEW</span><h2>{landing.headline || "Your headline"}</h2><p>{landing.subheadline}</p><div style={{ whiteSpace: "pre-wrap" }}>{landing.body}</div><ul>{landing.benefits.map((benefit, i) => <li key={i}>{benefit}</li>)}</ul><button className="button primary" type="button" disabled>{landing.ctaLabel}</button><small>Preview only. The live form collects name, email, and optional marketing consent.</small></div> : <fieldset disabled={busy || uploading} className="growth-form-stack">
        <label>Headline<input value={landing.headline} maxLength={250} onChange={e => updateLanding({ headline: e.target.value })} placeholder="The outcome your customer wants"/></label>
        <label>Subheadline<textarea rows={2} value={landing.subheadline} maxLength={700} onChange={e => updateLanding({ subheadline: e.target.value })}/></label>
        <label>Your story and offer<textarea rows={8} value={landing.body} maxLength={12000} onChange={e => updateLanding({ body: e.target.value })}/></label>
        <label>Benefits · one per line<textarea rows={4} value={landing.benefits.join("\n")} maxLength={4007} onChange={e => updateLanding({ benefits: e.target.value.split("\n").slice(0, 8) })}/><small>Up to 8 benefits, 500 characters each.</small></label>
        <label>Button label<input value={landing.ctaLabel} maxLength={100} onChange={e => updateLanding({ ctaLabel: e.target.value })}/></label>
        <label>Thank-you message<textarea rows={3} value={landing.thankYou} maxLength={2000} onChange={e => updateLanding({ thankYou: e.target.value })}/><small>Shown after signup. Follow-up is manual, so don’t promise an automatic email.</small></label>
      </fieldset>}
    </section><aside className="growth-form-stack"><section className="growth-card"><div className="growth-card-heading"><h3>Your recorded VSL</h3><Film size={18}/></div><p>Your audience hears from you. Choose the recording you want visitors to see.</p>
      <label>Sales video<select value={videoId} disabled={busy || uploading} onChange={e => setVideoId(e.target.value)}><option value="">No public video</option>{uploads.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}</select></label>
      {videoDirty && <div className="growth-help">Your selection is {videoDraftDirty?"not saved yet":"saved privately"}. Publish to apply it to the public page, or <button className="growth-text-button" disabled={busy || uploading} onClick={() => setVideoId(funnel?.creatorVslUploadId || "")}>reset selection</button>.</div>}
      {videoId && <video key={videoId} className="growth-video-preview" controls playsInline preload="metadata" src={`/api/uploads/${videoId}`}/>}
      <label className="button secondary growth-upload"><Upload size={15}/>{uploading ? "Uploading…" : "Upload your VSL"}<input type="file" accept="video/mp4,video/webm" disabled={busy || uploading} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }}/></label><small>MP4 or WebM · up to 100 MB. This selection becomes public only when you publish.</small>
    </section><section className="growth-card growth-publish-card"><h3>Publish your funnel</h3><p>Publishing shares the copy above and your selected video. Update the live page whenever your draft is ready.</p>
      {funnel?.publishedAt && <div className="growth-published-link"><a href={`/g/${funnel.slug}`} target="_blank" rel="noreferrer">Open live page <ArrowUpRight size={15}/></a><button className="button secondary" onClick={() => void navigator.clipboard.writeText(`${location.origin}/g/${funnel.slug}`).then(() => setNotice("Link copied.")).catch(() => setError("Could not copy the link. Open the live page and copy its address."))}><Copy size={15}/>Copy link</button><small>Published {new Date(funnel.publishedAt).toLocaleString()}</small></div>}
      <div className="growth-form-stack"><button className="button secondary" disabled={busy || uploading || (!dirty&&!videoDraftDirty)} onClick={() => void action("save")}><Save size={15}/>Save draft</button><button className="button primary" disabled={busy || uploading || !landing.headline.trim() || !landing.body.trim()} onClick={() => void action("publish")}>{busy ? <Loader2 className="spin" size={15}/> : <Globe size={15}/>} {funnel?.publishedAt ? "Update live page" : "Publish landing page"}</button>{funnel?.publishedAt && <button className="growth-text-button" disabled={busy || uploading} onClick={() => void action("unpublish")}>Unpublish page</button>}</div>
      <small role="status">{busy?"Working…":error&&(dirty||videoDraftDirty)?"Couldn’t save · changes kept":dirty||videoDraftDirty?"Unsaved draft changes":"Draft saved privately"}</small><small>Signups appear in CRM. Your private brief, scripts and lessons stay in your workspace.</small>
    </section></aside></div>
  </div>;
}
export default GrowthFunnelPanel;
