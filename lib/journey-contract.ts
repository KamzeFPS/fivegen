import {z} from 'zod';
// No email, IP, page text, referrer, notes or arbitrary metadata is accepted.
export const journeyEventSchema=z.object({slug:z.string().min(1).max(120),sessionId:z.string().uuid(),event:z.enum(['visit','cta','experiment-view']),campaign:z.string().regex(/^[a-zA-Z0-9_-]{0,80}$/).default('')}).strict();
export const checkoutJourneySchema=z.object({journeySession:z.string().uuid().optional(),campaign:z.string().regex(/^[a-zA-Z0-9_-]{0,80}$/).optional()});
export const journeyAttributionModel='Same-browser-session linkage supplied at checkout. No cross-device identity, durable cookie window or causal attribution is claimed. Paid status comes only from verified order fulfillment; journey events never grant access.';
