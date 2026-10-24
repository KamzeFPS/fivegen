import { z } from 'zod';
import { creatorContextRefsSchema, type CreatorContextRefs } from './creator-context-contract';
import type { VoiceReference } from './creator-voice';
import {marketingDestinationSchema,type MarketingDestination} from './marketing-destination';
export const campaignChannels = ['social', 'short_video', 'email'] as const;
export const campaignStatuses = ['draft', 'approved', 'scheduled', 'completed'] as const;
export const campaignItemSchema = z.object({ id: z.string().uuid(), channel: z.enum(campaignChannels), title: z.string().trim().min(1).max(180), body: z.string().max(12000), subject: z.string().max(200), sourceIds: z.array(z.string().uuid()).max(8), scheduledAt: z.number().int().positive().nullable(), status: z.enum(campaignStatuses) });
export const campaignSaveSchema = z.object({ id:z.string().uuid().optional(),destination:marketingDestinationSchema.nullable().optional(),title: z.string().trim().min(1).max(150), goal: z.string().max(3000), sourceIds: z.array(z.string().uuid()).max(8), items: z.array(campaignItemSchema).max(30), contextRefs: creatorContextRefsSchema.nullable().optional(), expectedUpdatedAt: z.number().int().min(0) });
export const generatedCampaignSchema = z.object({ items: z.array(z.object({ channel: z.enum(campaignChannels), title: z.string().trim().min(1).max(180), body: z.string().trim().min(1).max(12000), subject: z.string().max(200), sourceIds: z.array(z.string().uuid()).min(1).max(8) })).min(3).max(9) });
export type CampaignItem = z.infer<typeof campaignItemSchema>;
export type Campaign = Omit<z.infer<typeof campaignSaveSchema>, 'expectedUpdatedAt'|'id'|'destination'> & { id:string;destination:MarketingDestination|null;createdAt:number;isDefault:boolean;updatedAt: number; sourceRevisions: VoiceReference[]; contextRefs?:CreatorContextRefs|null;briefRevision?:number };
export type CampaignSummary=Pick<Campaign,'id'|'title'|'updatedAt'|'destination'|'isDefault'>;
export const channelLabels: Record<CampaignItem['channel'], string> = { social: 'Social post', short_video: 'Short-video script', email: 'Launch email' };
export function emptyCampaign(title: string,id=''): Campaign { return {id,destination:null,createdAt:0,isDefault:true,title: `${title.slice(0, 125)} launch`, goal: '', sourceIds: [], items: [], sourceRevisions: [], updatedAt: 0 }; }

export const campaignGenerationSchema = z.object({campaignId:z.string().uuid().optional(),expectedUpdatedAt:z.number().int().positive(),requestId:z.string().uuid(),maxCredits:z.number().int().min(0).max(30),mode:z.enum(['append','replace_drafts']).default('append') });
export function mergeCampaignDrafts(existing:CampaignItem[],generated:CampaignItem[],mode:'append'|'replace_drafts'):CampaignItem[]{ const kept=mode==='append'?existing:existing.filter(item=>item.status!=='draft');if(kept.length+generated.length>30)throw new Error('This campaign would exceed 30 items. Remove drafts or choose Replace unapproved drafts.');return [...kept,...generated]; }

export const campaignStatusLabels:Record<CampaignItem['status'],string>={draft:'Draft · needs review',approved:'Approved draft',scheduled:'Reminder set · publish manually',completed:'Published manually · creator confirmed'};
