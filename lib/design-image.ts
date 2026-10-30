import {z} from 'zod';

/** Shared by image-generation controls and the server; never substitute models. */
export const DESIGN_IMAGE_MODEL='gpt-image-2' as const;
export const designImageQualities=['low','medium','high'] as const;
export type DesignImageQuality=typeof designImageQualities[number];
export const designImageSizes=['1024x1024','1536x1024','1024x1536'] as const;
export type DesignImageSize=typeof designImageSizes[number];
export const designImageBackgrounds=['transparent','opaque'] as const;
export type DesignImageBackground=typeof designImageBackgrounds[number];
export const designImageCreditCosts:Record<DesignImageQuality,number>={low:4,medium:12,high:40};
/** These bounded sizes share a fixed reviewed price per quality. */
export function designImageCredits(quality:DesignImageQuality,_size?:DesignImageSize){return designImageCreditCosts[quality];}
export const designImageQualitySchema=z.preprocess(value=>value==='med'?'medium':value,z.enum(designImageQualities));
export const designImageGenerateSchema=z.object({
 expectedVersion:z.number().int().min(1),requestId:z.string().uuid(),maxCredits:z.number().int().min(0).max(10000),
 prompt:z.string().trim().min(1).max(6000),quality:designImageQualitySchema.default('medium'),size:z.enum(designImageSizes).default('1024x1024'),background:z.enum(designImageBackgrounds).default('transparent'),
}).strict();
export type DesignImageInput=z.infer<typeof designImageGenerateSchema>;
export const designImageResultSchema=z.object({
 upload:z.object({id:z.string().uuid(),name:z.string(),mime:z.literal('image/png'),size:z.number().int().positive().max(8_000_000),status:z.literal('completed'),sha256:z.string().regex(/^[a-f0-9]{64}$/),width:z.number().int().positive(),height:z.number().int().positive()}).strict(),
 spent:z.number().int().min(0),requestId:z.string().uuid(),quality:z.enum(designImageQualities),size:z.enum(designImageSizes),background:z.enum(designImageBackgrounds),model:z.literal(DESIGN_IMAGE_MODEL),
}).strict();
export type DesignImageResult=z.infer<typeof designImageResultSchema>;
export type DesignImageReadiness={enabled:boolean;ready:boolean;message:string;model:typeof DESIGN_IMAGE_MODEL;costs:Record<DesignImageQuality,number>;unlimited:boolean;qualities:typeof designImageQualities;sizes:typeof designImageSizes;backgrounds:typeof designImageBackgrounds;defaultQuality:'medium'};
