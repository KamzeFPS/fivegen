import {z} from 'zod';
import type {ProductStudioConfig} from './product-studio-contract';

export const communityTierSchema=z.object({
 id:z.string().uuid(),name:z.string().trim().min(1).max(100),description:z.string().max(1500).default(''),
 billing:z.enum(['free','month','year']),priceCents:z.number().int().min(0).max(999900),
 channels:z.array(z.string().trim().min(1).max(80)).min(1).max(20),
 resourceIds:z.array(z.string().regex(/^(?:upload|file|section|block|template|service):.{1,200}$/)).max(200).default([]),
 eventIds:z.array(z.string().min(1).max(80)).max(100).default([]),
}).superRefine((tier,context)=>{if(tier.billing==='free'&&tier.priceCents!==0)context.addIssue({code:'custom',path:['priceCents'],message:'Free membership must have a zero price.'});if(tier.billing!=='free'&&tier.priceCents<50)context.addIssue({code:'custom',path:['priceCents'],message:'Paid memberships need a recurring price of at least 0.50.'});});
export type CommunityTier=z.infer<typeof communityTierSchema>;
const safeLink=(value:string)=>{if(!value)return true;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}};
export const communityOnboardingSchema=z.object({
 requireProfile:z.boolean().default(false),introPrompt:z.string().max(3000).default(''),
 steps:z.array(z.object({id:z.string().uuid(),title:z.string().trim().min(1).max(180),body:z.string().max(5000).default(''),url:z.string().max(2000).refine(safeLink,'Use a complete HTTPS link.').default('')})).max(20).default([]),
});
export const communityWeeklyPromptSchema=z.object({id:z.string().uuid(),body:z.string().trim().min(1).max(5000),channel:z.string().trim().min(1).max(80),weekday:z.number().int().min(0).max(6),hour:z.number().int().min(0).max(23),timezone:z.string().max(100).default('UTC').refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}},'Choose a valid time zone.'),enabled:z.boolean().default(true)});
export const communityAdvancedSchema=z.object({
 tiers:z.array(communityTierSchema).max(12).optional(),bundleTierId:z.string().uuid().optional(),onboarding:communityOnboardingSchema.optional(),weeklyPrompts:z.array(communityWeeklyPromptSchema).max(30).optional(),
}).passthrough().superRefine((config,context)=>{
 if(config.tiers?.length&&config.enabled!==true)context.addIssue({code:'custom',path:['tiers'],message:'Membership plans require a community hosted on FiveGen. Choose Hosted on FiveGen before publishing plans.'});
 const unique=(ids:string[],path:string)=>{if(new Set(ids).size!==ids.length)context.addIssue({code:'custom',path:[path],message:'Each item needs its own identity.'});};
 unique(config.tiers?.map(tier=>tier.id)||[],'tiers');unique(config.onboarding?.steps.map(step=>step.id)||[],'onboarding');unique(config.weeklyPrompts?.map(prompt=>prompt.id)||[],'weeklyPrompts');
 if(config.bundleTierId&&!config.tiers?.some(tier=>tier.id===config.bundleTierId))context.addIssue({code:'custom',path:['bundleTierId'],message:'Choose an existing membership plan for bundles.'});
 const channels=Array.isArray(config.channels)?config.channels:['General'],events=Array.isArray(config.events)?config.events.map(event=>event&&typeof event==='object'&&'id' in event?event.id:''):[];
 for(const [index,tier] of (config.tiers||[]).entries()){if(tier.channels.some(channel=>!channels.includes(channel)))context.addIssue({code:'custom',path:['tiers',index,'channels'],message:'Choose channels that exist in this community.'});if(tier.eventIds.some(id=>!events.includes(id)))context.addIssue({code:'custom',path:['tiers',index,'eventIds'],message:'Choose events that exist in this community.'});}
 for(const [index,prompt] of (config.weeklyPrompts||[]).entries())if(!channels.includes(prompt.channel))context.addIssue({code:'custom',path:['weeklyPrompts',index,'channel'],message:'Choose a channel that exists in this community.'});
});

export function communityPublicTiers(value:unknown){const result=communityAdvancedSchema.safeParse(value||{});return result.success?(result.data.tiers||[]).map(({id,name,description,billing,priceCents})=>({id,name,description,billing,priceCents})):[];}
export function communityTierSelection(studio:ProductStudioConfig|undefined,tierId?:string){
 const original=studio?.community||{},config=communityAdvancedSchema.parse(original),tiers=config.tiers||[];
 // A draft or a caller cannot choose the identity written into purchase proof.
 const clean={...original};delete clean.purchasedTierId;delete clean.membership;
 if(!tiers.length){if(tierId)throw new Error('This product has no membership tiers.');return null;}
 const tier=tiers.find(item=>item.id===(tierId||(tiers.length===1?tiers[0].id:'')));if(!tier)throw new Error('Choose one of the published membership plans.');
 return {tier,amount:tier.priceCents,pricing:{model:tier.billing==='free'?'free' as const:'subscription' as const,interval:tier.billing==='year'?'year' as const:'month' as const,minimumCents:0,suggestedCents:tier.priceCents,coupons:[],bundleProductIds:[]},studio:{...studio,community:{...clean,purchasedTierId:tier.id}} as ProductStudioConfig};
}

