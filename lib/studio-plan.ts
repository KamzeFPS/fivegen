import { z } from 'zod';

export const studioFormats = ['Guide', 'Mini course', 'Template kit', 'Challenge', 'Playbook', 'Custom product'] as const;
export const studioPlanSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(12).max(2000),
  audience: z.string().min(3).max(300),
  format: z.enum(studioFormats),
  language: z.string().min(2).max(50),
  duration: z.number().int().min(3).max(30),
  deliverables: z.array(z.object({ name: z.string().min(3).max(100), detail: z.string().min(10).max(500) })).min(3).max(8),
  direction: z.string().min(20).max(2000),
  assumptions: z.array(z.string().max(300)).max(4),
});
export const planningResponseSchema = z.object({
  answer: z.string().min(20).max(2500),
  questions: z.array(z.string().min(5).max(250)).max(3),
  plan: studioPlanSchema,
});
export type StudioPlan = z.infer<typeof studioPlanSchema>;
export type StudioMessage = { id: string; role: 'user' | 'assistant'; content: string; questions?: string[] };
export type StudioConversation = { id: string; messages: StudioMessage[]; plan: StudioPlan | null; productId: string | null; updatedAt: number };
export const planningAllowance = 20;

export function briefFromPlan(plan: StudioPlan) {
  return { title: plan.title, description: plan.description, audience: plan.audience, format: plan.format, language: plan.language, duration: plan.duration,
    quality: 'premium' as const, price: 0, color: 'orange' as const,
    instructions: `${plan.direction}\nAgreed deliverables:\n${plan.deliverables.map(d => `${d.name}: ${d.detail}`).join('\n')}\nExplicit assumptions: ${plan.assumptions.join('; ')}`,
  };
}
