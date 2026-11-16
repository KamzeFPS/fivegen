import {z} from 'zod';

export type ClipperLocale='mn'|'en';
export type ClipperText={mn:string;en:string};
export type ClipperPlatform='tiktok'|'instagram'|'youtube';
export type ClipperCampaign={
 id:string;version:number;title:ClipperText;description:ClipperText;brief:ClipperText;rules:ClipperText;
 brand:string;category:string;platforms:ClipperPlatform[];rewardModel:'cpm'|'per_post';currency:'USD'|'MNT';
 rate:number;minPayout:number;maxPayout:number;budget:number;approvedRewards:number;
 startsAt:number|null;endsAt:number|null;coverUrl:string;referenceUrl:string;status:'draft'|'active'|'paused'|'closed';
 joinedCount:number;submissionCount:number;createdAt:number;updatedAt:number;
};
export type ClipperProfile={owner:string;displayName:string;socialLinks:Record<ClipperPlatform,string>;createdAt:number;updatedAt:number};
export type ClipperSubmission={id:string;campaignId:string;owner:string;displayName:string;platform:ClipperPlatform|'upload';url:string;source:'upload'|'link';videoId:string|null;videoName:string;videoSize:number;status:'pending'|'approved'|'rejected';verifiedViews:number;reward:number;reviewNote:string;createdAt:number;reviewedAt:number|null};
export type ClipperMembership={campaignId:string;joinedAt:number};
export type ClipperPublishingSummary={submissionId:string;status:string;platforms:ClipperPlatform[];results:{platform:string;status:string;url?:string}[];error:string;updatedAt:number};
export type ClipperState={campaigns:ClipperCampaign[];profile:ClipperProfile|null;memberships:ClipperMembership[];submissions:ClipperSubmission[];isAdmin:boolean;user:{userId:string;displayName:string;email:string}|null;publishing?:ClipperPublishingSummary[]};
export type ClipperAdminState={campaigns:ClipperCampaign[];submissions:ClipperSubmission[];publishing?:ClipperPublishingSummary[]};
const text=(limit:number,required=false)=>z.object({mn:z.string().trim().max(limit).min(required?1:0),en:z.string().trim().max(limit).min(required?1:0)}).strict();
const httpsUrl=z.string().trim().max(2048).refine(value=>{if(!value)return true;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port;}catch{return false;}},'Use a public HTTPS link.');
const amount=z.number().int().min(0).max(1_000_000_000_000);
export const clipperCampaignSchema=z.object({
 title:text(160,true),description:text(1600,true),brief:text(16000,true),rules:text(8000,true),brand:z.string().trim().min(1).max(100),category:z.string().trim().min(1).max(60),platforms:z.array(z.enum(['tiktok','instagram','youtube'])).min(1).max(3).refine(value=>new Set(value).size===value.length),rewardModel:z.enum(['cpm','per_post']),currency:z.enum(['USD','MNT']),rate:amount.refine(value=>value>0),minPayout:amount,maxPayout:amount.refine(value=>value>0),budget:amount.refine(value=>value>0),startsAt:z.number().int().min(0).nullable(),endsAt:z.number().int().min(0).nullable(),coverUrl:httpsUrl,referenceUrl:httpsUrl,status:z.enum(['draft','active','paused','closed']),
}).strict().superRefine((value,ctx)=>{
 if(value.minPayout>value.maxPayout)ctx.addIssue({code:'custom',path:['minPayout'],message:'Minimum payout must not exceed the clip maximum.'});
 if(value.maxPayout>value.budget)ctx.addIssue({code:'custom',path:['maxPayout'],message:'The clip maximum must fit within the campaign budget.'});
 if(value.startsAt!==null&&value.endsAt!==null&&value.startsAt>=value.endsAt)ctx.addIssue({code:'custom',path:['endsAt'],message:'End time must follow start time.'});
 if(value.rewardModel==='per_post'&&(value.rate<value.minPayout||value.rate>value.maxPayout))ctx.addIssue({code:'custom',path:['rate'],message:'The per-post reward must be within the payout limits.'});
});
export type ClipperCampaignInput=z.infer<typeof clipperCampaignSchema>;
export function clipperSocialUrl(platform:ClipperPlatform,value:string,post=false):string|null{
 try{
  const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  const host=u.hostname.toLowerCase().replace(/^www\./,'');
  if(platform==='tiktok'&&host==='tiktok.com'&&(post?/^\/@[^/]+\/video\/\d+\/?$/:/^\/@[^/]+\/?$/).test(u.pathname))return 'https://www.tiktok.com'+u.pathname.replace(/\/$/,'');
  if(platform==='instagram'&&host==='instagram.com'&&(post?/^\/(?:reel|p)\/[A-Za-z0-9_-]+\/?$/:/^\/[A-Za-z0-9_.]+\/?$/).test(u.pathname))return 'https://www.instagram.com'+u.pathname.replace(/\/$/,'')+'/';
  if(platform==='youtube'&&['youtube.com','m.youtube.com','youtu.be'].includes(host)){
   if(!post&&host!=='youtu.be'&&/^\/(?:@[^/]+|channel\/[A-Za-z0-9_-]+)\/?$/.test(u.pathname))return 'https://www.youtube.com'+u.pathname.replace(/\/$/,'');
   const id=host==='youtu.be'?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]+)\/?$/)?.[1];
   if(post&&id&&/^[A-Za-z0-9_-]{11}$/.test(id))return 'https://www.youtube.com/watch?v='+id;
  }
 }catch{}
 return null;
}
// Platform media identities remain stable when a handle or URL format changes.
// Keep the submitted URL for review, but deduplicate by the actual post ID.
export function clipperPostIdentity(platform:ClipperPlatform,value:string):string|null{
 const canonical=clipperSocialUrl(platform,value,true);if(!canonical)return null;
 const u=new URL(canonical);
 const id=platform==='tiktok'?u.pathname.match(/\/video\/(\d+)$/)?.[1]:platform==='instagram'?u.pathname.match(/^\/(?:p|reel)\/([A-Za-z0-9_-]+)\/$/)?.[1]:u.searchParams.get('v');
 return id?platform+':'+id:null;
}
export const clipperProfileSchema=z.object({displayName:z.string().trim().min(1).max(80),socialLinks:z.object({tiktok:z.string().trim().max(2048),instagram:z.string().trim().max(2048),youtube:z.string().trim().max(2048)}).strict()}).strict().superRefine((value,ctx)=>{for(const platform of ['tiktok','instagram','youtube'] as const)if(value.socialLinks[platform]&&!clipperSocialUrl(platform,value.socialLinks[platform]))ctx.addIssue({code:'custom',path:['socialLinks',platform],message:'Use your public social profile URL.'});});
export const clipperSubmissionSchema=z.object({platform:z.enum(['tiktok','instagram','youtube']),url:z.string().trim().max(2048)}).strict().superRefine((value,ctx)=>{if(!clipperSocialUrl(value.platform,value.url,true))ctx.addIssue({code:'custom',path:['url'],message:'Use a public TikTok video, Instagram reel/post or YouTube video link for the selected platform.'});});
export const clipperReviewSchema=z.object({status:z.enum(['approved','rejected']),verifiedViews:z.number().int().min(0).max(100_000_000_000),reviewNote:z.string().trim().max(2000)}).strict().superRefine((value,ctx)=>{if(value.status==='rejected'&&!value.reviewNote)ctx.addIssue({code:'custom',path:['reviewNote'],message:'Explain why this clip was rejected.'});});
export function clipperReward(campaign:Pick<ClipperCampaign,'rewardModel'|'rate'|'minPayout'|'maxPayout'>,verifiedViews:number){
 const raw=campaign.rewardModel==='per_post'?campaign.rate:Number(BigInt(verifiedViews)*BigInt(campaign.rate)/BigInt(1000));
 const capped=Math.min(raw,campaign.maxPayout);return capped<campaign.minPayout?0:capped;
}
export function clipperIsOpen(campaign:Pick<ClipperCampaign,'status'|'startsAt'|'endsAt'>,now=Date.now()){
 return campaign.status==='active'&&(campaign.startsAt===null||campaign.startsAt<=now)&&(campaign.endsAt===null||campaign.endsAt>now);
}
