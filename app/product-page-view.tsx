"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, BookOpen, Check, FileText, ImagePlus, Link2, Loader2, LockKeyhole, MapPin, MessageSquare, Play, Star, UserRound } from "lucide-react";
import type { Product } from "@/lib/product";
import { productReviewSchema, type ProductPageConfig, type ProductReviewSummary, type LandingCommerce } from "@/lib/product-page";
import { SalesLandingPage } from './sales-landing-page';
import './sales-page-studio.css';

type PageProduct = {
  id: string;
  slug: string;
  title: string;
  description: string;
  format: string;
  sections: { title: string; category?: string }[];
};
export type ProductPageViewProps = {
  pageId?:string;pageVersion?:number;
  product: PageProduct;
  config: ProductPageConfig;
  reviewSummary: ProductReviewSummary;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  funnelPath?: string | null;
  memberContent?: Product["content"];
  memberOrderId?: string;
  preview?: boolean;
  selectedSection?:string;
  onSelectSection?:(id:string)=>void;
  initialTab?: "home" | "content" | "reviews";
  reviewOrderId?: string;
  onCustomize?: () => void;
  commerce?: LandingCommerce;
  canonicalOrigin?:string;
};

export function productInitials(title: string) {
  return title.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join("").toUpperCase() || "FG";
}

export function ProductPageView(props: ProductPageViewProps) {
  if ((props.config.templateId !== 'classic'||props.config.sections.some(s=>s.enabled&&(['lead-form','application'].includes(s.type)||s.videoUploadId))) && !props.memberContent && !props.reviewOrderId) return <SalesLandingPage {...props}/>;
  return <ProductPageContent key={props.product.id} {...props}/>;
}

