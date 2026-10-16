import { z } from 'zod';
export const voiceKinds = ['video', 'audio', 'story', 'result'] as const;
export const voiceInputSchema = z.object({
  productId: z.string().uuid(), title: z.string().trim().min(1).max(150), kind: z.enum(voiceKinds),
  transcript: z.string().max(20000), evidence: z.string().max(3000), uploadId: z.string().uuid().nullable(),
  permission: z.boolean(), approved: z.boolean(), expectedUpdatedAt: z.number().int().min(0),
}).refine(v => !v.approved || (v.permission && v.transcript.trim().length > 0 && (v.kind !== 'result' || v.evidence.trim().length > 0)), { message: 'Approve only permitted sources with reviewed text and evidence context for results.' });
export type VoiceSource = Omit<z.infer<typeof voiceInputSchema>, 'expectedUpdatedAt'> & { id: string; updatedAt: number; uploadAvailable: boolean };
export type VoiceReference = { id: string; title: string; updatedAt: number };
export type VoiceContext = VoiceReference & { kind: VoiceSource['kind']; transcript: string; evidence: string };
export const voiceLabels: Record<VoiceSource['kind'], string> = { video: 'Creator video', audio: 'Voice note', story: 'Personal story', result: 'Customer result' };
