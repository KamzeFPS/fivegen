import {z} from 'zod';
import {sectionSchema} from './product';

// A starter label never changes a purchased entitlement. Only explicitly
// included modules enter an immutable offer revision.
export const saleModuleKindSchema=z.enum(['downloads','course']);
export type SaleModuleKind=z.infer<typeof saleModuleKindSchema>;
export const saleModuleSchema=z.object({
  kind:saleModuleKindSchema,
  name:z.string().trim().min(1).max(100),
  included:z.boolean(),
  uploadIds:z.array(z.string().uuid()).max(20).refine(v=>new Set(v).size===v.length,'Attach each file once.'),
  sections:z.array(sectionSchema).max(30).refine(v=>new Set(v.map(s=>s.id).filter(Boolean)).size===v.filter(s=>s.id).length,'Use unique lesson IDs.'),
});
export const saleDraftSchema=z.object({
  title:z.string().trim().max(100),description:z.string().trim().max(12000),
  currency:z.literal('usd'),priceCents:z.number().int().min(0).max(999900),
  coverUploadId:z.string().uuid().optional(),
  modules:z.array(saleModuleSchema).min(1).max(2).refine(v=>new Set(v.map(m=>m.kind)).size===v.length,'Each feature can be added once.'),
});
export type SaleDraft=z.infer<typeof saleDraftSchema>;
export type SaleModule=z.infer<typeof saleModuleSchema>;
export type SaleSnapshot=SaleDraft;
export interface SaleUpload {id:string;name:string;mime:string;size:number;status:string;sha256?:string|null;validation_error?:string|null}
export interface SaleReadiness {
  ready:boolean;
  checks:{key:'details'|'downloads'|'course'|'price'|'payments'|'delivery';ready:boolean;message:string;stage:'product'|'sell'|'review'}[];
  payments:{state:'disabled'|'unconfigured'|'not_connected'|'incomplete'|'pending'|'restricted'|'eligible'|'unavailable';message:string;environment:'test';recovery:'admin'|'refresh'|null};
  existingBuyerCount:number;
}
export interface FileSaleWorkspace {
  product:{id:string;slug:string;format:string};draft:SaleDraft;version:number;
  publishedRevisionId:string|null;readiness:SaleReadiness;uploads:SaleUpload[];publishedSnapshot?:SaleDraft|null;
}
export function saleUploadIds(draft:SaleDraft):string[]{
  return [...new Set(draft.modules.flatMap(m=>m.kind==='downloads'?m.uploadIds:m.sections.flatMap(s=>s.videoId?[s.videoId]:[])))];
}
