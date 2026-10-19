import { z } from 'zod';

export const commerceOfferSchema = z.object({
  enabled: z.boolean(), amount: z.number().int().min(50).max(999900), currency: z.enum(['usd','eur','gbp','cad','aud']),
  intakePrompt: z.string().trim().max(1000),
  meetingUrl: z.string().trim().max(1500).refine(v => !v || /^https:\/\//.test(v) && (() => { try { return !new URL(v).username && !new URL(v).password; } catch { return false; } })(), 'Use an HTTPS meeting URL.'),
  expectedUpdatedAt: z.number().int().nonnegative(),
});
export type CommerceOffer = Omit<z.infer<typeof commerceOfferSchema>,'expectedUpdatedAt'> & { updatedAt:number };
export type CommerceAccount = { configured:boolean; enabled:boolean; mode:'live'|'test'|null; connected:boolean; ready:boolean; accountId:string|null };
export type CommerceSlot = { id:string; startsAt:number; endsAt:number; booked:boolean };
export const commerceMoney = (amount:number,currency='usd') => new Intl.NumberFormat('en-US',{style:'currency',currency:currency.toUpperCase()}).format(amount/100);
export const isConsulting = (format:string) => ['Consulting / Mentorship','Coaching session'].includes(format);
export async function commerceResponse<T>(response:Response):Promise<T>{const data=await response.json() as T&{error?:string};if(!response.ok)throw new Error(data.error||'The request could not be completed.');return data;}

export function commerceCampaign(search:string):string{const query=new URLSearchParams(search),value=query.get('utm_campaign')||query.get('campaign')||'';return /^[a-zA-Z0-9_-]{1,80}$/.test(value)?value:'';}
