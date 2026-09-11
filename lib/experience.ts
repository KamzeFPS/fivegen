import { z } from "zod";
export const experienceSchema = z.object({
  community: z.object({enabled:z.boolean().default(false),welcome:z.string().max(4000).default(""),rules:z.string().max(4000).default("Be constructive, respect privacy, and keep discussions relevant.")}).default({}),
  booking: z.object({enabled:z.boolean().default(false),duration:z.number().int().min(15).max(180).default(45),timezone:z.string().max(80).default("UTC").refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}},"Choose a valid timezone."),meetingUrl:z.string().max(1500).default("").refine(v=>!v||/^https:\/\//.test(v),"Use an HTTPS meeting link."),preparation:z.string().max(4000).default(""),confirmationTitle:z.string().max(150).default("You’re booked. Let’s make this useful."),confirmationBody:z.string().max(6000).default(""),confirmationVideoId:z.string().uuid().optional()}).default({}),
});
export type Experience = z.infer<typeof experienceSchema>;
export function readExperience(value:unknown):Experience { try{return experienceSchema.parse(typeof value==='string'?JSON.parse(value):value||{});}catch{return experienceSchema.parse({});} }
export const uploadLimit = 100 * 1024 * 1024;
export const storageLimit = 2 * 1024 * 1024 * 1024;
