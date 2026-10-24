import { z } from 'zod';
import { creatorContextRefsSchema } from './creator-context-contract';
import {marketingDestinationSchema,type MarketingDestination} from './marketing-destination';

export const automationTriggers = ['lead', 'purchase', 'checkout-recovery'] as const;
export type AutomationTrigger = typeof automationTriggers[number];
export const automationKinds = ['welcome', 'nurture', 'launch', 'reminder', 'onboarding'] as const;
export const automationStepSchema = z.object({
  id: z.string().uuid(), kind: z.enum(automationKinds), subject: z.string().trim().min(1).max(200).refine(v => !/[\r\n]/.test(v)),
  body: z.string().trim().min(1).max(12000), delayHours: z.number().min(0).max(24 * 90),
  destination:marketingDestinationSchema.nullable().optional(),
  campaignSource:z.object({campaignId:z.string().uuid(),itemId:z.string().uuid(),campaignRevision:z.number().int().positive(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),sourceRefs:creatorContextRefsSchema.nullable(),briefRevision:z.number().int().nonnegative()}).optional(),
});
export const automationDraftSchema = z.object({
  replyTo: z.union([z.literal(''), z.string().trim().email().max(254)]),
  senderName: z.string().trim().min(1).max(100).refine(v => !/[<>\r\n]/.test(v)),
  postalAddress: z.string().trim().max(500),
  destination:marketingDestinationSchema.nullable().optional(),
  provenance:z.object({campaignRevision:z.number().int().positive(),itemIds:z.array(z.string().uuid()).min(1).max(12),sourceRefs:creatorContextRefsSchema.nullable(),briefRevision:z.number().int().nonnegative()}).optional(),
  steps: z.array(automationStepSchema).min(1).max(12).refine(steps => new Set(steps.map(s => s.id)).size === steps.length, 'Each email needs a unique identity.').refine(steps=>{const refs=steps.flatMap(s=>s.campaignSource?[s.campaignSource.campaignId+':'+s.campaignSource.itemId]:[]);return new Set(refs).size===refs.length;},'Each campaign item may link to only one sequence draft step.'),
});
export type AutomationDraft = z.infer<typeof automationDraftSchema>;
export type AutomationSequence = { id: string; trigger: typeof automationTriggers[number]; status: 'draft' | 'active' | 'paused'; draft: AutomationDraft; revision: number; approvedRevision: number | null; updatedAt: number; activatedAt: number | null };
export type AutomationLog = { id: string; enrollmentId?:string;stepIndex?:number;sequenceRevision?:number;email: string; subject: string; status: string; dueAt: number; sentAt: number | null; attempts: number; error: string };
export type AutomationWorkspace = { sequences: AutomationSequence[]; logs: AutomationLog[]; readiness: { ready: boolean; message: string }; counts: Record<string, number>;destinations:MarketingDestination[];origin:string;manualTemplate:{subject:string;body:string;revision:number;legacy:boolean} };
export function defaultAutomation(trigger: AutomationTrigger, title: string): AutomationDraft {
  if(trigger==='checkout-recovery')return {senderName:title.slice(0,100),replyTo:'',postalAddress:'',steps:[{id:crypto.randomUUID(),kind:'reminder',delayHours:24,subject:'Still considering {{product}}?',body:'Hi {{name}},\n\nYou started checkout for {{product}}. If it is still a fit, you can review the offer and start a new secure checkout here:\n\n{{checkout_url}}\n\nReply if you have a question. No pressure if now is not the right time.'}]};
  return { senderName: title.slice(0, 100), replyTo: '', postalAddress: '', steps: [{ id: crypto.randomUUID(), kind: trigger === 'lead' ? 'welcome' : 'onboarding', delayHours: 0,
    subject: trigger === 'lead' ? 'Thanks for your interest in {{product}}' : 'Welcome to {{product}}',
    body: trigger === 'lead' ? 'Hi {{name}},\n\nThanks for your interest in {{product}}. Reply with the outcome you are working toward, and I will help you decide whether it is a fit.\n\n{{product_url}}' : 'Hi {{name}},\n\nWelcome to {{product}}. Open your customer portal at {{portal_url}} using the browser you purchased with, or sign in with your purchase email. Start with the first lesson, and reply here if you need help.' }] };
}
export function renderAutomationText(text: string, values: { name: string; product: string; funnel_url: string; portal_url: string; checkout_url?:string;product_url?:string }) {
  return text.replace(/\{\{(name|product|product_url|funnel_url|portal_url|checkout_url)\}\}/g, (_, key: keyof typeof values) => values[key]||'');
}

export const automationBlueprints = [{id:'welcome',name:'Welcome interested people',trigger:'lead' as const,description:'Introduce your approach, share one useful step, then invite a reply.',delays:[0,48,48],subjects:['Thanks for your interest in {{product}}','One useful next step','Is {{product}} a fit for you?']},{id:'launch',name:'A thoughtful product launch',trigger:'lead' as const,description:'Explain the problem, share your real story, and invite the right people.',delays:[0,48,48],subjects:['Why I made {{product}}','The story behind {{product}}','What is included in {{product}}']},{id:'onboarding',name:'Help customers get started',trigger:'purchase' as const,description:'Welcome a verified live buyer and help them use what they purchased.',delays:[0,24,72],subjects:['Welcome to {{product}}','Your first practical step','How is it going with {{product}}?']}];
export function blueprintDraft(id:string,title:string):AutomationDraft {const recipe=automationBlueprints.find(b=>b.id===id);if(!recipe)throw new Error('Choose an available blueprint.');const initial=defaultAutomation(recipe.trigger,title);return {...initial,steps:recipe.subjects.map((subject,i)=>({id:crypto.randomUUID(),kind:recipe.trigger==='purchase'?'onboarding':i===0?'welcome':recipe.id==='launch'?'launch':'nurture',subject,delayHours:recipe.delays[i],body:i===0?initial.steps[0].body:recipe.trigger==='purchase'?'Hi {{name}},\n\nWhat is your next step with {{product}}? Open {{portal_url}} to continue. Reply here if you need help.':'Hi {{name}},\n\n[Add your own useful example or story. Review the offer and any claims before approval.]\n\n{{product_url}}'}))};}
export function automationStatusLabel(status:string){return ({pending:'Queued',paused:'Paused · waiting',sending:'Sending · confirmation pending',sent:'Accepted by provider',cancelled:'Stopped / suppressed',failed:'Needs attention'} as Record<string,string>)[status]||status;}
