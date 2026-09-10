"use client";

import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, FileText, Globe, Layers3, Loader2, Package, Sparkles, TrendingUp, X, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useLayoutEffect, useRef, type ComponentProps } from "react";
import { formats, money, type Brief, type Product } from "@/lib/product";
import { Cover } from "./ui-brand";

export function GrowingTextarea(props: ComponentProps<"textarea">) {
  const field = useRef<HTMLTextAreaElement>(null);
  const fit = () => { if (field.current) { field.current.style.height = "auto"; field.current.style.height = `${field.current.scrollHeight + 2}px`; } };
  useLayoutEffect(fit, [props.value]);
  useLayoutEffect(() => {
    let width = 0;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    if (field.current?.parentElement) observer.observe(field.current.parentElement);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return <textarea {...props} ref={field} className={`${props.className || ""} growing-textarea`} onInput={(event) => { fit(); props.onInput?.(event); }} />;
}

export function CreateProductFlow({ open, onOpenChange, brief, onBriefChange, step, onStepChange, busy, aiReady, signedIn, error, onCreate, onConnectAI }: {
  open: boolean; onOpenChange: (open: boolean) => void; brief: Brief; onBriefChange: (brief: Brief) => void;
  step: number; onStepChange: (step: number) => void; busy: boolean; aiReady: boolean; signedIn: boolean;
  error: string; onCreate: () => void; onConnectAI: () => void;
}) {
  const update = (values: Partial<Brief>) => onBriefChange({ ...brief, ...values });
  return <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}>
    <DialogContent className="flow-dialog" showCloseButton={false}>
      <DialogHeader className="flow-header">
        <div className="flow-kicker"><span><Sparkles size={16} /> NEW PRODUCT</span><button type="button" className="icon-button" disabled={busy} onClick={() => onOpenChange(false)} aria-label="Close and keep brief"><X size={19} /></button></div>
        <DialogTitle>{["Choose your format", "Describe your product", "Make it yours. Then create."][step]}</DialogTitle>
        <DialogDescription>{["Pick a starting point. Every format is fully editable.", "Three details give your product a clear direction.", "Review the essentials. You can change these later."][step]}</DialogDescription>
        <ol className="flow-steps" aria-label="Creation progress">{["Format", "Your idea", "Create"].map((label, index) => <li key={label} className={step === index ? "current" : step > index ? "complete" : ""} aria-current={step === index ? "step" : undefined}><span>{step > index ? <Check size={12} /> : index + 1}</span>{label}</li>)}</ol>
      </DialogHeader>
      <div className="flow-body" key={step}>
        {step === 0 ? <div className="format-options flow-formats">{formats.map((format, index) => {
          const Icon = [BookOpen, Zap, Layers3, TrendingUp, FileText, Package][index];
          return <button type="button" key={format} className={brief.format === format ? "chosen" : ""} aria-pressed={brief.format === format} onClick={() => update({ format })}><Icon size={22} /><span><strong>{format}</strong><small>{["Guides, ebooks & workbooks", "Focused lessons that teach a skill", "Templates, checklists & useful files", "A guided daily action plan", "A repeatable process or system", "Tools, code kits & custom resources"][index]}</small></span><span className="radio-dot">{brief.format === format && <span />}</span></button>;
        })}</div> : step === 1 ? <form id="fivegen-brief" className="form-stack" onSubmit={(event) => { event.preventDefault(); onStepChange(2); }}>
          <label>Product name<input autoFocus required minLength={3} maxLength={100} placeholder="The Freelancer’s First Client Playbook" value={brief.title} onChange={(event) => update({ title: event.target.value })} /></label>
          <label>What will people learn or achieve?<textarea required minLength={12} maxLength={12000} placeholder="Help new freelancers find, pitch, and win their first client. Include real examples and a simple action plan." value={brief.description} onChange={(event) => update({ description: event.target.value })} /></label>
          <label>Who is it for?<input required minLength={3} maxLength={300} placeholder="First-time freelancers" value={brief.audience} onChange={(event) => update({ audience: event.target.value })} /></label>
          <p className="flow-hint">Next: price, creative direction, and generation options.</p>
        </form> : <form id="fivegen-create" className="form-stack" onSubmit={(event) => { event.preventDefault(); onCreate(); }}>
          <div className="brief-summary"><div><span>{brief.format}</span><strong>{brief.title}</strong><p>For {brief.audience}</p></div><button className="text-link" type="button" onClick={() => onStepChange(1)}>Edit brief</button></div>
          <div className="flow-three"><label>Price · USD<input required type="number" min={0} max={9999} step="0.01" value={brief.price} onChange={(event) => update({ price: Number(event.target.value) })} /><small>Set 0 for a free product.</small></label><label>Language<input maxLength={50} required value={brief.language ?? "English"} onChange={(event) => update({ language: event.target.value })} /></label><label>Content depth<Select value={brief.quality || "premium"} onValueChange={(value) => update({ quality: value as "premium" | "balanced" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="premium">In depth</SelectItem><SelectItem value="balanced">Focused</SelectItem></SelectContent></Select></label></div>
          <Collapsible className="creative-options"><CollapsibleTrigger className="creative-options-trigger"><span>Creative direction <small>Optional</small></span><ChevronDown size={16} /></CollapsibleTrigger><CollapsibleContent><label><span className="sr-only">Creative direction and requirements</span><textarea maxLength={12000} placeholder="Tone, examples, deliverables, and anything that would make this exceptional…" value={brief.instructions || ""} onChange={(event) => update({ instructions: event.target.value })} /></label></CollapsibleContent></Collapsible>
          <div className={`creation-mode ${aiReady ? "ready" : ""}`}><Sparkles size={20} /><div><strong>{aiReady ? "Your AI is ready" : "Start with a draft, or connect AI"}</strong><p>{aiReady ? "Creates content, supporting files, and a launch kit. Add images and video in Marketing." : "Without an AI provider, you’ll get an editable starter to develop before selling."}</p>{!aiReady && <button type="button" className="text-link" onClick={onConnectAI}>Connect AI providers <ArrowUpRight size={14} /></button>}</div></div>
          {error && <p role="alert" className="error-banner">{error}</p>}
        </form>}
      </div>
      <footer className="flow-footer"><button type="button" className="button secondary" disabled={busy} onClick={() => step === 0 ? onOpenChange(false) : onStepChange(step - 1)}>{step > 0 && <ArrowLeft size={16} />}{step === 0 ? "Cancel" : "Back"}</button><span className="flow-footer-note">Step {step + 1} of 3</span>{step === 0 ? <button key="choose-format" type="button" className="button primary" onClick={() => onStepChange(1)}>Continue <ArrowRight size={16} /></button> : <button key={`step-submit-${step}`} type="submit" form={step === 1 ? "fivegen-brief" : "fivegen-create"} className="button primary" disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : step === 2 ? <Sparkles size={16} /> : null}{busy ? "Creating…" : step === 1 ? "Review & create" : !signedIn ? "Sign in & create" : aiReady ? "Generate product" : "Create editable draft"}{step === 1 && <ArrowRight size={16} />}</button>}</footer>
    </DialogContent>
  </Dialog>;
}

export function ProductPreview({ product, open, onOpenChange }: { product: Product; open: boolean; onOpenChange: (value: boolean) => void }) {
  const [tab, setTab] = useState("storefront");
  const billing = product.commerce?.billing || "once";
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flow-dialog preview-dialog" showCloseButton={false}>
    <DialogHeader className="flow-header"><div className="flow-kicker"><span>PRODUCT PREVIEW</span><button className="icon-button" aria-label="Close preview" onClick={() => onOpenChange(false)}><X size={19} /></button></div><DialogTitle>{product.title}</DialogTitle><DialogDescription>Preview your current edits before saving or publishing.</DialogDescription><Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="storefront">Storefront</TabsTrigger><TabsTrigger value="content">Product content</TabsTrigger></TabsList></Tabs></DialogHeader>
    <div className="flow-body preview-body">{tab === "storefront" ? <><Cover product={product} /><p className="preview-description">{product.description}</p><ul className="preview-benefits">{product.content.benefits.filter(Boolean).map((benefit, index) => <li key={index}><Check size={16} />{benefit}</li>)}</ul><div className="preview-price"><strong>{money(product.price * 100)}</strong><span>{billing === "month" ? "Per month · cancel anytime" : billing === "year" ? "Per year · cancel anytime" : product.price === 0 ? "Free download" : "One-time purchase"}</span></div><div className="preview-checkout-label">{product.price === 0 ? "Download product" : "Get instant access"}<span>Preview only</span></div><h3>What’s inside</h3><ol className="preview-section-list">{product.content.sections.map((item, index) => <li key={index}>{item.title}</li>)}</ol></> : <div className="reading-preview">{product.content.sections.map((item, index) => <section key={index}><span>SECTION {index + 1}</span><h3>{item.title}</h3><p>{item.body}</p></section>)}</div>}</div>
    <footer className="flow-footer"><span className="flow-footer-note">Only you can see this preview.</span><button className="button primary" onClick={() => onOpenChange(false)}>Back to editing <ArrowRight size={16} /></button></footer>
  </DialogContent></Dialog>;
}

export function PublishReview({ product, open, onOpenChange, busy, paymentsReady, onPayments, onPublish }: { product: Product; open: boolean; onOpenChange: (open: boolean) => void; busy: boolean; paymentsReady: boolean; onPayments: () => void; onPublish: () => void }) {
  const billing = product.commerce?.billing || "once";
  const canSell = product.price === 0 || paymentsReady || !!product.whopUrl;
  return <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}><DialogContent className="flow-dialog publish-review" showCloseButton={false}>
    <DialogHeader className="flow-header"><div className="flow-kicker"><span><Globe size={16} /> READY TO SHARE</span><button className="icon-button" aria-label="Close publishing review" disabled={busy} onClick={() => onOpenChange(false)}><X size={19} /></button></div><DialogTitle>{product.status === "published" ? "Update your product page" : "Review before publishing"}</DialogTitle><DialogDescription>We’ll save your edits and publish your product page.</DialogDescription></DialogHeader>
    <div className="flow-body"><div className="publish-summary"><Cover product={product} /><div><h3>{product.title}</h3><p>{product.format} · {product.content.sections.length} sections</p><strong>{product.price === 0 ? "Free product" : money(product.price * 100) + (billing === "month" ? " / month" : billing === "year" ? " / year" : "")}</strong></div></div><div className="publish-check"><Check size={18} /><div><strong>Content and storefront</strong><p>Review accuracy and add your own expertise before selling.</p></div></div><div className={`publish-check ${canSell ? "" : "needs-action"}`}><Package size={18} /><div><strong>{product.price === 0 ? "Free delivery is ready" : canSell ? "Checkout is connected" : "Connect checkout to accept payments"}</strong><p>{canSell ? product.whopUrl ? "Whop handles checkout and delivery through your link." : "Customers receive access after checkout." : "You can publish this page now, but customers cannot buy until you connect Stripe or add a Whop link."}</p>{!canSell && <button className="text-link" onClick={onPayments}>Set up payments <ArrowRight size={14} /></button>}</div></div><p className="publish-access-note">Who can open this link depends on your site’s sharing settings. Publishing a product does not make a private site public.</p></div>
    <footer className="flow-footer"><button className="button secondary" disabled={busy} onClick={() => onOpenChange(false)}>Keep editing</button><button className="button primary" disabled={busy} onClick={onPublish}>{busy ? <Loader2 size={16} className="spin" /> : <Globe size={16} />}{busy ? "Publishing…" : product.status === "published" ? "Update live page" : "Publish page"}</button></footer>
  </DialogContent></Dialog>;
}
