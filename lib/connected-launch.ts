import {z} from 'zod';
import type {CreatorContextRefs} from './creator-context-contract';
import type {MarketingPluginId} from './marketing-plugins';
import type {PublicPageInventory} from './public-pages';
import type {CampaignSummary} from './campaign';
export const launchGoals=['leads','sales','calls'] as const;
export type LaunchGoal=typeof launchGoals[number];
export const launchRecipes:{id:LaunchGoal;name:string;outcome:string;recipients:string;tools:MarketingPluginId[];steps:string[]}[]=[
 {id:'leads',name:'Collect interested leads',outcome:'A published signup page. Email follow-up is optional.',recipients:'People who request details. Only a separate marketing opt-in permits sales email.',tools:['funnel'],steps:['Choose a lead page','Review the form and thank-you state','Share the published signup link']},
 {id:'sales',name:'Sell my product',outcome:'Your main Sales page, accurate checkout and buyer access.',recipients:'Buyers can purchase without an email sequence, script or private AI references.',tools:[],steps:['Review the sales page','Check price, payment and buyer access','Share the reviewed offer']},
 {id:'calls',name:'Review applications and book calls',outcome:'An actual service application, manual review and booking handoff.',recipients:'Applications are requests, not purchases or accepted clients. Consent stays separate.',tools:['funnel'],steps:['Publish qualification questions','Review the application path','Confirm the intended booking destination']},
];
export const launchSelectionSchema=z.object({goal:z.enum(launchGoals),expectedUpdatedAt:z.number().int().nonnegative(),expectedToolsUpdatedAt:z.number().int().nonnegative().optional(),pageId:z.string().uuid().nullable().optional(),campaignId:z.string().uuid().nullable().optional(),includeEmail:z.boolean().default(false),includeScript:z.boolean().default(false)}).strict();
export type LaunchStep={id:string;title:string;detail:string;state:'ready'|'draft'|'needs-review'|'active'|'paused'|'missing';owner:'You'|'FiveGen';tool:MarketingPluginId|null;href?:string;required?:boolean};
export type GrowthReviewItem={id:string;title:string;scope:string;tool:MarketingPluginId|null;href?:string;sourceTitles:string[];revision:number;intendedAction:string;actor:string;contextFingerprint:string;reviewed:boolean};
export type ConnectedLaunch={goal:LaunchGoal|null;updatedAt:number;toolsUpdatedAt:number;pageId:string|null;campaignId:string|null;includeEmail:boolean;includeScript:boolean;pages:PublicPageInventory[];campaigns:CampaignSummary[];ready:boolean;nextAction:LaunchStep|null;steps:LaunchStep[];sourceTitles:string[];sourceExcerpt:string;contextRefs:CreatorContextRefs|null;reviewCount:number;reviewQueue:GrowthReviewItem[];emailOpening:string;emailSteps:{subject:string;delayHours:number}[];history:{id:string;kind:string;label:string;createdAt:number}[];activity:{id:string;title:string;summary:string;href:string}[]};
export const launchReviewSchema=z.object({assetKey:z.string().min(1).max(120),expectedRevision:z.number().int().nonnegative(),contextFingerprint:z.string().regex(/^[a-f0-9]{64}$/),expectedUpdatedAt:z.number().int().nonnegative()}).strict();
export function relativeWait(hours:number){return hours===0?'Immediately':hours<24?`Wait ${hours} hour${hours===1?'':'s'}`:`Wait ${Number((hours/24).toFixed(2))} day${hours===24?'':'s'}`;}