type TierSnapshot={studio?:ProductStudioConfig;sections?:{id?:string;[key:string]:unknown}[];files?:{name:string;[key:string]:unknown}[];uploadIds?:string[];[key:string]:unknown};
export function selectedCommunityTier(snapshot:TierSnapshot){
 const config=communityAdvancedSchema.parse(snapshot.studio?.community||{});if(!config.tiers?.length)return null;
 const selected=config.tiers.find(tier=>tier.id===snapshot.studio?.community?.purchasedTierId);if(!selected)throw new Error('This purchase has no verified membership plan.');return selected;
}
export function communityTierAllows(snapshot:TierSnapshot,kind:'channel'|'event'|'upload'|'file'|'section'|'block'|'template'|'service',id:string){const tier=selectedCommunityTier(snapshot);return !tier||(kind==='channel'?tier.channels.includes(id):kind==='event'?tier.eventIds.includes(id):tier.resourceIds.includes(`${kind}:${id}`));}
export function communityTierResourceIssues(snapshot:TierSnapshot){
 const config=communityAdvancedSchema.parse(snapshot.studio?.community||{}),available=new Set<string>([...(snapshot.uploadIds||[]).map(id=>`upload:${id}`),...(snapshot.files||[]).map(file=>`file:${file.name}`),...(snapshot.sections||[]).map((section,index)=>`section:${section.id||`section-${index}`}`)]);
 const custom=snapshot.studio?.custom,blocks=Array.isArray(custom?.blocks)?custom.blocks:[],templates=Array.isArray(snapshot.studio?.templates?.items)?snapshot.studio.templates.items:[];
 for(const [prefix,items] of [['block',blocks],['template',templates]] as const)for(const item of items)if(item&&typeof item==='object'&&'id' in item)available.add(`${prefix}:${String(item.id)}`);
 const fields=snapshot.fields&&typeof snapshot.fields==='object'?snapshot.fields as Record<string,unknown>:{};
 if(snapshot.deliveryFamily==='service'||snapshot.type==='consulting'||snapshot.type==='coaching'||fields.customDelivery==='service'||Array.isArray(custom?.deliveryKinds)&&custom.deliveryKinds.includes('sessions')||blocks.some(block=>block&&typeof block==='object'&&'kind' in block&&block.kind==='session'))available.add('service:sessions');
 return (config.tiers||[]).flatMap(tier=>tier.resourceIds.filter(id=>!available.has(id)).map(id=>({tierId:tier.id,resourceId:id,message:`${tier.name}: choose resources that are attached to this product.`})));
}
/** Adopting content updates is not a checkout or a change of membership. */
export function preserveCommunityTierUpdate<T extends TierSnapshot>(purchased:T,next:T):T{
 const previous=selectedCommunityTier(purchased);
 if(!previous){if(communityAdvancedSchema.parse(next.studio?.community||{}).tiers?.length)throw new Error('This update introduces membership plans. Choose a plan through checkout to change your community access.');return next;}
 return {...next,studio:{...next.studio,community:purchased.studio?.community}};
}
/** Apply after entitlement verification; no private tier rules reach a buyer. */
export function communityTierDelivery<T extends TierSnapshot>(snapshot:T):T{
 const tier=selectedCommunityTier(snapshot);if(!tier)return snapshot;
 const studio=snapshot.studio||{},community=studio.community||{},safeCommunity:NonNullable<ProductStudioConfig['community']>={...community,channels:(community.channels||['General']).filter(channel=>tier.channels.includes(channel)),events:(community.events||[]).filter(event=>tier.eventIds.includes(event.id)),membership:{id:tier.id,name:tier.name,billing:tier.billing,priceCents:tier.priceCents},availablePlans:communityPublicTiers(community)};
 delete safeCommunity.purchasedTierId;delete safeCommunity.weeklyPrompts;delete safeCommunity.onboarding;delete safeCommunity.bundleTierId;delete safeCommunity.tiers;
 const clean:ProductStudioConfig={...studio,community:safeCommunity};
 if(studio.custom)clean.custom={...studio.custom,deliveryKinds:Array.isArray(studio.custom.deliveryKinds)?studio.custom.deliveryKinds.filter(kind=>kind!=='sessions'||tier.resourceIds.includes('service:sessions')):[],blocks:Array.isArray(studio.custom.blocks)?studio.custom.blocks.filter(block=>block&&typeof block==='object'&&'id' in block&&tier.resourceIds.includes(`block:${String(block.id)}`)):[]};
 if(studio.templates)clean.templates={...studio.templates,items:Array.isArray(studio.templates.items)?studio.templates.items.filter(item=>item&&typeof item==='object'&&'id' in item&&tier.resourceIds.includes(`template:${String(item.id)}`)):[],walkthroughUrl:''};
 const serviceAllowed=tier.resourceIds.includes('service:sessions');if(!serviceAllowed)delete clean.service;
 return {...snapshot,...(!serviceAllowed?{meetingUrl:'',intakePrompt:'',serviceScope:'',preparation:'',...(snapshot.deliveryFamily==='service'?{deliveryFamily:'community'}:{})}:{}),studio:clean,sections:snapshot.sections?.filter((section,index)=>tier.resourceIds.includes(`section:${section.id||`section-${index}`}`)),files:snapshot.files?.filter(file=>tier.resourceIds.includes(`file:${file.name}`)),uploadIds:snapshot.uploadIds?.filter(id=>tier.resourceIds.includes(`upload:${id}`))};
}
