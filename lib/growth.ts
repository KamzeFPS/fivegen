import { z } from 'zod';

const answer = z.string().max(4000);
export const growthBriefSchema = z.object({
  icp: answer, problem: answer, beliefs: answer, story: answer, promise: answer,
  proof: answer, offer: answer, tone: answer, cta: answer,
});
export const growthAssetsSchema = z.object({
  vsl: z.string().max(24000),
  landing: z.object({
    headline: z.string().min(1).max(250), subheadline: z.string().max(700),
    body: z.string().max(12000), benefits: z.array(z.string().max(500)).max(8),
    ctaLabel: z.string().min(1).max(100), thankYou: z.string().max(2000),
  }),
  followUp: z.string().max(12000),
});
// Manual drafts may be unfinished; a paid AI result must contain every
// promised deliverable before it can replace the creator's saved copy.
export const generatedGrowthAssetsSchema = growthAssetsSchema.extend({
  vsl: z.string().trim().min(1).max(24000),
  landing: growthAssetsSchema.shape.landing.extend({
    headline: z.string().trim().min(1).max(250), body: z.string().trim().min(1).max(12000),
    ctaLabel: z.string().trim().min(1).max(100), thankYou: z.string().trim().min(1).max(2000),
  }),
  followUp: z.string().trim().min(1).max(12000),
});
export const growthSaveSchema = z.object({
  brief: growthBriefSchema, assets: growthAssetsSchema.nullable(),
  expectedUpdatedAt: z.number().int().min(0),
});
export type GrowthBrief = z.infer<typeof growthBriefSchema>;
export type GrowthAssets = z.infer<typeof growthAssetsSchema>;
export type Growth = { brief: GrowthBrief; assets: GrowthAssets | null; updatedAt: number };
export function emptyGrowthBrief(audience = ''): GrowthBrief {
  return { icp: audience, problem: '', beliefs: '', story: '', promise: '', proof: '', offer: '', tone: '', cta: '' };
}
export const growthQuestions: { key: keyof GrowthBrief; label: string; hint: string }[] = [
  { key: 'icp', label: 'Who is this for?', hint: 'Describe your ideal customer, their situation, and who this offer is not for.' },
  { key: 'problem', label: 'What are they struggling with?', hint: 'Use the words your customers use. What have they already tried?' },
  { key: 'beliefs', label: 'What do they need to believe?', hint: 'Their objections, misconceptions, and the new perspective your offer introduces.' },
  { key: 'story', label: 'What is your story?', hint: 'Your real experience, turning point, and why you are teaching this.' },
  { key: 'promise', label: 'What outcome can you responsibly promise?', hint: 'A concrete outcome and its limits. Avoid guaranteed income or invented results.' },
  { key: 'proof', label: 'What evidence can you share?', hint: 'Real examples, demonstrations, or authorized testimonials. Write “No proof yet” if you have none.' },
  { key: 'offer', label: 'What is included in your offer?', hint: 'The content you will create, delivery format, price if known, and support.' },
  { key: 'tone', label: 'How should it sound?', hint: 'Your language, personality, and words you would or would not use.' },
  { key: 'cta', label: 'What should the viewer do next?', hint: 'One specific next step: join a waitlist, request details, or book a conversation.' },
];
export function missingGrowthAnswers(brief: GrowthBrief) {
  return growthQuestions.filter(question => !brief[question.key].trim());
}
