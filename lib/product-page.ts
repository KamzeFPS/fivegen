import { z } from 'zod';
import {leadFormSchema,type PagePurpose} from './public-pages';
import {applicationFormConfigSchema} from './service-applications';
import type {ProductStudioConfig} from './product-studio-contract';

export const productPageLinkSchema = z.object({
  label: z.string().trim().min(1).max(60),
  url: z.string().trim().max(2000).url().refine(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
    catch { return false; }
  }, 'Use a secure https:// link without a username or password.'),
}).strict();

export const pageTemplateIds = ['cinematic', 'essential', 'editorial', 'mentorship', 'community', 'classic'] as const;
export const landingSectionTypes = ['hero', 'benefits', 'curriculum', 'creator', 'reviews', 'faq', 'cta', 'text', 'image', 'video', 'lead-form', 'application'] as const;
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit color such as #FF804A.');
const optionalSecureUrl = z.string().trim().max(2000).refine(value => !value || (() => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } })(), 'Use a secure HTTPS URL.').default('');
export const landingSectionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  type: z.enum(landingSectionTypes), enabled: z.boolean().default(true),
  title: z.string().trim().max(300).default(''), body: z.string().trim().max(12000).default(''),
  items: z.array(z.string().trim().max(600)).max(12).default([]),
  faq: z.array(z.object({ question: z.string().trim().max(300), answer: z.string().trim().max(3000) }).strict()).max(15).default([]),
  imageUploadId: z.string().uuid().nullable().default(null),
  videoUploadId: z.string().uuid().nullable().default(null),
  leadForm: leadFormSchema.nullable().default(null), application: applicationFormConfigSchema.nullable().default(null),
  imageAlt: z.string().trim().max(300).default(''), videoUrl: optionalSecureUrl,
  layout: z.enum(['split', 'stacked', 'wide']).default('split'),
}).strict();
export type LandingSection = z.infer<typeof landingSectionSchema>;
export function defaultLandingSections(): LandingSection[] {
  return [
    { id: 'hero', type: 'hero', title: '' },
    { id: 'benefits', type: 'benefits', title: 'What you’ll learn' },
    { id: 'curriculum', type: 'curriculum', title: 'Course curriculum' },
    { id: 'creator', type: 'creator', title: 'Meet your creator' },
    { id: 'reviews', type: 'reviews', title: 'From our customers' },
    { id: 'faq', type: 'faq', title: 'A few useful answers' },
    { id: 'cta', type: 'cta', title: 'Take your next step.' },
  ].map(section => landingSectionSchema.parse(section));
}
export const pageBrandSchema = z.object({
  accentHex: hexColor.default('#FF804A'), backgroundHex: hexColor.default('#111214'),
  theme: z.enum(['dark', 'light']).default('dark'), font: z.enum(['inter', 'editorial', 'system']).default('inter'),
  corner: z.enum(['soft', 'square', 'round']).default('soft'), width: z.enum(['standard', 'wide']).default('standard'),
  spacing: z.enum(['compact', 'comfortable', 'airy']).default('comfortable'),
}).strict();

export const productPageConfigSchema = z.object({
  about: z.string().trim().max(12000).default(''),
  creatorName: z.string().trim().max(100).default(''),
  showCreator: z.boolean().default(false),
  location: z.string().trim().max(120).default(''),
  showLocation: z.boolean().default(false),
  links: z.array(productPageLinkSchema).max(8).default([]),
  iconUploadId: z.string().uuid().nullable().default(null),
  bannerUploadId: z.string().uuid().nullable().default(null),
  welcomeMessage: z.string().trim().max(2000).default(''),
  showContent: z.boolean().default(true),
  showReviews: z.boolean().default(true),
  accent: z.enum(['orange', 'violet', 'blue', 'green', 'pink']).default('orange'),
  templateId: z.enum(pageTemplateIds).default('classic'),
  headline: z.string().trim().max(300).default(''), eyebrow: z.string().trim().max(120).default(''),
  heroDescription: z.string().trim().max(3000).default(''), buttonLabel: z.string().trim().max(100).default(''),
  ctaMode: z.enum(['checkout', 'link', 'form']).default('checkout'), ctaUrl: optionalSecureUrl,
  heroAsset: z.enum(['eclipse', 'dunes', 'blue', 'chrome', 'none']).default('eclipse'),
  heroAlign: z.enum(['left', 'center']).default('left'),
  announcement: z.string().trim().max(240).default(''),
  seoTitle: z.string().trim().max(100).default(''), seoDescription: z.string().trim().max(300).default(''),
  brand: pageBrandSchema.default({}),
  sections: z.array(landingSectionSchema).min(1).max(20).default(defaultLandingSections).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Page section IDs must be unique.'),
}).strict();