function ProductPageContent({ product, config, reviewSummary: initialReviews, iconUrl, bannerUrl, funnelPath, memberContent, memberOrderId, preview, initialTab = "home", reviewOrderId, onCustomize,canonicalOrigin='' }: ProductPageViewProps) {
  const [tab, setTab] = useState<"home" | "content" | "reviews">(reviewOrderId && !memberOrderId ? "reviews" : initialTab);
  const [reviewSummary, setReviewSummary] = useState(initialReviews);
  const [rating, setRating] = useState(0);
  const [lessonIndex, setLessonIndex] = useState(0);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  useEffect(() => { setReviewSummary(initialReviews); }, [initialReviews]);
  useEffect(() => { if (reviewOrderId && !memberOrderId) setTab("reviews"); }, [reviewOrderId, memberOrderId]);
  const activeTab = (tab === "content" && !config.showContent) || (tab === "reviews" && !config.showReviews) ? "home" : tab;
  const currentLesson = memberContent?.sections[lessonIndex];
  const reviews = rating ? reviewSummary.reviews.filter(review => review.rating === rating) : reviewSummary.reviews;
  const hasReviews = reviewSummary.count > 0 && reviewSummary.average !== null;

  return <article className={`product-page-view product-page-accent-${config.accent}`}>
    <div className={`product-page-banner ${bannerUrl ? "has-image" : ""}`}>
      {bannerUrl && <img src={bannerUrl} alt=""/>}
      {preview && !memberContent && onCustomize && <button type="button" className="product-page-cover-edit" onClick={onCustomize}><ImagePlus size={16}/>{bannerUrl ? "Edit cover" : "Add cover image"}</button>}
    </div>
    <header className="product-page-identity">
      <div className="product-page-icon" aria-hidden="true">{iconUrl ? <img src={iconUrl} alt=""/> : <span>{productInitials(product.title)}</span>}</div>
      <div className="product-page-heading-line"><div><span className="product-page-format">{product.format}</span><h1>{product.title}</h1></div>
        {!preview && !memberOrderId && funnelPath && <a className="product-page-offer-link" href={funnelPath}>View offer <ArrowUpRight size={16}/></a>}
      </div>
      <p className="product-page-description">{product.description}</p>
      <div className="product-page-metadata">
        {config.showLocation && config.location.trim() && <span><MapPin size={15}/>{config.location}</span>}
        {config.showCreator && config.creatorName.trim() && <span><UserRound size={15}/>Created by <strong>{config.creatorName}</strong></span>}
        {hasReviews && config.showReviews && <button type="button" onClick={() => setTab("reviews")}><Star size={15}/>{reviewSummary.average!.toFixed(1)} <span>({reviewSummary.count} {reviewSummary.count === 1 ? "review" : "reviews"})</span></button>}
      </div>
      {config.links.length > 0 && <nav className="product-page-social-links" aria-label="Creator links">{config.links.filter(link => { try { const url = new URL(link.url); return url.protocol === "https:" && !url.username && !url.password && !!link.label.trim(); } catch { return false; } }).map((link, index) => <a href={link.url} key={`${link.url}-${index}`} target="_blank" rel="noopener noreferrer"><Link2 size={14}/>{link.label}<ArrowUpRight size={12}/></a>)}</nav>}
    </header>
    <div className="product-page-tabs" role="tablist" aria-label="Product page" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus(); buttons[next]?.click();
    }}>
      <button id={`page-home-${product.id}`} type="button" role="tab" tabIndex={activeTab === "home" ? 0 : -1} aria-selected={activeTab === "home"} aria-controls={`page-panel-${product.id}`} onClick={() => setTab("home")}>Home</button>
      {config.showContent && <button id={`page-content-${product.id}`} type="button" role="tab" tabIndex={activeTab === "content" ? 0 : -1} aria-selected={activeTab === "content"} aria-controls={`page-panel-${product.id}`} onClick={() => setTab("content")}>Content <span>{product.sections.length}</span></button>}
      {config.showReviews && <button id={`page-reviews-${product.id}`} type="button" role="tab" tabIndex={activeTab === "reviews" ? 0 : -1} aria-selected={activeTab === "reviews"} aria-controls={`page-panel-${product.id}`} onClick={() => setTab("reviews")}>Reviews{reviewSummary.count > 0 && <span>{reviewSummary.count}</span>}</button>}
    </div>
    <section className="product-page-panel" id={`page-panel-${product.id}`} role="tabpanel" aria-labelledby={`page-${activeTab}-${product.id}`}>
      {activeTab === "home" && <div className="product-page-home">
        {config.welcomeMessage.trim() && <section className="product-page-welcome"><span className="product-page-section-label">WELCOME</span><p>{config.welcomeMessage}</p></section>}
        <section className="product-page-about"><h2>About this product</h2><div className="product-page-prose">{config.about.trim() || product.description}</div></section>
        {config.showContent && product.sections.length > 0 && <button type="button" className="product-page-content-card" onClick={() => setTab("content")}><span className="product-page-content-symbol"><BookOpen size={22}/></span><span><strong>Explore the content</strong><small>{product.sections.length} {product.sections.length === 1 ? "lesson or section" : "lessons and sections"}</small></span><ArrowUpRight size={19}/></button>}
      </div>}
      {activeTab === "content" && <div className="product-page-curriculum">
        <div className="product-page-section-heading"><div><h2>{memberContent ? "Your content" : "What’s inside"}</h2><p>{memberOrderId ? "Your purchased content." : memberContent ? "Explore this preview of your member experience." : "Browse the outline. Full lessons and resources are available to customers."}</p></div><BookOpen size={21}/></div>
        {product.sections.length === 0 ? <div className="product-page-empty"><BookOpen size={28}/><h3>Content is being prepared</h3><p>The creator hasn’t added an outline yet.</p></div> : <div className={`product-page-lesson-layout ${memberContent ? "has-reader" : ""}`}><ol className="product-page-lessons">{product.sections.map((section, index) => <li key={`${section.title}-${index}`}>{memberContent ? <button type="button" className={lessonIndex === index ? "selected" : ""} aria-pressed={lessonIndex === index} onClick={() => setLessonIndex(index)}><span className="product-page-lesson-number">{String(index + 1).padStart(2, "0")}</span><span>{section.category && <small>{section.category}</small>}<strong>{section.title}</strong></span><Play size={15}/></button> : <div><span className="product-page-lesson-number">{String(index + 1).padStart(2, "0")}</span><span>{section.category && <small>{section.category}</small>}<strong>{section.title}</strong></span><LockKeyhole size={15}/></div>}</li>)}</ol>
          {memberContent && currentLesson && <article className="product-page-lesson-reader"><span className="product-page-section-label">{memberOrderId ? "SECTION" : "MEMBER PREVIEW · SECTION"} {lessonIndex + 1}</span><h3>{currentLesson.title}</h3>{currentLesson.objective && <p className="product-page-lesson-objective">{currentLesson.objective}</p>}{currentLesson.videoId && <video controls playsInline preload="metadata" src={memberOrderId ? `/api/commerce/customer/${memberOrderId}/video/${currentLesson.videoId}` : `/api/uploads/${currentLesson.videoId}`} aria-label={currentLesson.title}/>}<div className="product-page-prose">{currentLesson.body || (!currentLesson.videoId ? memberOrderId ? "This section has no written content yet." : "This section doesn’t have content yet. Add your lesson in the content editor." : "")}</div>{!!memberContent.files?.length && !memberOrderId && <p className="product-page-preview-note"><FileText size={15}/>{memberContent.files.length} supporting {memberContent.files.length === 1 ? "file is" : "files are"} included. Downloads are available through the customer portal after purchase.</p>}</article>}
        </div>}
        {!preview && !memberOrderId && <a className="product-page-customer-link" href={canonicalOrigin+'/customer'}>Already a customer? Open your products <ArrowUpRight size={14}/></a>}
      </div>}
      {activeTab === "reviews" && <div className="product-page-reviews">
        {!preview && reviewOrderId && <ProductReviewForm slug={product.slug} orderId={reviewOrderId} onSubmitted={setReviewSummary}/>}
        {reviewSummary.count > reviewSummary.reviews.length && <p className="product-page-review-limit">Showing the latest {reviewSummary.reviews.length} reviews. Rating filters apply to these reviews.</p>}
        {hasReviews ? <><div className="product-page-review-score"><span>Customer reviews</span><strong>{reviewSummary.average!.toFixed(2)} <Star size={34} fill="currentColor"/></strong><p>{reviewSummary.count} {reviewSummary.count === 1 ? "review" : "reviews"} from verified customers</p></div><div className="product-page-rating-filters" aria-label="Filter reviews">{[0, 5, 4, 3, 2, 1].map(value => <button type="button" key={value} aria-pressed={rating === value} onClick={() => setRating(value)}>{value === 0 ? "All reviews" : <><Star size={13}/>{value} {value === 1 ? "star" : "stars"}</>}</button>)}</div><div className="product-page-review-list">{reviews.map(review => <article key={review.id} className="product-page-review"><header><span className="product-page-review-avatar">{productInitials(review.displayName)}</span><div><strong>{review.displayName}</strong><span className="product-page-review-stars" aria-label={`${review.rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, index) => <Star aria-hidden="true" size={14} key={index} fill={index < review.rating ? "currentColor" : "none"}/>)}</span></div><time dateTime={new Date(review.createdAt).toISOString()}>{new Date(review.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</time></header><p>{review.body}</p></article>)}{!reviews.length && <div className="product-page-empty"><MessageSquare size={25}/><h3>{reviewSummary.count > reviewSummary.reviews.length ? `No ${rating}-star reviews in this list` : `No ${rating}-star reviews yet`}</h3><button type="button" onClick={() => setRating(0)}>Show all reviews</button></div>}</div></> : <div className="product-page-empty"><MessageSquare size={30}/><h2>No reviews yet</h2><p>Feedback from customers will appear here. There are no ratings to show yet.</p>{!preview && !reviewOrderId && <a className="product-page-customer-link" href={canonicalOrigin+'/customer'}>Review a purchase in your customer portal <ArrowUpRight size={14}/></a>}</div>}
      </div>}
    </section>
    {!preview && <footer className="product-page-footer"><a href={canonicalOrigin||'/'} aria-label="FiveGen home"><img src="/brand/fivegen-sparkle-dark.webp" alt="FiveGen"/></a><span>Built around real expertise.</span><a href={canonicalOrigin+'/customer'}>Customer portal <ArrowUpRight size={13}/></a></footer>}
  </article>;
}

function ProductReviewForm({ slug, orderId, onSubmitted }: { slug: string; orderId: string; onSubmitted: (summary: ProductReviewSummary) => void }) {
  const [displayName, setDisplayName] = useState(""), [rating, setRating] = useState(5), [body, setBody] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [submitted, setSubmitted] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const validation = productReviewSchema.safeParse({ orderId, displayName, rating, body });
    if (!validation.success) { setError(validation.error.issues[0]?.message || "Check your review and try again."); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/product-pages/${encodeURIComponent(slug)}/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validation.data) });
      const result = await response.json() as { reviewSummary: ProductReviewSummary; error?: string };
      if (!response.ok) throw new Error(result.error || "Your review could not be saved. Please try again.");
      onSubmitted(result.reviewSummary); setSubmitted(true);
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  if (submitted) return <p className="product-page-notice" role="status"><Check size={15}/>Your review has been published. Thank you for sharing your experience.</p>;
  return <form className="product-page-review-form" onSubmit={event => void submit(event)}><h2>Review your purchase</h2><p>Tell others about your experience. FiveGen checks your paid purchase before accepting a review. Your public name and review will be visible; keep contact details private.</p>{error && <p className="product-page-error" role="alert">{error}</p>}<fieldset disabled={busy}><label>Public name<input required maxLength={80} value={displayName} onChange={event => setDisplayName(event.target.value)} autoComplete="nickname"/></label><label>Your rating<select value={rating} onChange={event => setRating(Number(event.target.value))}>{[5, 4, 3, 2, 1].map(value => <option value={value} key={value}>{value} {value === 1 ? "star" : "stars"}</option>)}</select></label><label>Your experience<textarea required minLength={20} maxLength={3000} rows={4} value={body} onChange={event => setBody(event.target.value)} placeholder="What was useful, and what could be better?"/></label><button type="submit" disabled={busy}>{busy ? <><Loader2 className="spin" size={14}/>Publishing…</> : "Publish review"}</button></fieldset></form>;
}
