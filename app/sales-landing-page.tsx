"use client";

import {useState,type CSSProperties} from 'react';
import Link from 'next/link';
import {Dialog as Modal} from 'radix-ui';
import {PublicPageLeadForm} from './public-page-lead-form';
import {PublicApplicationForm} from './public-application-form';
import {CommerceCheckout} from './commerce-checkout';
import {offerView,offerMoney} from '@/lib/offer-view';
import {landingThemeTokens} from '@/lib/page-theme';
import {trackProductJourney} from './product-journey-tracker';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, LockKeyhole, MapPin, Star, UserRound, X } from 'lucide-react';
import type { LandingCommerce, LandingSection, ProductPageConfig, ProductReviewSummary, PublicProductSummary } from '@/lib/product-page';

export type SalesLandingProps = {
  product: PublicProductSummary; config: ProductPageConfig; reviewSummary: ProductReviewSummary;
  pageId?:string;pageVersion?:number;commerce?: LandingCommerce; iconUrl?: string | null; bannerUrl?: string | null;
  preview?: boolean; selectedSection?: string; onSelectSection?: (id: string) => void;
};
export const templateArtwork = { eclipse: '/templates/eclipse.webp', dunes: '/studio/dunes.webp', blue: '/studio/blue.webp', chrome: '/studio/chrome.webp', none: '' };
export const money=offerMoney;


