import { z } from 'zod';

export const productPageLinkSchema = z.object({
  label: z.string().trim().min(1).max(60),
  url: z.string().trim().max(2000).url().refine(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
    catch { return false; }
  }, 'Use a secure https:// link without a username or password.'),
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
}).strict();

export type ProductPageConfig = z.infer<typeof productPageConfigSchema>;
export function defaultProductPageConfig(): ProductPageConfig { return productPageConfigSchema.parse({}); }
export type ProductReview = { id: string; displayName: string; rating: number; body: string; createdAt: number };
export type ProductReviewSummary = { count: number; average: number | null; reviews: ProductReview[] };
export type PublicProductSummary = {
  id: string; slug: string; title: string; description: string; format: string;
  sections: { title: string; category?: string }[];
};
export type ProductPageState = {
  draft: ProductPageConfig; published: ProductPageConfig | null; publishedAt: number | null;
  updatedAt: number; publicPath: string; reviewSummary: ProductReviewSummary;
};
export type PublicProductPage = {
  product: PublicProductSummary; config: ProductPageConfig; publishedAt: number;
  publicPath: string; funnelPath: string | null; reviewSummary: ProductReviewSummary;
};

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
