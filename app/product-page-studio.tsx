"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Eye, Globe, ImagePlus, Loader2, Palette, Plus, Save, Settings2, Trash2, Upload, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { Product } from "@/lib/product";
import { colors } from "@/lib/product";
import { productPageConfigSchema, type ProductPageConfig, type ProductPageState } from "@/lib/product-page";
import { ProductPageView } from "./product-page-view";

type ImageUpload = { id: string; name: string; mime: string; size: number; purpose?: string };
type ProductPageStudioProps = {
  product: Product;
  mode: "creator" | "member";
  onModeChange: (mode: "creator" | "member") => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  initialTab?: "home" | "content" | "reviews";
  editingRequested?: number;
  onBrandingChange?: (iconUploadId: string | null) => void;
  onProductDetails?: () => void;
};
const imageTypes = ["image/jpeg", "image/png", "image/webp"];
async function pageApi<T>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", signal, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Your changes could not be saved. Please try again.");
  return result;
}

export function ProductPageStudio(props: ProductPageStudioProps) {
  return <ProductPageEditor key={props.product.id} {...props}/>;
}

function ProductPageEditor({ product, mode, onModeChange, onDirtyChange, onBusyChange, initialTab = "home", editingRequested, onBrandingChange, onProductDetails }: ProductPageStudioProps) {
  const [page, setPage] = useState<ProductPageState | null>(null);
  const [config, setConfig] = useState<ProductPageConfig | null>(null);
  const [uploads, setUploads] = useState<ImageUpload[]>([]);
  const [loading, setLoading] = useState(true), [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<"icon" | "banner" | null>(null);
  const [editing, setEditing] = useState(false), [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const dirty = !!page && !!config && JSON.stringify(config) !== JSON.stringify(page.draft);
  const working = busy || !!uploading;
  const endpoint = `/api/products/${product.id}/page`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    pageApi<{ page: ProductPageState }>(endpoint, "GET", undefined, controller.signal).then(data => {
      setPage(data.page); setConfig(data.page.draft);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    pageApi<{ uploads: ImageUpload[] }>(`/api/products/${product.id}/uploads`, "GET", undefined, controller.signal).then(data => setUploads(data.uploads.filter(file => imageTypes.includes(file.mime) && file.purpose !== "voice" && file.size <= 10 * 1024 * 1024))).catch(() => { /* The page remains usable if the image library is unavailable. Upload errors are shown separately. */ });
    return () => controller.abort();
  }, [endpoint, loadAttempt, product.id]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(working); return () => onBusyChange?.(false); }, [working, onBusyChange]);
  useEffect(() => { if (editingRequested) setEditing(true); }, [editingRequested]);

  function update(patch: Partial<ProductPageConfig>) {
    setConfig(current => current ? { ...current, ...patch } : current); setNotice("");
  }
  function updateLink(index: number, key: "label" | "url", value: string) {
    if (!config) return; update({ links: config.links.map((link, itemIndex) => itemIndex === index ? { ...link, [key]: value } : link) });
  }
  async function save() {
    if (!config || !page) return;
    const validation = productPageConfigSchema.safeParse(config);
    if (!validation.success) { setError(validation.error.issues[0]?.message || "Check your page settings and use a valid HTTPS URL for every link."); return; }
    setBusy(true); setError(""); setNotice("");
    try { const result = await pageApi<{ page: ProductPageState }>(endpoint, "PATCH", { config: validation.data, expectedUpdatedAt: page.updatedAt }); setPage(result.page); setConfig(result.page.draft); if (page.draft.iconUploadId !== result.page.draft.iconUploadId) onBrandingChange?.(result.page.draft.iconUploadId); setNotice("Draft saved. Publish when you’re ready to share these changes."); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function publish(unpublish = false) {
    if (!page || dirty) return;
    setBusy(true); setError(""); setNotice("");
    try { const result = await pageApi<{ page: ProductPageState }>(`${endpoint}/publish`, unpublish ? "DELETE" : "POST", { expectedUpdatedAt: page.updatedAt }); setPage(result.page); setConfig(result.page.draft); setConfirmUnpublish(false); setNotice(unpublish ? "Your product page is now private. Its public link no longer opens the page." : "Your product page is live. Your lessons and downloads stay protected."); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function uploadImage(file: File, kind: "icon" | "banner") {
    setError(""); setNotice("");
    if (!imageTypes.includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) { setError("Choose a JPEG, PNG, or WebP image smaller than 10 MB."); return; }
    setUploading(kind);
    try {
      const response = await fetch(`/api/products/${product.id}/uploads?name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "Content-Type": file.type, "X-File-Size": String(file.size) }, body: file });
      const result = await response.json() as { upload: ImageUpload; error?: string };
      if (!response.ok) throw new Error(result.error || "The image could not be uploaded. Please try again.");
      setUploads(current => [result.upload, ...current]); update({ [kind === "icon" ? "iconUploadId" : "bannerUploadId"]: result.upload.id });
      setNotice("Image uploaded privately. Save your draft, then publish to show it on your public page.");
    } catch (reason) { setError((reason as Error).message); } finally { setUploading(null); }
  }
  async function copyLink() {
    if (!page?.publishedAt) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}${page.publicPath}`); setNotice("Product page link copied."); }
    catch { setError("Couldn’t copy the link. Open the live page and copy its address."); }
  }
  if (loading) return <div className="product-page-loading" role="status"><Loader2 className="spin" size={20}/>Opening your product page…</div>;
  if (!page || !config) return <section className="product-page-load-error"><h2>Your page couldn’t load</h2><p role="alert">{error || "Please try again."}</p><button type="button" className="button secondary" onClick={() => setLoadAttempt(value => value + 1)}>Try again</button></section>;

  return <div className="product-page-studio">
    <div className="product-page-studio-toolbar"><div className="product-page-view-switch" aria-label="Page view"><button type="button" aria-pressed={mode === "creator"} disabled={working} onClick={() => onModeChange("creator")}><Settings2 size={14}/>Creator</button><button type="button" aria-pressed={mode === "member"} disabled={working} onClick={() => onModeChange("member")}><Eye size={14}/>Member preview</button></div><div className="product-page-toolbar-actions"><span className={`product-page-publish-status ${page.publishedAt ? "is-live" : ""}`}><span/>{page.publishedAt ? "Page live" : "Private page"}{dirty && <small>· Unsaved changes</small>}</span>{mode === "creator" && <button type="button" className="button secondary" ref={editButton} disabled={working} onClick={() => setEditing(true)}><Palette size={15}/>Customize page</button>}</div></div>
    <div className="product-page-feedback" aria-live="polite">{error && <p className="product-page-error" role="alert">{error}</p>}{notice && <p className="product-page-notice" role="status"><Check size={15}/>{notice}</p>}</div>
    {mode === "member" && <p className="product-page-member-notice"><Eye size={15}/><span>Member preview of your draft. You can explore your lessons here; this doesn’t create a purchase or change anyone’s access.</span></p>}
    <div className="product-page-preview-frame"><ProductPageView product={{ id: product.id, slug: product.slug, title: product.title, description: product.description, format: product.format, sections: product.content.sections.map(section => ({ title: section.title, category: section.category })) }} config={config} reviewSummary={page.reviewSummary} iconUrl={config.iconUploadId ? `/api/uploads/${config.iconUploadId}` : null} bannerUrl={config.bannerUploadId ? `/api/uploads/${config.bannerUploadId}` : null} memberContent={mode === "member" ? product.content : undefined} preview initialTab={initialTab} onCustomize={mode === "creator" && !working ? () => setEditing(true) : undefined}/></div>
    {mode === "creator" && <section className="product-page-publish-bar"><div><Globe size={18}/><div><strong>{page.publishedAt ? "Your public product page" : "Ready to make it yours?"}</strong><p>{dirty ? "Save your draft before publishing. Your live page keeps its last published version." : page.publishedAt ? "Your saved draft is private until you update the live page." : "Customize your page, save a draft, then publish it when you’re ready."}</p></div></div><div className="product-page-publish-actions"><button type="button" className="button secondary" disabled={working || !dirty} onClick={() => void save()}><Save size={15}/>Save draft</button><button type="button" className="button primary" disabled={working || dirty} onClick={() => void publish()}>{busy ? <Loader2 className="spin" size={15}/> : <Globe size={15}/>} {page.publishedAt ? "Update live page" : "Publish page"}</button></div>{page.publishedAt && <div className="product-page-live-tools"><a href={page.publicPath} target="_blank" rel="noopener noreferrer">Open live page <ArrowUpRight size={14}/></a><button type="button" disabled={working} onClick={() => void copyLink()}><Copy size={14}/>Copy link</button>{!confirmUnpublish ? <button type="button" disabled={working || dirty} onClick={() => setConfirmUnpublish(true)}>Unpublish page</button> : <span className="product-page-unpublish-confirm">Make this page private? <button type="button" disabled={working} onClick={() => void publish(true)}>Yes, unpublish</button><button type="button" disabled={working} onClick={() => setConfirmUnpublish(false)}>Cancel</button></span>}</div>}</section>}
    <DialogPrimitive.Root open={editing} onOpenChange={next => { if (!working) setEditing(next); }}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="product-page-drawer-backdrop"/><DialogPrimitive.Content asChild aria-describedby="product-page-customizer-description" onEscapeKeyDown={event => { if (working) event.preventDefault(); }} onPointerDownOutside={event => { if (working) event.preventDefault(); }} onCloseAutoFocus={event => { if (editButton.current) { event.preventDefault(); editButton.current.focus(); } }}><aside className="product-page-customizer"><header><div><span className="product-page-section-label">YOUR PRODUCT PAGE</span><DialogPrimitive.Title asChild><h2>Make it feel like you.</h2></DialogPrimitive.Title></div><button type="button" aria-label="Close page customization" className="product-page-close" disabled={working} onClick={() => setEditing(false)}><X size={20}/></button></header><div className="product-page-customizer-scroll">
      <DialogPrimitive.Description asChild><p className="product-page-editor-help" id="product-page-customizer-description">Changes appear in your preview. Save a draft, then publish to update the public page.</p></DialogPrimitive.Description>
      {error && <p className="product-page-error" role="alert">{error}</p>}{notice && <p className="product-page-notice" role="status">{notice}</p>}
      <fieldset disabled={working}><legend><ImagePlus size={17}/>Your visuals</legend><p>Your banner and icon help people recognize this product.</p>{(["banner", "icon"] as const).map(kind => <div className="product-page-image-field" key={kind}><label htmlFor={`page-${kind}-select`}>{kind === "banner" ? "Cover banner" : "Product icon"}</label><select id={`page-${kind}-select`} value={(kind === "banner" ? config.bannerUploadId : config.iconUploadId) || ""} onChange={event => update({ [kind === "banner" ? "bannerUploadId" : "iconUploadId"]: event.target.value || null })}><option value="">{kind === "banner" ? "Neutral background" : "Product initials"}</option>{uploads.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}</select><label className="product-page-upload-control"><Upload size={14}/>{uploading === kind ? "Uploading…" : `Upload ${kind}`}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadImage(file, kind); }}/></label></div>)}<small>JPEG, PNG, or WebP · up to 10 MB. A wide image works best for the banner; a square image works best for the icon.</small><label>Accent color<select value={config.accent} onChange={event => update({ accent: event.target.value as ProductPageConfig["accent"] })}>{colors.map(color => <option value={color} key={color}>{color.charAt(0).toUpperCase() + color.slice(1)}</option>)}</select></label></fieldset>
      <fieldset disabled={working}><legend>Your introduction</legend>{onProductDetails && <div className="product-page-details-shortcut"><button type="button" className="button secondary" disabled={working || dirty} onClick={() => { setEditing(false); onProductDetails(); }}><Settings2 size={14}/>Edit product name & description</button>{dirty && <small>Save your page draft before opening product details.</small>}</div>}<label>Welcome message <span>Optional</span><textarea rows={3} maxLength={2000} value={config.welcomeMessage} onChange={event => update({ welcomeMessage: event.target.value })} placeholder="A personal welcome to your product…"/></label><label>About this product<textarea rows={7} maxLength={12000} value={config.about} onChange={event => update({ about: event.target.value })} placeholder={product.description}/><small>If empty, your product description is shown.</small></label></fieldset>
      <fieldset disabled={working}><legend>Creator details</legend><label className="product-page-toggle"><input type="checkbox" checked={config.showCreator} onChange={event => update({ showCreator: event.target.checked })}/><span>Show who created this product</span></label><label>Public creator name<input maxLength={100} value={config.creatorName} onChange={event => update({ creatorName: event.target.value })} placeholder="Your name or business name"/><small>Only this name is shown. Your account email stays private.</small></label><label className="product-page-toggle"><input type="checkbox" checked={config.showLocation} onChange={event => update({ showLocation: event.target.checked })}/><span>Show a location</span></label><label>Public location<input maxLength={120} value={config.location} onChange={event => update({ location: event.target.value })} placeholder="City, country, or online"/></label></fieldset>
      <fieldset disabled={working}><legend>Your links</legend><p>Add your website, social profiles, or a support page. Only HTTPS links can be published.</p>{config.links.map((link, index) => <div className="product-page-link-editor" key={index}><div><label>Link {index + 1} label<input maxLength={60} value={link.label} onChange={event => updateLink(index, "label", event.target.value)} placeholder="Website"/></label><label>HTTPS URL<input type="url" maxLength={2000} value={link.url} onChange={event => updateLink(index, "url", event.target.value)} placeholder="https://example.com"/></label></div><button type="button" className="product-page-close" aria-label={`Remove link ${index + 1}`} onClick={() => update({ links: config.links.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={16}/></button></div>)}<button type="button" className="button secondary" disabled={config.links.length >= 8} onClick={() => update({ links: [...config.links, { label: "", url: "" }] })}><Plus size={14}/>Add link</button><small>{config.links.length} of 8 links</small></fieldset>
      <fieldset disabled={working}><legend>Page sections</legend><label className="product-page-toggle"><input type="checkbox" checked={config.showContent} onChange={event => update({ showContent: event.target.checked })}/><span><strong>Content</strong><small>Show the public outline. Lessons and files stay protected.</small></span></label><label className="product-page-toggle"><input type="checkbox" checked={config.showReviews} onChange={event => update({ showReviews: event.target.checked })}/><span><strong>Reviews</strong><small>Show genuine customer reviews when available.</small></span></label></fieldset>
    </div><footer><span>{dirty ? "Unsaved changes" : "Draft saved"}</span><button type="button" className="button primary" disabled={working || !dirty} onClick={() => void save()}>{working ? <Loader2 className="spin" size={15}/> : <Save size={15}/>}Save draft</button></footer></aside></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
  </div>;
}
export default ProductPageStudio;
