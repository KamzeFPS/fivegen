import {z} from 'zod';
export const marketingDestinationSchema=z.object({pageId:z.string().min(1).max(200),productId:z.string().uuid(),purpose:z.enum(['sales','lead','application']),version:z.number().int().positive(),path:z.string().min(1).max(500).regex(/^\/(?:product|g|b|p|pages)\/[a-zA-Z0-9_%/-]+$/),title:z.string().max(200)}).strict();
export type MarketingDestination=z.infer<typeof marketingDestinationSchema>;
