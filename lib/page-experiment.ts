import {z} from 'zod';
import type {ProductPageConfig} from './product-page';
export const pageExperimentDraftSchema=z.object({hypothesis:z.string().trim().min(10).max(1500),target:z.enum(['headline','cta']),alternative:z.string().trim().min(3).max(300),primaryOutcome:z.enum(['cta','purchase']),minimumPerVariant:z.number().int().min(50).max(10000)}).strict().superRefine((value,context)=>{if(value.target==='cta'&&value.alternative.length>60)context.addIssue({code:z.ZodIssueCode.custom,message:'Button labels must be at most 60 characters.',path:['alternative']});});
export type PageExperimentDraft=z.infer<typeof pageExperimentDraftSchema>;
export type ExperimentBaseline={pagePublishedAt:number;checkoutVersion:number;offerUpdatedAt:number;fileRevision:string;control:string;slug:string;};
export type PageExperimentAssignment={runId:string;variant:'a'|'b';target:'headline'|'cta';text:string;pagePublishedAt:number};
export type PageExperimentCounts={variant:'a'|'b';assigned:number;views:number;cta:number;livePaidSessions:number;livePaidOrders:number;refundedOrRevoked:number;testOrders:number;pendingOrders:number;unverifiedFinancials:number};
export type PageExperimentRun={id:string;revision:number;draft:PageExperimentDraft;baseline:ExperimentBaseline;activatedAt:number;closedAt:number|null;valid:boolean;counts:PageExperimentCounts[];evidence:'Inconclusive'|'Ready for interpretation';};
export type PageExperimentWorkspace={draft:PageExperimentDraft|null;revision:number;updatedAt:number;baseline:ExperimentBaseline|null;readiness:string;runs:PageExperimentRun[];};
export function applyExperimentCopy(config:ProductPageConfig,assignment:PageExperimentAssignment):ProductPageConfig{
 if(assignment.variant==='a')return config;
 if(assignment.target==='cta')return {...config,buttonLabel:assignment.text};
 const hero=config.sections.find(section=>section.type==='hero'&&section.enabled);
 return {...config,sections:config.sections.map(section=>section.id===hero?.id?{...section,title:assignment.text}:section)};
}
export const pageExperimentScope='Random 50/50 assignment among visitors who allow anonymous page-version comparison in this browser. One first-party session per product; sessions are not verified unique people, automated traffic is not independently filtered, and cross-device identity is unavailable. Purchase attribution requires an exposed page, a recorded CTA and a new checkout in the same session within 7 days. Only currently paid live orders with verified financial records and no recorded refund/dispute count; tests, pending, revoked and refunded orders are shown separately. No automatic winner or statistical significance is claimed.';
