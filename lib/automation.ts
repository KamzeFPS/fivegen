import { z } from 'zod';

export const automationTriggers = ['lead', 'purchase'] as const;
export const automationKinds = ['welcome', 'nurture', 'launch', 'reminder', 'onboarding'] as const;
export const automationStepSchema = z.object({
  id: z.string().uuid(), kind: z.enum(automationKinds), subject: z.string().trim().min(1).max(200).refine(v => !/[\r\n]/.test(v)),
  body: z.string().trim().min(1).max(12000), delayHours: z.number().min(0).max(24 * 90),
});
export const automationDraftSchema = z.object({
  replyTo: z.union([z.literal(''), z.string().trim().email().max(254)]),
  senderName: z.string().trim().min(1).max(100).refine(v => !/[<>\r\n]/.test(v)),
  postalAddress: z.string().trim().max(500),
  steps: z.array(automationStepSchema).min(1).max(12).refine(steps => new Set(steps.map(s => s.id)).size === steps.length, 'Each email needs a unique identity.'),
});
export type AutomationDraft = z.infer<typeof automationDraftSchema>;
export type AutomationSequence = { id: string; trigger: typeof automationTriggers[number]; status: 'draft' | 'active' | 'paused'; draft: AutomationDraft; revision: number; approvedRevision: number | null; updatedAt: number; activatedAt: number | null };
export type AutomationLog = { id: string; email: string; subject: string; status: string; dueAt: number; sentAt: number | null; attempts: number; error: string };
export type AutomationWorkspace = { sequences: AutomationSequence[]; logs: AutomationLog[]; readiness: { ready: boolean; message: string }; counts: Record<string, number> };
export function defaultAutomation(trigger: 'lead' | 'purchase', title: string): AutomationDraft {
  return { senderName: title.slice(0, 100), replyTo: '', postalAddress: '', steps: [{ id: crypto.randomUUID(), kind: trigger === 'lead' ? 'welcome' : 'onboarding', delayHours: 0,
    subject: trigger === 'lead' ? 'Thanks for your interest in {{product}}' : 'Welcome to {{product}}',
    body: trigger === 'lead' ? 'Hi {{name}},\n\nThanks for your interest in {{product}}. Reply with the outcome you are working toward, and I will help you decide whether it is a fit.\n\n{{funnel_url}}' : 'Hi {{name}},\n\nWelcome to {{product}}. Open your customer portal at {{portal_url}} using the browser you purchased with, or sign in with your purchase email. Start with the first lesson, and reply here if you need help.' }] };
}
export function renderAutomationText(text: string, values: { name: string; product: string; funnel_url: string; portal_url: string }) {
  return text.replace(/\{\{(name|product|funnel_url|portal_url)\}\}/g, (_, key: keyof typeof values) => values[key]);
}