export function SalesLandingPage({product, config, reviewSummary, commerce, iconUrl, bannerUrl, pageId=product.id,pageVersion=0,preview, selectedSection, onSelectSection}: SalesLandingProps) {
  const {brand} = config;
  const [checkoutOpen,setCheckoutOpen]=useState(false);
  const image = bannerUrl || templateArtwork[config.heroAsset];
  const style = landingThemeTokens(brand) as CSSProperties;
  const sections = config.sections.filter(section=>section.enabled && (section.type!=='curriculum'||config.showContent) && (section.type!=='reviews'||config.showReviews));
  const formSection=sections.find(s=>s.type==='lead-form'&&s.leadForm||s.type==='application'&&s.application?.enabled);
  const form=config.ctaMode==='form'&&!!formSection;
  const external = config.ctaMode === 'link' && !!config.ctaUrl;
  const available = form || external || !!commerce?.enabled && !!commerce.path || !!preview && commerce?.source==='draft';
  const destination = form ? '#landing-'+formSection!.id : external ? config.ctaUrl : commerce?.path;
  const label = available ? config.buttonLabel || (form?'Take the next step':external ? 'Learn more' : commerce?.amount === 0 ? 'Get access' : /course/i.test(product.format)?'Join the course':/coaching|consulting|mentorship/i.test(product.format)?'Book a session':'Get access') : 'Sales currently paused';
  const offer=commerce?.offer||offerView({amount:commerce?.amount??product.priceCents,currency:commerce?.currency??product.currency,pricing:commerce?.checkout?.pricing||{model:commerce?.model as 'free'|'one-time'|'subscription'|'pwyw',interval:commerce?.interval as 'month'|'year'},tiers:commerce?.checkout?.tiers});
  const {amount,currency}=offer;
  const initials = product.title.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  function action(className = '') {
    if (preview) return <button type="button" className={`landing-action ${className}`} onClick={()=>onSelectSection?.('hero')} aria-label={`${label} — visual preview only`}>{label}<ArrowRight size={16}/></button>;
    if(available && commerce?.checkout && !external&&!form) return <button type="button" className={`landing-action ${className}`} onClick={()=>{if(pageId===product.id)trackProductJourney(product.slug,'cta');setCheckoutOpen(true);}}>{label}<ArrowRight size={16}/></button>;
    return available && destination ? <a className={`landing-action ${className}`} href={destination} onClick={()=>{if(pageId===product.id)trackProductJourney(product.slug,'cta');}} {...(external?{rel:'noopener noreferrer',target:'_blank'}:{})}>{label}<ArrowRight size={16}/></a> : <span className={`landing-action unavailable ${className}`} aria-disabled="true">{label}</span>;
  }
  function sectionImage(section: LandingSection) { return section.imageUploadId ? preview ? `/api/uploads/${section.imageUploadId}` : `/api/public-pages/${pageId}/media/section-${section.id}` : null; }
  function content(section: LandingSection) {
    const customImage = sectionImage(section);
    if (section.type === 'hero') return <div className={`landing-hero landing-hero-${config.heroAlign} ${image?'with-art':''} ${form?'is-form':''}`}>
      {image&&<img className="landing-hero-art" src={image} alt=""/>}
      <div className="landing-hero-scrim"/>
      <div className="landing-hero-copy"><span className="landing-eyebrow">{config.eyebrow || product.format}</span><h1>{section.title || config.headline || product.title}</h1><p>{section.body || config.heroDescription || product.description}</p>
        {config.showCreator&&config.creatorName&&<div className="landing-creator-byline">{iconUrl?<img src={iconUrl} alt=""/>:<UserRound size={18}/>}<span>Created by <strong>{config.creatorName}</strong></span></div>}
        <div className="landing-hero-inline-action">{action()}</div>
      </div>
      {!form&&<aside className="landing-offer" aria-label="Product offer"><span>{product.title}</span><strong>{offer.priceSet&&offer.tiered&&<small>Plans from </small>}{offer.priceSet&&!offer.tiered&&offer.model==='pwyw'?money(amount,currency):offer.amountText}{offer.priceSet&&!offer.tiered&&offer.interval&&<small> / {offer.interval}</small>}{offer.priceSet&&!offer.tiered&&offer.model==='pwyw'&&<small> suggested</small>}{offer.priceSet&&amount>0&&<small>{currency.toUpperCase()}</small>}</strong><p>{offer.terms}</p>{commerce?.source==='draft'&&<span className="landing-test-label">Saved draft offer · visual preview</span>}{commerce?.mode==='test'&&<span className="landing-test-label">Test checkout · no real payment</span>}{action()}<div className="landing-offer-note"><LockKeyhole size={14}/><span>{available ? external ? 'Continue on the creator’s website.' : 'Review your purchase and access at checkout.' : 'The public page is available. New purchases are paused.'}</span></div>{commerce?.includedProducts?.length? <div><strong>Included in this offer</strong><ul>{commerce.includedProducts.map(item=><li key={item.id}>{item.title}</li>)}</ul><p>One checkout total. Included access follows this offer’s payment and cancellation terms.</p></div>:null}{commerce?.availabilityMessage&&<p>{commerce.availabilityMessage}</p>}{config.welcomeMessage&&<p className="landing-offer-welcome">{config.welcomeMessage}</p>}</aside>}
    </div>;
    if (section.type === 'benefits') {
      const items = section.items.length ? section.items : product.benefits || [];
      if (!items.length && !section.body && !customImage) return null;
      return <div className={`landing-section-inner landing-layout-${section.layout}`}><div><span className="landing-eyebrow">MADE FOR YOUR NEXT CHAPTER</span><h2>{section.title || 'What you’ll learn'}</h2>{section.body&&<p>{section.body}</p>}<ul className="landing-benefits">{items.map((item,index)=><li key={index}><Check size={18}/><span>{item}</span></li>)}</ul></div>{customImage&&<img className="landing-section-image" src={customImage} alt={section.imageAlt}/>}</div>;
    }
    if (section.type === 'curriculum') return product.sections.length ? <div className="landing-section-inner"><span className="landing-eyebrow">WHAT’S INSIDE</span><h2>{section.title || 'Your curriculum'}</h2>{section.body&&<p>{section.body}</p>}<div className="landing-curriculum">{product.sections.map((item,index)=><details key={index}><summary><span>{String(index+1).padStart(2,'0')}</span><strong>{item.title}</strong><ChevronDown size={17}/></summary><p>{item.category || 'Included in this product.'} Full lessons and resources stay in your private customer library.</p></details>)}</div></div> : null;
    if (section.type === 'creator') return config.showCreator && config.creatorName ? <div className={`landing-section-inner landing-layout-${section.layout}`}><div><span className="landing-eyebrow">THE PERSON BEHIND THE PRODUCT</span><h2>{section.title || config.creatorName}</h2><h3>{config.creatorName}</h3><p>{section.body || config.about}</p>{config.showLocation&&config.location&&<span className="landing-location"><MapPin size={15}/>{config.location}</span>}{config.links.length>0&&<nav className="landing-social" aria-label="Creator links">{config.links.map((link,index)=><a href={link.url} target="_blank" rel="noopener noreferrer" key={index}>{link.label}<ArrowUpRight size={14}/></a>)}</nav>}</div>{customImage&&<img className="landing-section-image" src={customImage} alt={section.imageAlt}/>}</div> : null;
    if (section.type === 'reviews') return reviewSummary.count ? <div className="landing-section-inner"><span className="landing-eyebrow">VERIFIED CUSTOMER FEEDBACK</span><h2>{section.title || 'From our customers'}</h2><p className="landing-rating"><Star size={19}/>{reviewSummary.average?.toFixed(1)} · {reviewSummary.count} verified {reviewSummary.count===1?'review':'reviews'}</p><div className="landing-reviews">{reviewSummary.reviews.slice(0,6).map(review=><blockquote key={review.id}><p>“{review.body}”</p><footer>{review.displayName} · {review.rating}/5</footer></blockquote>)}</div></div> : preview ? <div className="landing-section-inner landing-empty-section"><h2>{section.title}</h2><p>Verified customer reviews will appear here. No ratings are invented.</p></div> : null;
    if (section.type === 'faq') return section.faq.length ? <div className="landing-section-inner"><h2>{section.title || 'A few useful answers'}</h2><div className="landing-faq">{section.faq.filter(item=>item.question&&item.answer).map((item,index)=><details key={index}><summary>{item.question}<ChevronDown size={17}/></summary><p>{item.answer}</p></details>)}</div></div> : null;
    if (section.type === 'cta') return <div className="landing-section-inner landing-final-cta"><span className="landing-eyebrow">YOUR NEXT CHAPTER</span><h2>{section.title || 'Take your next step.'}</h2>{section.body&&<p>{section.body}</p>}{action()}</div>;
    if(section.type==='lead-form')return section.leadForm?<div className="landing-section-inner"><h2>{section.title}</h2>{section.body&&<p>{section.body}</p>}<PublicPageLeadForm pageId={pageId} version={pageVersion} sectionId={section.id} config={section.leadForm} preview={preview}/></div>:null;
    if(section.type==='application')return section.application?.enabled?<div className="landing-section-inner"><h2>{section.title}</h2>{section.body&&<p>{section.body}</p>}<PublicApplicationForm pageId={pageId} version={pageVersion} sectionId={section.id} config={section.application} preview={preview}/></div>:null;
    if (section.type === 'video') return section.videoUploadId||section.videoUrl ? <div className="landing-section-inner"><h2>{section.title}</h2>{section.body&&<p>{section.body}</p>}<video controls preload="metadata" playsInline src={section.videoUploadId?(preview?`/api/uploads/${section.videoUploadId}`:`/api/public-pages/${pageId}/media/video-${section.id}`):section.videoUrl} aria-label={section.title||'Product introduction'}/></div> : null;
    if (section.type === 'image') return customImage ? <figure className="landing-section-inner"><img className="landing-full-image" src={customImage} alt={section.imageAlt}/>{section.title&&<figcaption>{section.title}</figcaption>}</figure> : null;
    return section.title || section.body ? <div className={`landing-section-inner landing-layout-${section.layout}`}><div><h2>{section.title}</h2><p>{section.body}</p>{section.items.length>0&&<ul className="landing-benefits">{section.items.map((item,index)=><li key={index}><Check size={17}/><span>{item}</span></li>)}</ul>}</div>{customImage&&<img className="landing-section-image" src={customImage} alt={section.imageAlt}/>}</div> : null;
  }
  const renderedSections=sections.map(section=>({section,node:content(section)})).filter(item=>item.node!==null);
  return <><article className={`sales-landing template-${config.templateId} landing-theme-${brand.theme} landing-font-${brand.font} landing-corner-${brand.corner} landing-width-${brand.width} landing-space-${brand.spacing}`} style={style}>
    {config.announcement&&<div className="landing-announcement">{config.announcement}</div>}
    <header className="landing-header"><a href={preview?'#':pageId===product.id?`/product/${encodeURIComponent(product.slug)}`:`/pages/${pageId}`} className="landing-wordmark" onClick={preview?event=>{event.preventDefault();onSelectSection?.('hero');}:undefined}>{iconUrl?<img src={iconUrl} alt=""/>:<span>{initials}</span>}<strong>{product.title}</strong></a><nav aria-label="Sales page sections">{renderedSections.map(item=>item.section).filter(section=>['curriculum','creator','faq'].includes(section.type)).map(section=><a href={`#landing-${section.id}`} key={section.id}>{section.type==='creator'?'About':section.type==='faq'?'FAQ':'Curriculum'}</a>)}</nav>{action('landing-header-action')}</header>
    {renderedSections.map(({section,node})=><section id={`landing-${section.id}`} data-section={section.id} className={`landing-section landing-section-${section.type} ${preview&&selectedSection===section.id?'is-selected':''}`} key={section.id} onClick={preview?()=>onSelectSection?.(section.id):undefined}>{node}</section>)}
    <footer className="landing-footer"><span>{config.showCreator&&config.creatorName?config.creatorName:product.title}</span>{!preview&&<a href="/customer">My purchases <ArrowRight size={13}/></a>}<Link href="/" className="landing-powered"><img src="/brand/fivegen-sparkle-mark.png" alt="FiveGen"/><span>Made with FiveGen</span></Link></footer>
  </article>{!preview&&commerce?.enabled&&commerce.checkout&&<Modal.Root open={checkoutOpen} onOpenChange={setCheckoutOpen}><Modal.Portal><Modal.Overlay className="sales-dialog-overlay"/><Modal.Content className="landing-checkout-dialog"><header><div><Modal.Title>Complete your order</Modal.Title><Modal.Description>Confirm your product and access details before secure checkout.</Modal.Description></div><Modal.Close className="sales-icon-button" aria-label="Close checkout"><X size={19}/></Modal.Close></header><CommerceCheckout slug={commerce.checkout.slug} amount={commerce.amount} currency={commerce.currency} mode={commerce.mode||'test'} publicationVersion={commerce.publicationVersion} pricing={commerce.checkout.pricing} tiers={commerce.checkout.tiers} physical={commerce.checkout.physical} paidReady={commerce.paidReady} summary={{title:product.title,creatorName:config.showCreator?config.creatorName:undefined,includes:[...(product.benefits||[]),...(commerce.includedProducts||[]).map(item=>'Included: '+item.title)]}}/></Modal.Content></Modal.Portal></Modal.Root>}</>;
}
