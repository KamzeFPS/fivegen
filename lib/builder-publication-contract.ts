import {z} from 'zod';
import {sectionSchema,fileSchema} from './product';
import {builderTypes,builderTypeForFormat,builderTypeDetails} from './builder-contract';
import type {ProductStudioConfig} from './product-studio-contract';
import {designDocumentSchema} from './design-document';

// This schema is the only data returned to unauthenticated visitors. Content
// bodies, original files, lesson recordings and meeting URLs stay private.
export const builderPublicSnapshotSchema=z.object({
 studio:z.custom<ProductStudioConfig>().optional(),
 preview:z.array(z.object({title:z.string().max(150),body:z.string()})).max(5).optional(),
 title:z.string().min(3).max(100),description:z.string().min(12).max(12000),audience:z.string().max(300),format:z.string().max(100),
 benefits:z.array(z.string().max(500)).max(8),outline:z.array(z.string().max(150)).max(30),
 priceCents:z.number().int().min(0).max(999900),currency:z.enum(['usd','eur','gbp','cad','aud']),
 hasCover:z.boolean().default(false),
});
export const builderDeliverySnapshotSchema=z.object({
 studio:z.custom<ProductStudioConfig>(value=>{if(!value||typeof value!=='object'||Array.isArray(value))return false;const design=(value as ProductStudioConfig).design;return design===undefined||designDocumentSchema.safeParse(design).success;},'The purchased design is invalid.').optional(),
 title:z.string().max(100),format:z.string().max(100),sections:z.array(sectionSchema).max(30),files:z.array(fileSchema).max(20),
 uploadIds:z.array(z.string().uuid()).max(20),meetingUrl:z.string().max(1500),intakePrompt:z.string().max(1000),
 deliveryFamily:z.enum(['document','course','templates','challenge','service','community','custom']).default('document'),
 communityUrl:z.string().max(1500).default(''),
 serviceScope:z.string().max(6000).default(''),preparation:z.string().max(6000).default(''),
 // Only buyer-facing presentation fields are frozen here. Authoring prompts,
 // unpublished draft content and creator-only settings never enter a purchase.
 builderType:z.enum(builderTypes).optional(),description:z.string().max(12000).default(''),
 coverUploadId:z.string().uuid().optional(),
 welcome:z.string().max(6000).default(''),rules:z.string().max(6000).default(''),
 usageInstructions:z.string().max(6000).default(''),compatibleTools:z.string().max(6000).default(''),
 dailyTime:z.string().max(6000).default(''),completionCriteria:z.string().max(6000).default(''),
});
export type BuilderPublicSnapshot=z.infer<typeof builderPublicSnapshotSchema>;
export type BuilderDeliverySnapshot=z.infer<typeof builderDeliverySnapshotSchema>;

// Older publications include the reviewed draft alongside their delivery
// snapshot. Read only this allowlist; never return the whole stored draft.
export function builderPublishedPresentation(content:Record<string,unknown>,publicSnapshot:Record<string,unknown>={}){
 const draft=content.draft&&typeof content.draft==='object'?content.draft as Record<string,unknown>:{};
 const fields=draft.fields&&typeof draft.fields==='object'?draft.fields as Record<string,unknown>:{};
 return {
  builderType:content.builderType??draft.type,
  description:content.description??publicSnapshot.description??draft.description??'',
  coverUploadId:content.coverUploadId??draft.coverUploadId,
  studio:content.studio??draft.studio,
  ...Object.fromEntries(['welcome','rules','usageInstructions','compatibleTools','dailyTime','completionCriteria'].map(key=>[key,content[key]??fields[key]??''])),
 };
}
export function builderBuyerPresentation(snapshot:BuilderDeliverySnapshot|null,format:string){
 const normalizedFormat=format==='Book / Ebook'||format==='Book / eBook'?'Book':format;
 const originalType=snapshot?.builderType||builderTypeForFormat(normalizedFormat);
 // Tier filtering can leave only community access in a service product. Honor
 // that verified buyer scope in both the family and its labels/actions, while
 // retaining the stable type correction for older course snapshots.
 const communityMembership=snapshot?.studio?.community?.membership;
 const communityOnly=snapshot?.deliveryFamily==='community'&&snapshot.studio?.community?.enabled===true&&!!communityMembership&&typeof communityMembership==='object'&&(originalType==='consulting'||originalType==='coaching');
 const builderType=communityOnly?'community':originalType;
 return {
  builderType,
  studio:snapshot?.studio,
  // Old snapshots defaulted to "document", even for video courses. The stable
  // product type corrects that old default; custom deliveries retain their
  // explicitly purchased family.
  deliveryFamily:builderType==='custom'?(snapshot?.deliveryFamily||'custom'):builderTypeDetails[builderType].family,
  description:snapshot?.description||'',
  welcome:snapshot?.welcome||'',rules:snapshot?.rules||'',
  usageInstructions:snapshot?.usageInstructions||'',compatibleTools:snapshot?.compatibleTools||'',
  dailyTime:snapshot?.dailyTime||'',completionCriteria:snapshot?.completionCriteria||'',
 };
}
