import {z} from 'zod';
import {binding,database} from './server';
import {builderOrderDelivery} from './builder-delivery-server';
import {sendTransactionalEmail,transactionalEmailConfiguration,type TransactionalEmail} from './messaging';
import {parseJson,assertStudentPurchaser} from './product-learning-server';
import {scheduleWeeklyCommunityPrompts} from './product-community-server';
import {queueProductPushReminder,dispatchProductPush} from './product-push-server';

const canonicalOrigin=()=>{try{const url=new URL(binding('APP_ORIGIN'));return url.protocol==='https:'||binding('STRIPE_MODE')!=='live'&&['localhost','127.0.0.1'].includes(url.hostname)?url.origin:'';}catch{return '';}};
const plain=(value:unknown)=>String(value).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,200);
export async function productReminderPreferences(req:Request,id:string){await assertStudentPurchaser(req,id);const row=await database().prepare('SELECT * FROM product_notification_preferences WHERE order_id=?').bind(id).first(),config=await transactionalEmailConfiguration();return {enabled:!!row?.enabled,configured:config.ready,timezoneOffset:Number(row?.timezone_offset||0)};}
export async function setProductReminderPreferences(req:Request,id:string,input:unknown){await assertStudentPurchaser(req,id);const value=z.object({enabled:z.boolean(),timezoneOffset:z.number().int().min(-840).max(840)}).parse(input);await database().prepare('INSERT INTO product_notification_preferences(order_id,enabled,timezone_offset,updated_at) VALUES (?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET enabled=excluded.enabled,timezone_offset=excluded.timezone_offset,updated_at=excluded.updated_at').bind(id,value.enabled?1:0,value.timezoneOffset,Date.now()).run();if(!value.enabled)await database().prepare("UPDATE product_reminder_jobs SET status='cancelled',lease=0 WHERE order_id=? AND kind!='update' AND status IN ('pending','sending')").bind(id).run();await scheduleProductReminders();return productReminderPreferences(req,id);}
async function queue(order:Record<string,unknown>,kind:string,reference:string,subject:string,body:string,dueAt:number,identity=reference){
 const id=`${kind}:${String(order.id)}:${identity}`;
 await database().prepare(`INSERT INTO product_reminder_jobs(id,order_id,product_id,owner,mode,recipient,kind,reference_id,subject,body,due_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,due_at=excluded.due_at WHERE product_reminder_jobs.status='cancelled' AND product_reminder_jobs.first_attempt_at IS NULL`).bind(id,order.id,order.product_id,order.owner,order.mode,order.email,kind,reference,plain(subject),body.slice(0,10000),dueAt,order.mode==='live'?'pending':'suppressed',Date.now()).run();
 await queueProductPushReminder(id,String(order.id),dueAt);
}
export async function scheduleProductReminders(){
 await scheduleWeeklyCommunityPrompts();
 const db=database(),now=Date.now(),cursor=await db.prepare("SELECT last_order_id FROM product_reminder_schedule_cursor WHERE id='preferences'").first(),rows=(await db.prepare("SELECT o.*,p.timezone_offset,e.started_at FROM product_notification_preferences p JOIN commerce_orders o ON o.id=p.order_id LEFT JOIN product_enrollments e ON e.order_id=o.id WHERE (p.enabled=1 OR EXISTS(SELECT 1 FROM product_push_subscriptions push WHERE push.order_id=o.id AND push.enabled=1)) AND o.status='paid' AND (e.removed IS NULL OR e.removed=0) AND o.id>? ORDER BY o.id LIMIT 100").bind(String(cursor?.last_order_id||'')).all()).results;
 for(const order of rows){
  const snapshot=await builderOrderDelivery(String(order.id));if(!snapshot)continue;
  const studio=snapshot.studio||{},learning=snapshot.deliveryFamily==='challenge'?studio.challenge?.learning:studio.course?.learning;
  if(['challenge','course'].includes(snapshot.deliveryFamily)){
   const offset=Number(order.timezone_offset||0)*60000,localDay=Math.floor((now-offset)/86400000)*86400000+offset,completed=(await db.prepare('SELECT section_id FROM product_learning_progress WHERE order_id=? AND completed_at IS NOT NULL').bind(order.id).all()).results.map(row=>String(row.section_id));
   const next=snapshot.sections.find((section,index)=>!completed.includes(section.id||`section-${index}`)&&(section.studio?.prerequisiteIds||[]).every(id=>completed.includes(id))&&(!learning?.requirePrevious||index===0||completed.includes(snapshot.sections[index-1].id||`section-${index-1}`)));
   if(next){const index=snapshot.sections.indexOf(next),startedAt=Number(order.started_at)||Number(order.paid_at),base=Math.max(Number(learning?.startAt)||startedAt,0),release=learning?.release==='daily'?base+index*Math.max(1,Number(learning.intervalDays)||1)*86400000:learning?.release==='date'?base:0,availableAt=Math.max(release,Number(next.studio?.unlockAt)||0,Number(next.studio?.dripDays||0)>0?startedAt+Number(next.studio?.dripDays)*86400000:0),due=Math.max(availableAt,localDay+9*3600000);
    if(due>=now-12*3600000&&due<=now+86400000)await queue(order,'learning',new Date(localDay-offset).toISOString().slice(0,10),`Your next step in ${order.title}`,`Make a little time for ${next.title}.\n\nOpen your purchase to continue where you left off.`,Math.max(due,now));
   }
  }
  const sessions=(await db.prepare("SELECT id,starts_at FROM product_service_sessions WHERE order_id=? AND status='confirmed' AND starts_at>? AND starts_at<?").bind(order.id,now,now+366*86400000).all()).results;
  for(const session of sessions)await queue(order,'session',String(session.id),`Your session is coming up: ${order.title}`,`Your session starts ${new Date(Number(session.starts_at)).toUTCString()}.\n\nOpen your client space for your preparation and private meeting link.`,Math.max(now,Number(session.starts_at)-24*3600000),String(session.id)+':'+String(session.starts_at));
 }
 await db.prepare("INSERT INTO product_reminder_schedule_cursor(id,last_order_id,updated_at) VALUES ('preferences',?,?) ON CONFLICT(id) DO UPDATE SET last_order_id=excluded.last_order_id,updated_at=excluded.updated_at").bind(rows.length===100?String(rows.at(-1)!.id):'',now).run();
 // An update is transactional product delivery, never promotional content.
 // Only existing buyers of an earlier saved version receive this notification.
 const updated=(await db.prepare(`SELECT o.*,p.version,p.content_snapshot FROM commerce_orders o JOIN product_builder_order_snapshots s ON s.order_id=o.id JOIN product_builder_publications p ON p.product_id=o.product_id AND p.owner=o.owner WHERE o.status='paid' AND s.publication_version<p.version AND json_extract(p.content_snapshot,'$.studio.templates.notifyBuyers')=1 AND NOT EXISTS(SELECT 1 FROM product_subscription_renewals r WHERE r.order_id=o.id) AND NOT EXISTS(SELECT 1 FROM product_reminder_jobs j WHERE j.id='update:'||o.id||':'||p.version) ORDER BY p.updated_at DESC LIMIT 100`).all()).results;
 for(const order of updated){const snapshot=parseJson<{studio?:{templates?:{releaseNotes?:string}}}>(order.content_snapshot,{});await queue(order,'update',String(order.version),`${order.title} has an update`,String(snapshot.studio?.templates?.releaseNotes||'Your creator has published an updated version. Open your purchase for your included resources.'),now);}
}
async function eligible(row:Record<string,unknown>){
 const order=await database().prepare("SELECT id FROM commerce_orders WHERE id=? AND owner=? AND product_id=? AND mode='live' AND status='paid' AND email=? AND NOT EXISTS(SELECT 1 FROM commerce_revocations r WHERE r.account_id=commerce_orders.account_id AND r.mode=commerce_orders.mode AND r.payment_intent=commerce_orders.payment_intent)").bind(row.order_id,row.owner,row.product_id,row.recipient).first();if(!order)return false;
 const subscriptions=(await database().prepare("SELECT status,period_end FROM product_commerce_intents WHERE pricing_model='subscription' AND (order_id=? OR order_id IN(SELECT parent_order_id FROM product_bundle_entitlements WHERE order_id=?))").bind(row.order_id,row.order_id).all()).results;if(subscriptions.some(subscription=>!['active','trialing'].includes(String(subscription.status))||Number(subscription.period_end||0)<=Date.now()))return false;
 const member=await database().prepare('SELECT removed FROM product_enrollments WHERE order_id=?').bind(row.order_id).first();if(member?.removed)return false;
 if(row.kind!=='update'){const preference=await database().prepare('SELECT enabled FROM product_notification_preferences WHERE order_id=?').bind(row.order_id).first();if(!preference?.enabled)return false;}
 if(row.kind==='session'){const session=await database().prepare("SELECT id FROM product_service_sessions WHERE id=? AND order_id=? AND status='confirmed' AND starts_at>?").bind(row.reference_id,row.order_id,Date.now()).first();if(!session)return false;}
 if(row.kind==='learning'){const snapshot=await builderOrderDelivery(String(row.order_id)),completed=(await database().prepare('SELECT section_id FROM product_learning_progress WHERE order_id=? AND completed_at IS NOT NULL').bind(row.order_id).all()).results.map(item=>String(item.section_id));if(!snapshot?.sections.some((section,index)=>!completed.includes(section.id||`section-${index}`)))return false;}
 return true;
}
export async function dispatchProductReminders(limit=3){
 await scheduleProductReminders();const push=await dispatchProductPush();const configuration=await transactionalEmailConfiguration(),origin=canonicalOrigin();if(!configuration.ready||!origin||binding('STRIPE_MODE')!=='live')return {processed:0,sent:0,push,message:'Reminder delivery needs a verified sender, canonical origin, and live payments.'};
 const now=Date.now(),candidates=(await database().prepare("SELECT id FROM product_reminder_jobs WHERE mode='live' AND due_at<=? AND (status='pending' OR (status='sending' AND lease<?)) ORDER BY due_at LIMIT ?").bind(now,now,Math.min(5,Math.max(1,limit))).all()).results;let sent=0,processed=0;
 for(const candidate of candidates){const lease=Date.now()+60000,claim=await database().prepare("UPDATE product_reminder_jobs SET status='sending',lease=? WHERE id=? AND (status='pending' OR (status='sending' AND lease<?))").bind(lease,candidate.id,Date.now()).run();if(!claim.meta.changes)continue;processed++;
  const row=await database().prepare('SELECT * FROM product_reminder_jobs WHERE id=? AND lease=?').bind(candidate.id,lease).first();if(!row)continue;
  const finish=async(status:string,error:string)=>database().prepare('UPDATE product_reminder_jobs SET status=?,error=?,lease=0 WHERE id=? AND lease=?').bind(status,error,row.id,lease).run();
  if(!await eligible(row)){await finish('cancelled','The purchase or reminder preference is no longer active.');continue;}
  if(row.first_attempt_at&&Date.now()-Number(row.first_attempt_at)>23*3600000){await finish('failed','Delivery could not be confirmed within the safe retry window.');continue;}
  const path='/customer?order='+encodeURIComponent(String(row.order_id)),url=origin+path,text=String(row.body)+'\n\nOpen your purchase: '+url+'\n\nYou can change reminders in your private product. This message does not subscribe you to marketing.';
  const payload:TransactionalEmail=row.payload?parseJson<TransactionalEmail>(row.payload,{from:'',to:[],subject:'',text:'',html:''}):{from:configuration.from,to:[String(row.recipient)],subject:String(row.subject),text,html:''};
  if(!payload.from||!payload.to.length){await finish('failed','The saved reminder needs review.');continue;}
  await database().prepare('UPDATE product_reminder_jobs SET payload=?,attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?) WHERE id=? AND lease=?').bind(JSON.stringify(payload),Date.now(),row.id,lease).run();
  const result=await sendTransactionalEmail(payload,'fivegen-product/'+String(row.id),()=>eligible(row));
  if(result.sent){await database().prepare("UPDATE product_reminder_jobs SET status='sent',lease=0,sent_at=?,provider_id=?,error='' WHERE id=? AND lease=?").bind(Date.now(),result.providerId||'',row.id,lease).run();sent++;}
  else if(result.cancelled)await finish('cancelled',result.message);
  else if(result.retryable&&Number(row.attempts)<5)await database().prepare("UPDATE product_reminder_jobs SET status='pending',lease=0,due_at=?,error=? WHERE id=? AND lease=?").bind(Date.now()+Math.min(3600000,30000*2**Number(row.attempts)),result.message,row.id,lease).run();
  else await finish('failed',result.message);
 }
 return {processed,sent,push};
}
