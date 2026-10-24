import {z} from 'zod';
import type {BuilderDraft} from './builder-contract';
import type {ProductPageConfig} from './product-page';
import type {Growth} from './growth';
import type {Campaign} from './campaign';
export const collaboratorRoles=['editor','marketer','support'] as const;
export type CollaboratorRole=typeof collaboratorRoles[number];
export type CollaborationKind='content'|'page'|'growth'|'campaign'|'note';
export const collaboratorCapabilities:Record<CollaboratorRole,{title:string;can:CollaborationKind[];description:string}>={
 editor:{title:'Editor',can:['content','page','note'],description:'Read and edit this product’s content and sales-page drafts. Publishing and payment settings remain with the owner.'},
 marketer:{title:'Marketer',can:['page','growth','campaign','note'],description:'Read and edit this product’s page, VSL and campaign drafts. No private teaching content, sending, publishing or source-library access.'},
 support:{title:'Support',can:['note'],description:'Read the product summary and write private handoff notes. No customer export, access changes, refunds or payment controls.'},
};
export function canCollaborate(role:CollaboratorRole,kind:CollaborationKind){return collaboratorCapabilities[role].can.includes(kind);}
export const collaboratorInviteSchema=z.object({email:z.string().trim().email().max(254).transform(value=>value.toLowerCase()),role:z.enum(collaboratorRoles),expiresInDays:z.number().int().min(1).max(30).default(7)}).strict();
export const collaboratorChangeSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('revoke'),id:z.string().uuid(),expectedUpdatedAt:z.number().int().positive()}).strict(),
 z.object({action:z.literal('role'),id:z.string().uuid(),role:z.enum(collaboratorRoles),expectedUpdatedAt:z.number().int().positive()}).strict(),
 z.object({action:z.literal('review'),eventId:z.string().uuid(),expectedSourceRevision:z.number().int().nonnegative().nullable()}).strict(),
]);
export const collaborationWriteSchema=z.object({kind:z.enum(['content','page','growth','campaign','note']),data:z.unknown()}).strict();
export type CollaboratorView={id:string;productId:string;email:string;role:CollaboratorRole;status:'pending'|'active'|'revoked';expiresAt:number;expired:boolean;acceptedAt:number|null;updatedAt:number};
export type CollaborationEvent={id:string;collaboratorId:string;productId:string;actor:string;kind:string;status:string;sourceRevision:number|null;note:string;createdAt:number;reviewedAt:number|null;current?:boolean;reviewPath:string};
export function collaborationReviewPath(productId:string,kind:string){return kind==='growth'||kind==='campaign'?`/?project=${encodeURIComponent(productId)}&area=${kind==='growth'?'vsl':'campaigns'}`:`/build/${encodeURIComponent(productId)}?area=${kind==='page'?'page':kind==='content'?'content':'details'}`;}
export type CollaborationWorkspace={id:string;productId:string;title:string;description:string;role:CollaboratorRole;capabilities:typeof collaboratorCapabilities[CollaboratorRole];content?:{draft:Pick<BuilderDraft,'title'|'description'|'audience'|'sections'|'files'>;version:number};page?:{draft:ProductPageConfig;updatedAt:number};growth?:Growth;campaign?:Campaign;history:CollaborationEvent[]};
