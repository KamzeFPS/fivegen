import {ApiError,database,failure} from './server';
import {clipperCampaignSchema,clipperProfileSchema,clipperSubmissionSchema,clipperReviewSchema,clipperSocialUrl,clipperPostIdentity,clipperReward,type ClipperCampaign,type ClipperProfile,type ClipperSubmission} from './clipper';

type Row=Record<string,unknown>;
const campaignSelect=`SELECT c.*,(SELECT COUNT(*) FROM clipper_memberships m WHERE m.campaign_id=c.id) joined_count,(SELECT COUNT(*) FROM clipper_submissions s WHERE s.campaign_id=c.id) submission_count FROM clipper_campaigns c`;
function campaignFromRow(r:Row):ClipperCampaign{
 return {id:String(r.id),version:Number(r.version),title:JSON.parse(String(r.title)),description:JSON.parse(String(r.description)),brief:JSON.parse(String(r.brief)),rules:JSON.parse(String(r.rules)),brand:String(r.brand),category:String(r.category),platforms:JSON.parse(String(r.platforms)),rewardModel:r.reward_model as ClipperCampaign['rewardModel'],currency:r.currency as ClipperCampaign['currency'],rate:Number(r.rate),minPayout:Number(r.min_payout),maxPayout:Number(r.max_payout),budget:Number(r.budget),approvedRewards:Number(r.approved_rewards),startsAt:r.starts_at===null?null:Number(r.starts_at),endsAt:r.ends_at===null?null:Number(r.ends_at),coverUrl:String(r.cover_url),referenceUrl:String(r.reference_url),status:r.status as ClipperCampaign['status'],joinedCount:Number(r.joined_count),submissionCount:Number(r.submission_count),createdAt:Number(r.created_at),updatedAt:Number(r.updated_at)};
}
function profileFromRow(r:Row):ClipperProfile{return {owner:String(r.owner),displayName:String(r.display_name),socialLinks:JSON.parse(String(r.social_links)),createdAt:Number(r.created_at),updatedAt:Number(r.updated_at)};}
export function submissionFromRow(r:Row):ClipperSubmission{return {id:String(r.id),campaignId:String(r.campaign_id),owner:String(r.owner),displayName:String(r.display_name),platform:r.platform as ClipperSubmission['platform'],url:String(r.url),source:r.video_id?'upload':'link',videoId:r.video_id?String(r.video_id):null,videoName:String(r.video_name||''),videoSize:Number(r.video_size||0),status:r.status as ClipperSubmission['status'],verifiedViews:Number(r.verified_views),reward:Number(r.reward),reviewNote:String(r.review_note),createdAt:Number(r.created_at),reviewedAt:r.reviewed_at===null?null:Number(r.reviewed_at)};}
export async function getClipperSubmission(id:string){const row=await database().prepare('SELECT s.*,v.name video_name,v.size video_size FROM clipper_submissions s LEFT JOIN clipper_videos v ON v.id=s.video_id WHERE s.id=?').bind(id).first();if(!row)throw new ApiError('Submission not found.',404);return submissionFromRow(row);}
export async function getClipperCampaigns(admin=false){const rows=await database().prepare(campaignSelect+(admin?'':" WHERE c.status<>'draft'")+' ORDER BY c.created_at DESC LIMIT 500').all();return rows.results.map(campaignFromRow);}
export async function getClipperCampaign(id:string,admin=false){const row=await database().prepare(campaignSelect+" WHERE c.id=?"+(admin?'':" AND c.status<>'draft'")).bind(id).first();if(!row)throw new ApiError('Campaign not found.',404);return campaignFromRow(row);}
export async function getClipperMember(owner:string){
 const db=database(),[profile,memberships,submissions]=await Promise.all([db.prepare('SELECT * FROM clipper_profiles WHERE owner=?').bind(owner).first(),db.prepare('SELECT campaign_id,joined_at FROM clipper_memberships WHERE owner=? ORDER BY joined_at DESC LIMIT 500').bind(owner).all(),db.prepare('SELECT s.*,v.name video_name,v.size video_size FROM clipper_submissions s LEFT JOIN clipper_videos v ON v.id=s.video_id WHERE s.owner=? ORDER BY s.created_at DESC LIMIT 500').bind(owner).all()]);
 return {profile:profile?profileFromRow(profile):null,memberships:memberships.results.map(row=>({campaignId:String(row.campaign_id),joinedAt:Number(row.joined_at)})),submissions:submissions.results.map(submissionFromRow)};
}
export async function getClipperAdmin(){const [campaigns,submissions]=await Promise.all([getClipperCampaigns(true),database().prepare("SELECT s.*,v.name video_name,v.size video_size FROM clipper_submissions s LEFT JOIN clipper_videos v ON v.id=s.video_id ORDER BY CASE WHEN s.status='pending' THEN 0 ELSE 1 END,s.created_at DESC,s.id DESC LIMIT 1000").all()]);return {campaigns,submissions:submissions.results.map(submissionFromRow)};}
export async function saveClipperProfile(owner:string,input:unknown){
 const value=clipperProfileSchema.parse(input),now=Date.now(),links=Object.fromEntries(Object.entries(value.socialLinks).map(([platform,url])=>[platform,url?clipperSocialUrl(platform as 'tiktok'|'instagram'|'youtube',url):'']));
 await database().prepare('INSERT INTO clipper_profiles(owner,display_name,social_links,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET display_name=excluded.display_name,social_links=excluded.social_links,updated_at=excluded.updated_at').bind(owner,value.displayName,JSON.stringify(links),now,now).run();
 return (await getClipperMember(owner)).profile!;
}
export async function saveClipperCampaign(admin:string,input:unknown,id?:string,expectedVersion?:number){
 const value=clipperCampaignSchema.parse(input),db=database(),now=Date.now();
 const values=[JSON.stringify(value.title),JSON.stringify(value.description),JSON.stringify(value.brief),JSON.stringify(value.rules),value.brand,value.category,JSON.stringify(value.platforms),value.rewardModel,value.currency,value.rate,value.minPayout,value.maxPayout,value.budget,value.startsAt,value.endsAt,value.coverUrl,value.referenceUrl,value.status];
 if(!id){id=crypto.randomUUID();await db.prepare('INSERT INTO clipper_campaigns(title,description,brief,rules,brand,category,platforms,reward_model,currency,rate,min_payout,max_payout,budget,starts_at,ends_at,cover_url,reference_url,status,id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...values,id,admin,now,now).run();}
 else{
  const previous=await getClipperCampaign(id,true);
  if(previous.status!=='draft'&&value.status==='draft')throw new ApiError('Published campaigns can be paused or closed, but cannot return to a private draft.',409);
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion!==previous.version)throw new ApiError('This campaign changed in another tab. Reload before saving.',409);
  if(value.budget<previous.approvedRewards)throw new ApiError('The budget cannot be lower than rewards already approved.',409);
  // Participants join the displayed offer. Financial terms and eligible
  // platforms stay fixed once somebody has joined; budget may be topped up.
  const termsUnchanged=previous.rewardModel===value.rewardModel&&previous.currency===value.currency&&previous.rate===value.rate&&previous.minPayout===value.minPayout&&previous.maxPayout===value.maxPayout&&JSON.stringify(previous.platforms)===JSON.stringify(value.platforms);
  if(previous.joinedCount&&!termsUnchanged)throw new ApiError('Reward terms and platforms are fixed after the first creator joins. Create a new campaign for different terms.',409);
  const updated=await db.prepare(`UPDATE clipper_campaigns SET title=?,description=?,brief=?,rules=?,brand=?,category=?,platforms=?,reward_model=?,currency=?,rate=?,min_payout=?,max_payout=?,budget=?,starts_at=?,ends_at=?,cover_url=?,reference_url=?,status=?,version=version+1,updated_at=? WHERE id=? AND version=? AND approved_rewards<=? AND (?=1 OR NOT EXISTS(SELECT 1 FROM clipper_memberships WHERE campaign_id=?))`).bind(...values,now,id,expectedVersion,value.budget,termsUnchanged?1:0,id).run();
  if(!updated.meta.changes)throw new ApiError('The campaign changed while you were saving. Reload before trying again.',409);
 }
 return getClipperCampaign(id,true);
}
export async function joinClipperCampaign(owner:string,id:string){
 const db=database(),now=Date.now();if(!await db.prepare('SELECT owner FROM clipper_profiles WHERE owner=?').bind(owner).first())throw new ApiError('Complete your clipper profile before joining.',409);
 const existing=await db.prepare('SELECT joined_at FROM clipper_memberships WHERE campaign_id=? AND owner=?').bind(id,owner).first();if(existing)return {campaignId:id,joinedAt:Number(existing.joined_at)};
 await db.prepare("INSERT OR IGNORE INTO clipper_memberships(campaign_id,owner,joined_at) SELECT id,?,? FROM clipper_campaigns WHERE id=? AND status='active' AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>?) AND approved_rewards<budget").bind(owner,now,id,now,now).run();
 const row=await db.prepare('SELECT joined_at FROM clipper_memberships WHERE campaign_id=? AND owner=?').bind(id,owner).first();if(!row)throw new ApiError('This campaign is not accepting new creators right now.',409);
 return {campaignId:id,joinedAt:Number(row.joined_at)};
}
export async function submitClipperClip(owner:string,campaignId:string,input:unknown){
 const value=clipperSubmissionSchema.parse(input),db=database(),id=crypto.randomUUID(),now=Date.now(),url=clipperSocialUrl(value.platform,value.url,true)!,postKey=clipperPostIdentity(value.platform,value.url)!;
 // State and membership are checked inside the INSERT, avoiding a pause or
 // deadline race between the request check and the write.
 try{
  const result=await db.prepare(`INSERT INTO clipper_submissions(id,campaign_id,owner,display_name,platform,url,post_key,created_at) SELECT ?,c.id,m.owner,p.display_name,?,?,?,? FROM clipper_campaigns c JOIN clipper_memberships m ON m.campaign_id=c.id AND m.owner=? JOIN clipper_profiles p ON p.owner=m.owner WHERE c.id=? AND c.status='active' AND (c.starts_at IS NULL OR c.starts_at<=?) AND (c.ends_at IS NULL OR c.ends_at>?) AND c.approved_rewards<c.budget AND EXISTS(SELECT 1 FROM json_each(c.platforms) WHERE value=?) AND (SELECT COUNT(*) FROM clipper_submissions WHERE owner=? AND created_at>?)<50`).bind(id,value.platform,url,postKey,now,owner,campaignId,now,now,value.platform,owner,now-86_400_000).run();
  if(!result.meta.changes)throw new ApiError('Join an open campaign, choose an eligible platform, and submit up to 50 clips per day.',409);
 }catch(error){if(/UNIQUE.*clipper_submissions\.(?:url|post_key)/i.test(String(error)))throw new ApiError('This video has already been submitted.',409);throw error;}
 return submissionFromRow((await db.prepare('SELECT * FROM clipper_submissions WHERE id=? AND owner=?').bind(id,owner).first())!);
}
export async function reviewClipperSubmission(admin:string,id:string,input:unknown){
 const value=clipperReviewSchema.parse(input),db=database(),row=await db.prepare('SELECT * FROM clipper_submissions WHERE id=?').bind(id).first();if(!row)throw new ApiError('Submission not found.',404);
 if(row.status!=='pending')throw new ApiError('This submission has already been reviewed.',409);
 if(row.video_id&&value.status==='approved')throw new ApiError('Use Approve & publish to approve an uploaded video.',409);
 const campaign=await getClipperCampaign(String(row.campaign_id),true),reward=value.status==='approved'?clipperReward(campaign,value.verifiedViews):0;
 if(value.status==='approved'&&reward===0)throw new ApiError('Verified views have not reached the minimum payout. Keep this submission pending or reject it with a reason.',409);
 try{
  const result=await db.prepare("UPDATE clipper_submissions SET status=?,verified_views=?,reward=?,review_note=?,reviewed_at=?,reviewed_by=? WHERE id=? AND status='pending'").bind(value.status,value.verifiedViews,reward,value.reviewNote,Date.now(),admin,id).run();
  if(!result.meta.changes)throw new ApiError('This submission was reviewed in another tab.',409);
 }catch(error){if(String(error).includes('clipper_budget_exceeded'))throw new ApiError('This reward exceeds the remaining campaign budget. Increase the budget before approving.',409);throw error;}
 return submissionFromRow((await db.prepare('SELECT * FROM clipper_submissions WHERE id=?').bind(id).first())!);
}
export async function clipperJsonBody(request:Request){
 if(Number(request.headers.get('content-length'))>96_000)throw new ApiError('This request is too large.',413);
 const reader=request.body?.getReader(),decoder=new TextDecoder();let text='',size=0;
 if(reader)while(true){const part=await reader.read();if(part.done){text+=decoder.decode();break;}size+=part.value.byteLength;if(size>96_000){await reader.cancel();throw new ApiError('This request is too large.',413);}text+=decoder.decode(part.value,{stream:true});}
 try{return JSON.parse(text);}catch{throw new ApiError('Send a valid JSON request.',400);}
}
export function clipperResponse(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});}
export function clipperFailure(error:unknown){const response=failure(error);response.headers.set('Cache-Control','private, no-store');return response;}
