import {z} from 'zod';
export const pagePurposes=['sales','lead','application'] as const;
export type PagePurpose=typeof pagePurposes[number];
export type PublicPageInventory={id:string;productId:string;name:string;purpose:PagePurpose;version:number;publishedVersion:number|null;path:string;hasPublishedLeadForm:boolean;hasPublishedApplicationForm:boolean;recordingUploadId:string|null};
export const leadFormSchema=z.object({heading:z.string().trim().max(200).default('Let’s take the next step.'),buttonLabel:z.string().trim().min(1).max(100).default('Join the list'),thankYou:z.string().trim().min(1).max(2000).default('Thank you. Your request has been received.'),marketingLabel:z.string().trim().min(10).max(1000).default('I agree to receive marketing emails from this creator. I can unsubscribe at any time.')}).strict();
export type LeadFormConfig=z.infer<typeof leadFormSchema>;
export const publicPageCreateSchema=z.object({name:z.string().trim().min(1).max(100),purpose:z.enum(pagePurposes)}).strict();
export const publicPageLeadSchema=z.object({pageId:z.string().uuid(),version:z.number().int().positive(),sectionId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),name:z.string().trim().min(1).max(150),email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),marketing:z.boolean(),website:z.string().max(500).default('')}).strict();
