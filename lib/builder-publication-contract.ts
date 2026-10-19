import {z} from 'zod';
import {sectionSchema,fileSchema} from './product';

// This schema is the only data returned to unauthenticated visitors. Content
// bodies, original files, lesson recordings and meeting URLs stay private.
export const builderPublicSnapshotSchema=z.object({
 title:z.string().min(3).max(100),description:z.string().min(12).max(12000),audience:z.string().max(300),format:z.string().max(100),
 benefits:z.array(z.string().max(500)).max(8),outline:z.array(z.string().max(150)).max(30),
 priceCents:z.number().int().min(0).max(999900),currency:z.enum(['usd','eur','gbp','cad','aud']),
 hasCover:z.boolean().default(false),
});
export const builderDeliverySnapshotSchema=z.object({
 title:z.string().max(100),format:z.string().max(100),sections:z.array(sectionSchema).max(30),files:z.array(fileSchema).max(20),
 uploadIds:z.array(z.string().uuid()).max(20),meetingUrl:z.string().max(1500),intakePrompt:z.string().max(1000),
 deliveryFamily:z.enum(['document','course','templates','challenge','service','community','custom']).default('document'),
 communityUrl:z.string().max(1500).default(''),
 serviceScope:z.string().max(6000).default(''),preparation:z.string().max(6000).default(''),
});
export type BuilderPublicSnapshot=z.infer<typeof builderPublicSnapshotSchema>;
export type BuilderDeliverySnapshot=z.infer<typeof builderDeliverySnapshotSchema>;
