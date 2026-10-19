import { z } from 'zod';
export const offerVariantSchema = z.object({
  title: z.string().trim().max(120), audience: z.string().trim().max(500), outcome: z.string().trim().max(1000),
  includes: z.string().trim().max(3000), price: z.number().min(0).max(100000),
  currency: z.enum(['usd', 'eur', 'gbp']),
});
export const offerStudySchema = z.object({
  question: z.string().trim().min(5).max(300), problem: z.string().trim().max(1000),
  a: offerVariantSchema, b: offerVariantSchema,
});
export type OfferVariant = z.infer<typeof offerVariantSchema>;
export type OfferStudy = z.infer<typeof offerStudySchema>;
export type OfferResult = { id: string; revision: number; preference: 'a'|'b'|'neither'; readiness: string; feedback: string; email: string|null; createdAt: number };
export type OfferLab = { draft: OfferStudy; slug: string; status: 'draft'|'live'|'closed'; revision: number; publishedRevision: number|null; published: OfferStudy|null; visitors: number; responseCount: number; totalResponses: number; preferenceCounts: Record<'a'|'b'|'neither', number>; responses: OfferResult[] };
export const offerReadiness = { curious: 'Just exploring', interested: 'Interested, but I have questions', ready: 'I would consider buying at this price' } as const;
export function initialOfferStudy(title: string, audience: string): OfferStudy {
  const variant = { title, audience, outcome: '', includes: '', price: 0, currency: 'usd' as const };
  return { question: 'Which of these offers would be more useful to you?', problem: '', a: variant, b: { ...variant, title: `${title} — alternative` } };
}
export function offerPrice(variant: OfferVariant) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: variant.currency.toUpperCase(), maximumFractionDigits: 2 }).format(variant.price);
}
export function completeOfferStudy(study: OfferStudy) {
  return [study.a, study.b].every(v => v.title.length >= 3 && v.audience.length >= 3 && v.outcome.length >= 3 && v.includes.length >= 3);
}
