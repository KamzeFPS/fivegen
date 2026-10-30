import {z} from 'zod';

export const workspaceAttachmentLimits={files:4,fileBytes:8*1024*1024,totalBytes:20*1024*1024,ownerFiles:200,ownerBytes:200*1024*1024} as const;
export const workspaceAttachmentSchema=z.object({id:z.string().uuid(),name:z.string().min(1).max(180),mime:z.enum(['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']),size:z.number().int().min(1).max(workspaceAttachmentLimits.fileBytes),sha256:z.string().regex(/^[a-f0-9]{64}$/),kind:z.enum(['image','document']),warnings:z.array(z.string().max(500)).max(8)}).strict();
export type WorkspaceAttachment=z.infer<typeof workspaceAttachmentSchema>;
export const workspaceAttachmentIdsSchema=z.array(z.string().uuid()).max(workspaceAttachmentLimits.files).refine(ids=>new Set(ids).size===ids.length,'Attach each file once.');
