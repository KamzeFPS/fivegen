import {z} from 'zod';
import {ApiError,binding,database} from './server';
import {parseJson,safeStudentUrl,studentContext,assertStudentPurchaser,type StudentContext} from './product-learning-server';
import type {ProductStudioConfig} from './product-studio-contract';
import {communityAdvancedSchema,communityTierAllows,communityPublicTiers,selectedCommunityTier} from './product-community-tier-contract';
import {assertCommunityTierEntitlement} from './product-community-tiers';

const communityConfig=z.object({enabled:z.boolean().default(false),requireAgreement:z.boolean().default(true),channels:z.array(z.string().trim().min(1).max(80)).min(1).max(20).default(['General']),allowMemberPosts:z.boolean().default(true),events:z.array(z.object({id:z.string().max(80),title:z.string().min(1).max(180),startsAt:z.number().int().positive(),durationMinutes:z.number().min(1).max(1440),url:z.string().max(1500).default(''),description:z.string().max(4000).default('')})).max(100).default([])}).and(communityAdvancedSchema);
async function communityContext(req:Request,id:string){
 const context=await studentContext(req,id),config=communityConfig.parse(context.studio.community||{}),challenge=context.studio.challenge as {groupFeed?:boolean}|undefined,snapshot={studio:context.studio as ProductStudioConfig};
 if(context.enrollment.removed)throw new ApiError('Your community membership has been removed. Contact the creator.',403);
 if(!config.enabled&&!challenge?.groupFeed)throw new ApiError('The creator has not opened a native community for this product.',409);
 await assertCommunityTierEntitlement(id,snapshot);
 const onboarding=(await database().prepare('SELECT step_id,reference_id FROM product_community_onboarding WHERE order_id=?').bind(id).all()).results,done=new Set(onboarding.map(row=>String(row.step_id)));
 return {...context,config,snapshot,done};
}
type CommunityContext=Awaited<ReturnType<typeof communityContext>>;
const canModerate=(context:StudentContext)=>context.enrollment.role==='moderator';
function assertCommunityReady(context:CommunityContext){if(context.config.requireAgreement&&!context.enrollment.rules_accepted_at)throw new ApiError('Read and agree to the community rules first.',409);if(context.config.onboarding?.requireProfile&&!context.done.has('profile'))throw new ApiError('Add your member profile before joining the conversation.',409);}
export async function communityState(req:Request,id:string){
 const context=await communityContext(req,id),db=database(),{config}=context,tier=selectedCommunityTier(context.snapshot),channels=config.channels.filter(channel=>communityTierAllows(context.snapshot,'channel',channel)),ready=(!config.requireAgreement||!!context.enrollment.rules_accepted_at)&&(!config.onboarding?.requireProfile||context.done.has('profile'));
 const posts=ready?(await db.prepare("SELECT p.*,EXISTS(SELECT 1 FROM product_community_prompt_posts schedule WHERE schedule.post_id=p.id) scheduled FROM product_community_posts p LEFT JOIN product_enrollments e ON e.order_id=p.order_id LEFT JOIN commerce_orders o ON o.id=p.order_id WHERE p.product_id=? AND p.mode=? AND p.hidden=0 AND (p.parent_id IS NULL OR EXISTS(SELECT 1 FROM product_community_posts parent LEFT JOIN product_enrollments pe ON pe.order_id=parent.order_id LEFT JOIN commerce_orders po ON po.id=parent.order_id WHERE parent.id=p.parent_id AND parent.product_id=p.product_id AND parent.mode=p.mode AND parent.hidden=0 AND (parent.order_id IS NULL OR (po.status='paid' AND pe.removed=0)))) AND (p.order_id IS NULL OR (o.status='paid' AND e.removed=0)) ORDER BY p.pinned DESC,p.created_at DESC LIMIT 250").bind(context.order.product_id,context.order.mode).all()).results:[];
 const visible=posts.filter(post=>channels.includes(String(post.channel)));
 const items=await Promise.all(visible.map(async post=>{
  const reactions=(await db.prepare('SELECT reaction,COUNT(*) count,SUM(CASE WHEN order_id=? THEN 1 ELSE 0 END) mine FROM product_community_reactions WHERE post_id=? GROUP BY reaction').bind(id,post.id).all()).results;
  const votes=(await db.prepare('SELECT option_index,COUNT(*) count,SUM(CASE WHEN order_id=? THEN 1 ELSE 0 END) mine FROM product_community_votes WHERE post_id=? GROUP BY option_index').bind(id,post.id).all()).results;
  return {id:String(post.id),channel:String(post.channel),parentId:post.parent_id?String(post.parent_id):null,name:String(post.name),body:String(post.body),pinned:!!post.pinned,createdAt:Number(post.created_at),mine:post.order_id===id,creator:post.order_id==null,scheduled:!!post.scheduled,poll:parseJson<string[]>(post.poll,[]),reactions:reactions.map(row=>({reaction:String(row.reaction),count:Number(row.count),mine:!!row.mine})),votes:votes.map(row=>({index:Number(row.option_index),count:Number(row.count),mine:!!row.mine}))};
 }));
 const members=ready?(await db.prepare("SELECT e.name,e.bio,e.role,e.cohort,e.order_id FROM product_enrollments e JOIN commerce_orders o ON o.id=e.order_id WHERE e.product_id=? AND e.mode=? AND e.removed=0 AND e.rules_accepted_at IS NOT NULL AND o.status='paid' ORDER BY e.name LIMIT 100").bind(context.order.product_id,context.order.mode).all()).results:[];
 const publication=await db.prepare('SELECT slug FROM product_builder_publications WHERE product_id=? AND owner=?').bind(context.order.product_id,context.order.owner).first(),steps=(config.onboarding?.steps||[]).map(step=>({...step,completed:context.done.has(step.id)}));
 return {welcome:context.welcome,rules:context.rules,requiresAgreement:config.requireAgreement,agreed:!!context.enrollment.rules_accepted_at,channels,allowMemberPosts:config.allowMemberPosts,moderator:canModerate(context),profile:{name:String(context.enrollment.name),bio:String(context.enrollment.bio)},posts:items,members:members.map(row=>({name:String(row.name),bio:String(row.bio),role:String(row.role),cohort:String(row.cohort),mine:row.order_id===id})),events:ready?config.events.filter(event=>communityTierAllows(context.snapshot,'event',event.id)).map(event=>({...event,url:safeStudentUrl(event.url)})):[],membership:tier?{id:tier.id,name:tier.name,billing:tier.billing,priceCents:tier.priceCents}:null,plans:communityPublicTiers(config),planUrl:publication?'/b/'+encodeURIComponent(String(publication.slug)):'',onboarding:{steps,introPrompt:config.onboarding?.introPrompt||'',introductionDone:context.done.has('introduction'),requireProfile:!!config.onboarding?.requireProfile,profileComplete:context.done.has('profile')}};
}
const actionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('agree')}),
 z.object({action:z.literal('profile'),name:z.string().trim().min(1).max(80),bio:z.string().trim().max(500)}),
 z.object({action:z.literal('onboarding'),stepId:z.string().uuid(),completed:z.boolean()}),
 z.object({action:z.literal('introduction'),body:z.string().trim().min(5).max(5000)}),
 z.object({action:z.literal('post'),channel:z.string().max(80),body:z.string().trim().min(1).max(5000),parentId:z.string().uuid().optional(),poll:z.array(z.string().trim().min(1).max(180)).max(8).default([])}),
 z.object({action:z.literal('delete'),postId:z.string().uuid()}),
 z.object({action:z.literal('react'),postId:z.string().uuid(),reaction:z.enum(['like','celebrate','helpful'])}),
 z.object({action:z.literal('vote'),postId:z.string().uuid(),option:z.number().int().min(0).max(7)}),
 z.object({action:z.literal('report'),postId:z.string().uuid(),reason:z.string().trim().min(5).max(1000)}),
 z.object({action:z.literal('moderate'),postId:z.string().uuid(),hidden:z.boolean(),pinned:z.boolean()}),
]);
export async function communityAction(req:Request,id:string,input:unknown){
 const value=actionSchema.parse(input);await assertStudentPurchaser(req,id);const context=await communityContext(req,id),db=database(),now=Date.now();
 if(value.action==='agree'){await db.prepare('UPDATE product_enrollments SET rules_accepted_at=?,updated_at=? WHERE order_id=?').bind(now,now,id).run();return communityState(req,id);}
 if(value.action==='profile'){await db.batch([db.prepare('UPDATE product_enrollments SET name=?,bio=?,updated_at=? WHERE order_id=?').bind(value.name,value.bio,now,id),db.prepare("INSERT INTO product_community_onboarding(order_id,step_id,completed_at) VALUES (?,'profile',?) ON CONFLICT(order_id,step_id) DO UPDATE SET completed_at=excluded.completed_at").bind(id,now)]);return communityState(req,id);}
 assertCommunityReady(context);
 if(value.action==='onboarding'){
  if(!context.config.onboarding?.steps.some(step=>step.id===value.stepId))throw new ApiError('Choose a step from your community welcome guide.');
  if(value.completed)await db.prepare('INSERT INTO product_community_onboarding(order_id,step_id,completed_at) VALUES (?,?,?) ON CONFLICT(order_id,step_id) DO UPDATE SET completed_at=excluded.completed_at').bind(id,value.stepId,now).run();else await db.prepare('DELETE FROM product_community_onboarding WHERE order_id=? AND step_id=?').bind(id,value.stepId).run();return communityState(req,id);
 }
 if(Number(context.enrollment.muted_until)>now)throw new ApiError('Posting is temporarily paused for your account.',403);
 if(value.action==='introduction'){
  if(!context.config.onboarding?.introPrompt)throw new ApiError('This community has no introduction step.');
  const channel=context.config.channels.find(item=>communityTierAllows(context.snapshot,'channel',item));if(!channel)throw new ApiError('Your plan has no community channel.',403);
  const postId=crypto.randomUUID();await db.batch([db.prepare("INSERT OR IGNORE INTO product_community_onboarding(order_id,step_id,completed_at,reference_id) VALUES (?,'introduction',?,?)").bind(id,now,postId),db.prepare("INSERT INTO product_community_posts(id,product_id,owner,mode,order_id,channel,name,body,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM product_community_onboarding WHERE order_id=? AND step_id='introduction' AND reference_id=?)").bind(postId,context.order.product_id,context.order.owner,context.order.mode,id,channel,context.enrollment.name,value.body,now,id,postId)]);return communityState(req,id);
 }
 if(value.action==='post'){
  if(!context.config.allowMemberPosts&&!canModerate(context))throw new ApiError('Only moderators can start posts here.',403);
  if(!context.config.channels.includes(value.channel)||!communityTierAllows(context.snapshot,'channel',value.channel))throw new ApiError('This channel is not included in your membership.',403);
  if(value.poll.length===1)throw new ApiError('A poll needs at least two choices.');
  if(value.parentId){const parent=await db.prepare('SELECT id,channel FROM product_community_posts WHERE id=? AND product_id=? AND mode=? AND parent_id IS NULL AND hidden=0').bind(value.parentId,context.order.product_id,context.order.mode).first();if(!parent||parent.channel!==value.channel)throw new ApiError('Discussion not found in this channel.',404);}
  const count=await db.prepare('SELECT COUNT(*) n FROM product_community_posts WHERE order_id=? AND created_at>?').bind(id,now-60000).first();if(Number(count?.n)>=5)throw new ApiError('Please wait a moment before posting again.',429);
  await db.prepare('INSERT INTO product_community_posts(id,product_id,owner,mode,order_id,channel,parent_id,name,body,poll,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),context.order.product_id,context.order.owner,context.order.mode,id,value.channel,value.parentId||null,context.enrollment.name,value.body,JSON.stringify(value.poll),now).run();
 }else{
  const post=await db.prepare('SELECT p.* FROM product_community_posts p WHERE p.id=? AND p.product_id=? AND p.mode=? AND p.hidden=0 AND (p.parent_id IS NULL OR EXISTS(SELECT 1 FROM product_community_posts parent WHERE parent.id=p.parent_id AND parent.hidden=0))').bind(value.postId,context.order.product_id,context.order.mode).first();
  if(!post||!communityTierAllows(context.snapshot,'channel',String(post.channel)))throw new ApiError('Discussion not found in your membership.',404);
  if(value.action==='delete'){if(post.order_id!==id&&!canModerate(context))throw new ApiError('You can remove your own posts.',403);await db.prepare('UPDATE product_community_posts SET hidden=1 WHERE id=? OR (parent_id=? AND product_id=? AND mode=?)').bind(value.postId,value.postId,context.order.product_id,context.order.mode).run();}
  if(value.action==='react'){const current=await db.prepare('SELECT post_id FROM product_community_reactions WHERE post_id=? AND order_id=? AND reaction=?').bind(value.postId,id,value.reaction).first();if(current)await db.prepare('DELETE FROM product_community_reactions WHERE post_id=? AND order_id=? AND reaction=?').bind(value.postId,id,value.reaction).run();else await db.prepare('INSERT INTO product_community_reactions(post_id,order_id,reaction) VALUES (?,?,?)').bind(value.postId,id,value.reaction).run();}
  if(value.action==='vote'){const options=parseJson<string[]>(post.poll,[]);if(!options[value.option])throw new ApiError('Choose one of the poll options.');await db.prepare('INSERT INTO product_community_votes(post_id,order_id,option_index) VALUES (?,?,?) ON CONFLICT(post_id,order_id) DO UPDATE SET option_index=excluded.option_index').bind(value.postId,id,value.option).run();}
  if(value.action==='report'){const existing=await db.prepare('SELECT id FROM product_community_reports WHERE order_id=? AND post_id=? AND resolved=0').bind(id,value.postId).first();if(!existing)await db.prepare('INSERT INTO product_community_reports(id,product_id,owner,mode,order_id,post_id,reason,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),context.order.product_id,context.order.owner,context.order.mode,id,value.postId,value.reason,now).run();}
  if(value.action==='moderate'){if(!canModerate(context))throw new ApiError('Only moderators can manage discussions.',403);await db.prepare('UPDATE product_community_posts SET hidden=?,pinned=? WHERE id=?').bind(value.hidden?1:0,value.pinned?1:0,value.postId).run();}
 }
 return communityState(req,id);
}

/** Native posts only: a unique schedule ledger makes retries and publication
 * edits safe. The explicit label never impersonates a member or a live author. */
export async function scheduleWeeklyCommunityPrompts(now=Date.now()){
 const mode=binding('STRIPE_MODE');if(mode!=='live'&&mode!=='test')return {posted:0};const db=database(),cursor=await db.prepare("SELECT last_product_id FROM product_community_schedule_cursor WHERE id='weekly'").first();
 const publications=(await db.prepare('SELECT product_id,owner,version,content_snapshot,published_at FROM product_builder_publications WHERE product_id>? ORDER BY product_id LIMIT 100').bind(String(cursor?.last_product_id||'')).all()).results;let posted=0;
 for(const publication of publications){
  const snapshot=parseJson<{studio?:ProductStudioConfig}>(publication.content_snapshot,{}),parsed=communityConfig.safeParse(snapshot.studio?.community||{});if(!parsed.success||!parsed.data.enabled)continue;
  for(const prompt of parsed.data.weeklyPrompts||[]){if(!prompt.enabled)continue;
   const parts=new Intl.DateTimeFormat('en-US',{timeZone:prompt.timezone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(now),part=(kind:string)=>parts.find(item=>item.type===kind)?.value||'',weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part('weekday'));
   if(weekday!==prompt.weekday||Number(part('hour'))<prompt.hour)continue;
   const localDate=Date.UTC(Number(part('year')),Number(part('month'))-1,Number(part('day'))),day=new Date(localDate-((weekday+6)%7)*86400000).toISOString().slice(0,10),postId=crypto.randomUUID(),saved=await db.batch([
    db.prepare('INSERT OR IGNORE INTO product_community_prompt_posts(product_id,owner,mode,prompt_id,local_day,post_id,publication_version,prompt_snapshot,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(publication.product_id,publication.owner,mode,prompt.id,day,postId,publication.version,JSON.stringify(prompt),now),
    db.prepare("INSERT INTO product_community_posts(id,product_id,owner,mode,channel,name,body,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM product_community_prompt_posts WHERE product_id=? AND mode=? AND prompt_id=? AND local_day=? AND post_id=?)").bind(postId,publication.product_id,publication.owner,mode,prompt.channel,'Scheduled community prompt',prompt.body,now,publication.product_id,mode,prompt.id,day,postId),
   ]);if(saved[1].meta.changes)posted++;
  }
 }
 await db.prepare("INSERT INTO product_community_schedule_cursor(id,last_product_id,updated_at) VALUES ('weekly',?,?) ON CONFLICT(id) DO UPDATE SET last_product_id=excluded.last_product_id,updated_at=excluded.updated_at").bind(publications.length===100?String(publications.at(-1)!.product_id):'',now).run();return {posted};
}

export function studentCalendar({id,title,description,startsAt,endsAt,url}:{id:string;title:string;description:string;startsAt:number;endsAt:number;url:string}){
 const escape=(text:string)=>text.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'),stamp=(time:number)=>new Date(time).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 return new Response(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FiveGen//Member calendar//EN','BEGIN:VEVENT',`UID:${escape(id)}@fivegen.ai`,`DTSTAMP:${stamp(Date.now())}`,`DTSTART:${stamp(startsAt)}`,`DTEND:${stamp(endsAt)}`,`SUMMARY:${escape(title)}`,`DESCRIPTION:${escape(description)}`,`LOCATION:${escape(url)}`,'END:VEVENT','END:VCALENDAR'].join('\r\n'),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename=event.ics','Cache-Control':'private, no-store'}});
}
export async function communityEventCalendar(req:Request,id:string,eventId:string){const context=await communityContext(req,id),event=context.config.events.find(event=>event.id===eventId);assertCommunityReady(context);if(!event||!communityTierAllows(context.snapshot,'event',eventId))throw new ApiError('Event not found in your membership.',404);return studentCalendar({id:`${context.order.product_id}-${event.id}`,title:event.title,description:event.description,startsAt:event.startsAt,endsAt:event.startsAt+event.durationMinutes*60000,url:safeStudentUrl(event.url)});}
