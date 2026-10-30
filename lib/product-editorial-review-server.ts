import {z} from 'zod';
import {ApiError,binding,database,ownedProduct} from './server';
import {builderDraftSchema,type BuilderDraft} from './builder-contract';
import {editorialContentFingerprint,editorialReviewEngineVersion,reviewEditorialDraft,type EditorialRecord,type EditorialReviewState} from './product-editorial-review';

export const editorialReviewHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const reviewMode=()=>binding('STRIPE_MODE')==='live'?'live':'test';
const base={expectedVersion:z.number().int().min(1),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),expectedUpdatedAt:z.number().int().nonnegative()};
const note=z.string().trim().max(4000).default(''),evidence=z.string().max(6000).default('');
const actionSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('record'),findingId:z.string().max(100),status:z.enum(['confirmed','revised']),note,evidence}).strict(),
 z.object({...base,action:z.literal('acknowledge-all'),note,evidence,attested:z.literal(true)}).strict(),
 z.object({...base,action:z.literal('approve'),note,attested:z.literal(true)}).strict(),
 z.object({...base,action:z.literal('reopen')}).strict(),
]);
async function context(productId:string,owner:string){await ownedProduct(productId,owner);const row=await database().prepare('SELECT version,data FROM product_builder_workspaces WHERE product_id=? AND owner=?').bind(productId,owner).first();if(!row)throw new ApiError('Product workspace not found.',404);const draft=builderDraftSchema.parse(JSON.parse(String(row.data))),fingerprint=await editorialContentFingerprint(draft),mode=reviewMode();return {productId,owner,version:Number(row.version),data:String(row.data),draft,fingerprint,mode};}
type Context=Awaited<ReturnType<typeof context>>;
async function stored(current:Context){return database().prepare('SELECT * FROM product_editorial_reviews WHERE product_id=? AND owner=? AND mode=? AND version=? AND fingerprint=? AND engine_version=?').bind(current.productId,current.owner,current.mode,current.version,current.fingerprint,editorialReviewEngineVersion).first();}
function recordsFrom(value:unknown):Record<string,EditorialRecord>{try{const parsed=JSON.parse(String(value||'{}'));return z.record(z.object({status:z.enum(['confirmed','revised']),note,evidence:z.string().max(6000),reviewedAt:z.number().int().nonnegative()})).parse(parsed);}catch{return {};}}
async function state(current:Context):Promise<EditorialReviewState>{const row=await stored(current),review=reviewEditorialDraft(current.draft),records=recordsFrom(row?.records),remaining=review.findings.filter(finding=>!records[finding.id]).length;return {version:current.version,fingerprint:current.fingerprint,engineVersion:editorialReviewEngineVersion,mode:current.mode,approved:!!row?.approved_at,approvedAt:row?.approved_at?Number(row.approved_at):null,updatedAt:Number(row?.updated_at||0),finalNote:String(row?.final_note||''),...review,records,summary:{total:review.findings.length,reviewed:review.findings.length-remaining,remaining}};}
export async function getEditorialReview(productId:string,owner:string){return state(await context(productId,owner));}
export async function editorialReviewAction(productId:string,owner:string,input:unknown){
 const value=actionSchema.parse(input),current=await context(productId,owner);if(current.version!==value.expectedVersion||current.fingerprint!==value.fingerprint)throw new ApiError('The saved product changed. Open the current review before recording approval.',409);
 const previous=await state(current),records={...previous.records};let approvedAt:number|null=null,finalNote=previous.finalNote;const now=Math.max(Date.now(),previous.updatedAt+1);
 if(value.action==='record'){
  if(!previous.findings.some(finding=>finding.id===value.findingId))throw new ApiError('This finding is not part of the current saved review.',400);
  const old=records[value.findingId];if(old&&old.status===value.status&&old.note===value.note&&old.evidence===value.evidence)return previous;
  records[value.findingId]={status:value.status,note:value.note,evidence:value.evidence,reviewedAt:now};
 }else if(value.action==='acknowledge-all'){for(const finding of previous.findings)if(!records[finding.id])records[finding.id]={status:'confirmed',note:value.note,evidence:value.evidence,reviewedAt:now};if(previous.summary.remaining===0)return previous;
 }else if(value.action==='approve'){if(previous.approved&&previous.finalNote===value.note)return previous;approvedAt=now;finalNote=value.note;
 }else if(!previous.approved)return previous;
 if(previous.updatedAt!==value.expectedUpdatedAt)throw new ApiError('This review changed in another tab. Refresh before saving your notes.',409);
 const result=await database().prepare(`INSERT INTO product_editorial_reviews(product_id,owner,mode,version,fingerprint,engine_version,records,approved_at,final_note,updated_at)
 SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM product_builder_workspaces WHERE product_id=? AND owner=? AND version=? AND data=?)
 AND COALESCE((SELECT updated_at FROM product_editorial_reviews WHERE product_id=? AND owner=? AND mode=? AND version=? AND fingerprint=?),0)=?
 ON CONFLICT(product_id,owner,mode,version,fingerprint) DO UPDATE SET engine_version=excluded.engine_version,records=excluded.records,approved_at=excluded.approved_at,final_note=excluded.final_note,updated_at=excluded.updated_at WHERE product_editorial_reviews.updated_at=?`).bind(productId,owner,current.mode,current.version,current.fingerprint,editorialReviewEngineVersion,JSON.stringify(records),approvedAt,finalNote,now,productId,owner,current.version,current.data,productId,owner,current.mode,current.version,current.fingerprint,value.expectedUpdatedAt,value.expectedUpdatedAt).run();
 if(!result.meta.changes)throw new ApiError('The product or review changed while saving. Refresh the current review.',409);
 return getEditorialReview(productId,owner);
}
export async function assertEditorialReview(productId:string,owner:string,expectedVersion:number){const current=await context(productId,owner);if(current.version!==expectedVersion)throw new ApiError('The saved product changed. Review the latest version before publishing.',409);const review=await state(current);if(!review.approved)throw new ApiError('Preview your product and confirm this saved version before publishing.',409);return {version:current.version,fingerprint:current.fingerprint,approvedAt:review.approvedAt!};}
/** Add this condition inside the publication INSERT, so a save or review
 * reopening between the preflight check and publication cannot race approval. */
export async function editorialReviewPublicationGuard(productId:string,owner:string,expectedVersion:number,draft?:BuilderDraft){
 const current=await context(productId,owner);if(current.version!==expectedVersion||draft&&await editorialContentFingerprint(draft)!==current.fingerprint)throw new ApiError('The saved product changed. Review its latest version before publishing.',409);const review=await state(current);if(!review.approved)throw new ApiError('Preview your product and confirm this saved version before publishing.',409);
 return {fingerprint:current.fingerprint,sql:'EXISTS(SELECT 1 FROM product_editorial_reviews er JOIN product_builder_workspaces ew ON ew.product_id=er.product_id AND ew.owner=er.owner WHERE er.product_id=? AND er.owner=? AND er.mode=? AND er.version=? AND er.fingerprint=? AND er.engine_version=? AND er.approved_at IS NOT NULL AND er.updated_at=? AND ew.version=er.version AND ew.data=?)',values:[productId,owner,current.mode,current.version,current.fingerprint,editorialReviewEngineVersion,review.updatedAt,current.data] as (string|number)[]};
}
