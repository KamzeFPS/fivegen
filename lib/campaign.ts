import { z } from 'zod';
import type { VoiceReference } from './creator-voice';
export const campaignChannels = ['social', 'short_video', 'email'] as const;
export const campaignStatuses = ['draft', 'approved', 'scheduled', 'completed'] as const;
export const campaignItemSchema = z.object({ id: z.string().uuid(), channel: z.enum(campaignChannels), title: z.string().trim().min(1).max(180), body: z.string().max(12000), subject: z.string().max(200), sourceIds: z.array(z.string().uuid()).max(8), scheduledAt: z.number().int().positive().nullable(), status: z.enum(campaignStatuses) });
export const campaignSaveSchema = z.object({ title: z.string().trim().min(1).max(150), goal: z.string().max(3000), sourceIds: z.array(z.string().uuid()).max(8), items: z.array(campaignItemSchema).max(30), expectedUpdatedAt: z.number().int().min(0) });
export const generatedCampaignSchema = z.object({ items: z.array(z.object({ channel: z.enum(campaignChannels), title: z.string().trim().min(1).max(180), body: z.string().trim().min(1).max(12000), subject: z.string().max(200), sourceIds: z.array(z.string().uuid()).min(1).max(8) })).min(3).max(9) });
export type CampaignItem = z.infer<typeof campaignItemSchema>;
export type Campaign = Omit<z.infer<typeof campaignSaveSchema>, 'expectedUpdatedAt'> & { updatedAt: number; sourceRevisions: VoiceReference[] };
export const channelLabels: Record<CampaignItem['channel'], string> = { social: 'Social post', short_video: 'Short-video script', email: 'Launch email' };
export function emptyCampaign(title: string): Campaign { return { title: `${title.slice(0, 125)} launch`, goal: '', sourceIds: [], items: [], sourceRevisions: [], updatedAt: 0 }; }