export type ProductPageConfig = z.infer<typeof productPageConfigSchema>;
export function defaultProductPageConfig(format=''): ProductPageConfig {
 const config=productPageConfigSchema.parse({templateId:'cinematic'}),course=/course/i.test(format),service=/coaching|consulting|mentorship/i.test(format);
 if(format&&!course){config.sections=config.sections.map(section=>({...section,title:section.type==='curriculum'?(service?'How we’ll work together':/book|guide|playbook/i.test(format)?'Inside this resource':'What’s included'):section.type==='benefits'?(service?'What we’ll work on':'What you’ll take away'):section.title}));}
 config.buttonLabel=service?'Book a session':course?'Join the course':format?'Get access':'';
 return config;
}
export type ProductReview = { id: string; displayName: string; rating: number; body: string; createdAt: number };
export type ProductReviewSummary = { count: number; average: number | null; reviews: ProductReview[] };
export type PublicProductSummary = {
  id: string; slug: string; title: string; description: string; format: string;
  sections: { title: string; category?: string }[];
  priceCents?: number; currency?: string; benefits?: string[];
};
export type LandingCommerce = { amount: number; currency: string; enabled: boolean; paidReady?:boolean; path: string | null; mode?: 'test' | 'live'; model?: string; interval?: string; publicationVersion?: number; checkout?: {slug:string; pricing?:ProductStudioConfig['pricing']; tiers?:{id:string;name:string;description:string;billing:'free'|'month'|'year';priceCents:number}[]; physical?:boolean}; };
export type ProductPageState = {
  id?:string;purpose?:PagePurpose;name?:string;
  draft: ProductPageConfig; published: ProductPageConfig | null; publishedAt: number | null;
  updatedAt: number; publicPath: string; reviewSummary: ProductReviewSummary;
  commerce?: LandingCommerce;
};
export type PublicProductPage = {
  pageId?:string;pagePurpose?:PagePurpose;
  product: PublicProductSummary; config: ProductPageConfig; publishedAt: number;
  publicPath: string; funnelPath: string | null; reviewSummary: ProductReviewSummary;
  commerce?: LandingCommerce;
};

export type PageBrandPreset = { id: string; name: string; brand: z.infer<typeof pageBrandSchema>; sourceProductId:string|null;iconUploadId:string|null;links:z.infer<typeof productPageLinkSchema>[];updatedAt: number };
export const pageBrandPresetSchema = z.object({ name: z.string().trim().min(1).max(60), brand: pageBrandSchema, sourceProductId:z.string().uuid().nullable().default(null),iconUploadId:z.string().uuid().nullable().default(null),links:z.array(productPageLinkSchema).max(8).default([]) }).strict();
export const pageTemplates = [
  { id: 'cinematic', name: 'Cinematic', description: 'An immersive hero and a clear course offer.', image: '/templates/eclipse.webp', theme: 'dark', accent: '#FF804A', for: 'Courses & digital products' },
  { id: 'essential', name: 'Essential', description: 'Calm typography with the offer in focus.', image: '/studio/chrome.webp', theme: 'light', accent: '#B5522D', for: 'Guides & resources' },
  { id: 'editorial', name: 'Editorial', description: 'A considered story with room for your expertise.', image: '/studio/blue.webp', theme: 'dark', accent: '#8CB5FF', for: 'Creators & educators' },
  { id: 'mentorship', name: 'Personal', description: 'Introduce your approach and invite a conversation.', image: '/studio/dunes.webp', theme: 'light', accent: '#95734B', for: 'Coaching & consulting' },
  { id: 'community', name: 'Community', description: 'Your familiar profile, content and reviews.', image: '/studio/blue.webp', theme: 'dark', accent: '#FF804A', for: 'Member spaces' },
] as const;
export function applyPageTemplate(config: ProductPageConfig, id: ProductPageConfig['templateId']): ProductPageConfig {
  const template = pageTemplates.find(item => item.id === id);
  if (!template) return productPageConfigSchema.parse({...config, templateId:id});
  return productPageConfigSchema.parse({ ...config, templateId: id, heroAsset: id === 'editorial' ? 'blue' : id === 'essential' ? 'chrome' : id === 'mentorship' ? 'dunes' : 'eclipse', brand: { ...config.brand, accentHex: template.accent, theme: template.theme, backgroundHex: template.theme === 'light' ? '#FAF8F3' : '#111214', font: id === 'editorial' || id === 'mentorship' ? 'editorial' : 'inter' } });
}

const noEmail = (value: string) => !/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/i.test(value);
export const productReviewSchema = z.object({
  orderId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(80).refine(value => !value.includes('@'), 'Use a public name without an email address.'),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(20).max(3000).refine(noEmail, 'Remove email addresses from your public review.'),
}).strict();

export const productPageSaveSchema = z.object({
  config: productPageConfigSchema,
  expectedUpdatedAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
}).strict();
export const productPageRevisionSchema = z.object({
  expectedUpdatedAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
}).strict();
