import {ApiError,database} from './server';
import {serviceAccessToken,serviceIntegrationStatus,type ServiceProvider} from './service-integrations-oauth';

type RemoteData=Record<string,unknown>;
async function serviceProviderRequest(owner:string,provider:ServiceProvider,path:string,method='GET',body?:unknown,allowMissing=false):Promise<RemoteData>{
 const token=await serviceAccessToken(owner,provider);let response:Response;
 try{response=await fetch((provider==='google'?'https://www.googleapis.com/calendar/v3':'https://api.zoom.us/v2')+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw new ApiError('The provider did not confirm the request. Sync will retry safely.',502);}
 if(allowMissing&&[404,410].includes(response.status))return {missing:true};
 if(response.status===409)return {conflict:true};
 if(!response.ok){if(response.status===401)await database().prepare("UPDATE service_connections SET status='reconnect',error='Authorization expired. Connect again.',updated_at=? WHERE owner=? AND provider=?").bind(Date.now(),owner,provider).run();throw Object.assign(new ApiError(response.status===401?'Reconnect the provider to continue syncing.':response.status===429?'The provider is busy. Sync will retry shortly.':'The provider could not sync this booking.',response.status===401?409:response.status===429||response.status>=500?503:422),{providerStatus:response.status});}
 return response.status===204?{}:await response.json() as RemoteData;
}
export async function serviceExternalAvailability(owner:string,mode:string,slots:{id:string;startsAt:number;endsAt:number}[],bufferMinutes=0){
 if(mode!=='live'||!slots.length)return slots;
 const connection=await database().prepare("SELECT status FROM service_connections WHERE owner=? AND provider='google'").bind(owner).first();if(!connection)return slots;if(connection.status!=='connected')throw new ApiError('Calendar authorization needs attention before this creator can accept bookings.',503);
 const buffer=bufferMinutes*60000,timeMin=Math.min(...slots.map(slot=>slot.startsAt))-buffer,timeMax=Math.max(...slots.map(slot=>slot.endsAt))+buffer;
 const result=await serviceProviderRequest(owner,'google','/freeBusy','POST',{timeMin:new Date(timeMin).toISOString(),timeMax:new Date(timeMax).toISOString(),items:[{id:'primary'}]}),calendars=result.calendars as Record<string,{busy?:{start:string;end:string}[];errors?:unknown[]}>|undefined,calendar=calendars?.primary;
 if(!calendar||calendar.errors?.length||!Array.isArray(calendar.busy))throw new ApiError('Calendar availability could not be checked. Try again shortly.',503);
 const busy=calendar.busy.map(item=>({start:Date.parse(item.start),end:Date.parse(item.end)}));if(busy.some(item=>!Number.isFinite(item.start)||!Number.isFinite(item.end)||item.end<=item.start))throw new ApiError('Calendar availability could not be checked.',503);
 return slots.filter(slot=>!busy.some(item=>item.start<slot.endsAt+buffer&&item.end>slot.startsAt-buffer));
}
export async function requireServiceProviders(owner:string,mode:string,config:{meetingProvider?:string;calendarSync?:boolean}){
 if(mode!=='live')return;
 await assertServiceIntegrationReady(owner,config);
}
/** Selling readiness is local-only, including when reviewing test-mode offers. */
export async function assertServiceIntegrationReady(owner:string,config:{meetingProvider?:string;calendarSync?:boolean}){
 const required=[...(config.meetingProvider==='zoom'?['zoom']:[]),...(config.meetingProvider==='google-meet'||config.calendarSync?['google']:[])];if(!required.length)return;
 const status=await serviceIntegrationStatus(owner);for(const provider of required){const row=status.providers.find(row=>row.provider===provider);if(!row?.configured)throw new ApiError((provider==='google'?'Google Calendar / Meet':'Zoom')+' needs administrator setup before this service can be sold.',503);if(!row.connected)throw new ApiError('Connect '+(provider==='google'?'Google Calendar':'Zoom')+' in the service settings before accepting bookings.',409);}
}
export async function queueServiceSessionSync(sessionId:string,config:{meetingProvider?:string;calendarSync?:boolean}){
 const session=await database().prepare('SELECT owner,mode FROM product_service_sessions WHERE id=?').bind(sessionId).first();if(!session||session.mode!=='live')return;
 const existing=(await database().prepare('SELECT provider FROM service_sync_jobs WHERE session_id=?').bind(sessionId).all()).results.map(row=>String(row.provider)),providers=new Set([...existing,...(config.meetingProvider==='zoom'?['zoom']:[]),...(config.meetingProvider==='google-meet'||config.calendarSync?['google']:[])]);
 for(const provider of providers)await database().prepare("INSERT INTO service_sync_jobs(id,session_id,owner,mode,provider,due_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(session_id,provider) DO UPDATE SET revision=revision+1,status='pending',attempts=0,due_at=excluded.due_at,error='',updated_at=excluded.updated_at").bind(sessionId+':'+provider,sessionId,session.owner,session.mode,provider,Date.now(),Date.now()).run();
}
export async function serviceSessionSyncStatuses(orderId:string){const rows=(await database().prepare('SELECT j.session_id,j.provider,j.status,j.error FROM service_sync_jobs j JOIN product_service_sessions s ON s.id=j.session_id WHERE s.order_id=? ORDER BY j.provider LIMIT 200').bind(orderId).all()).results;return rows.map(row=>({sessionId:String(row.session_id),provider:String(row.provider),status:String(row.status),error:String(row.error)}));}
function meetingLink(value:unknown,provider:'google'|'zoom'){if(typeof value!=='string')return '';try{const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password&&(provider==='google'?url.hostname==='meet.google.com':url.hostname==='zoom.us'||url.hostname.endsWith('.zoom.us')))return url.href;}catch{}return '';}
async function syncRemoteSession(job:Record<string,unknown>,session:Record<string,unknown>){
 const owner=String(job.owner),provider=job.provider as ServiceProvider,remoteId=String(job.remote_id||''),cancelled=session.status==='cancelled';
 if(cancelled){let cancelledId=remoteId|| (provider==='google'?'fg'+String(session.id).replace(/-/g,''):'');
  if(provider==='zoom'&&!cancelledId&&Number(job.create_started_at)>0){let page='';for(let index=0;index<10;index++){const list=await serviceProviderRequest(owner,'zoom','/users/me/meetings?type=scheduled&page_size=100'+(page?'&next_page_token='+encodeURIComponent(page):'')),meetings=list.meetings as RemoteData[]|undefined;if(!Array.isArray(meetings))throw new ApiError('Zoom cancellation could not be confirmed yet.',503);const match=meetings.find(item=>item.topic==='FiveGen session '+String(session.id));if(match){cancelledId=String(match.id);break;}page=String(list.next_page_token||'');if(!page)break;}if(!cancelledId)throw new ApiError('The earlier Zoom request is still being reconciled before cancellation can be confirmed.',503);}
  if(cancelledId)await serviceProviderRequest(owner,provider,provider==='google'?`/calendars/primary/events/${encodeURIComponent(cancelledId)}`:`/meetings/${encodeURIComponent(cancelledId)}`,'DELETE',undefined,true);return {remoteId:cancelledId,meetingUrl:''};}
 const startsAt=new Date(Number(session.starts_at)).toISOString(),endsAt=new Date(Number(session.ends_at)).toISOString(),topic='FiveGen session '+String(session.id),body={summary:'Your FiveGen session',description:'Your private session details and preparation are available in your FiveGen client space.',start:{dateTime:startsAt},end:{dateTime:endsAt},visibility:'private',guestsCanInviteOthers:false,guestsCanSeeOtherGuests:false};
 if(provider==='google'){
  const snapshot=await database().prepare('SELECT snapshot FROM product_builder_order_snapshots WHERE order_id=?').bind(session.order_id).first(),studio=JSON.parse(String(snapshot?.snapshot||'{}')).studio||{},meet=studio.service?.meetingProvider==='google-meet',eventId=remoteId||'fg'+String(session.id).replace(/-/g,'');
  const data={...body,...(meet?{conferenceData:{createRequest:{requestId:eventId,conferenceSolutionKey:{type:'hangoutsMeet'}}}}:{location:String(session.meeting_url||'')})};
  let event:RemoteData;if(remoteId)event=await serviceProviderRequest(owner,'google',`/calendars/primary/events/${eventId}?conferenceDataVersion=1&sendUpdates=none`,'PATCH',data);else{event=await serviceProviderRequest(owner,'google','/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none','POST',{...data,id:eventId});if(event.conflict)event=await serviceProviderRequest(owner,'google',`/calendars/primary/events/${eventId}`);}
  await database().prepare('UPDATE service_sync_jobs SET remote_id=? WHERE id=?').bind(eventId,job.id).run();
  const conference=event.conferenceData as {createRequest?:{status?:{statusCode?:string}};entryPoints?:{entryPointType:string;uri:string}[]}|undefined,url=meetingLink(event.hangoutLink||conference?.entryPoints?.find(point=>point.entryPointType==='video')?.uri,'google');
  if(meet&&!url){if(conference?.createRequest?.status?.statusCode==='failure')throw new ApiError('Google could not create this meeting. The creator needs to check Google Meet access.',422);throw new ApiError('Google Meet is still preparing this meeting. Sync will check again.',503);}
  return {remoteId:eventId,meetingUrl:url};
 }
 const details={topic,type:2,start_time:startsAt,duration:Math.max(1,Math.ceil((Number(session.ends_at)-Number(session.starts_at))/60000)),timezone:'UTC',settings:{waiting_room:true,join_before_host:false}};
 if(remoteId){await serviceProviderRequest(owner,'zoom',`/meetings/${encodeURIComponent(remoteId)}`,'PATCH',details);const event=await serviceProviderRequest(owner,'zoom',`/meetings/${encodeURIComponent(remoteId)}`);return {remoteId,meetingUrl:meetingLink(event.join_url,'zoom')};}
 // Zoom has no meeting-create idempotency key. Reconcile an ambiguous create by
 // its unique topic; never blindly create a second meeting after a lost reply.
 let page='',found:RemoteData|undefined;
 for(let index=0;index<10;index++){const list=await serviceProviderRequest(owner,'zoom','/users/me/meetings?type=scheduled&page_size=100'+(page?'&next_page_token='+encodeURIComponent(page):'')),meetings=list.meetings as RemoteData[]|undefined;if(!Array.isArray(meetings))throw new ApiError('Zoom could not reconcile this meeting.',503);found=meetings.find(item=>item.topic===topic);if(found)break;page=String(list.next_page_token||'');if(!page)break;}
 if(page&&!found)throw new ApiError('Zoom has too many meetings to reconcile safely. Contact the creator.',422);
 let event:RemoteData;if(found){event=await serviceProviderRequest(owner,'zoom',`/meetings/${encodeURIComponent(String(found.id))}`);}else{
  if(Number(job.create_started_at)>0)throw new ApiError('Zoom has not confirmed the earlier create request. Reconciliation will retry without creating a duplicate.',503);
  await database().prepare('UPDATE service_sync_jobs SET create_started_at=? WHERE id=?').bind(Date.now(),job.id).run();try{event=await serviceProviderRequest(owner,'zoom','/users/me/meetings','POST',details);}catch(error){if(error instanceof ApiError&&'providerStatus' in error&&[400,401,403,422,429].includes(Number(error.providerStatus)))await database().prepare('UPDATE service_sync_jobs SET create_started_at=0 WHERE id=?').bind(job.id).run();throw error;}
 }
 const id=String(event.id||'');if(!/^\d{5,20}$/.test(id))throw new ApiError('Zoom did not confirm a valid meeting identity.',503);await database().prepare('UPDATE service_sync_jobs SET remote_id=? WHERE id=?').bind(id,job.id).run();return {remoteId:id,meetingUrl:meetingLink(event.join_url,'zoom')};
}
export async function dispatchServiceIntegrations(limit=5){
 const db=database(),now=Date.now();await db.prepare("UPDATE service_sync_jobs SET status='pending',revision=revision+1,due_at=?,error='' WHERE status='synced' AND EXISTS(SELECT 1 FROM product_service_sessions s JOIN commerce_orders o ON o.id=s.order_id WHERE s.id=service_sync_jobs.session_id AND (s.status='cancelled' OR o.status!='paid'))").bind(now).run();const jobs=(await db.prepare("SELECT id FROM service_sync_jobs WHERE mode='live' AND due_at<=? AND (status IN('pending','retry','syncing') AND lease<?) ORDER BY provider DESC,due_at LIMIT ?").bind(now,now,Math.min(10,Math.max(1,limit))).all()).results;let synced=0;
 for(const candidate of jobs){const lease=Date.now()+300000,claim=await db.prepare("UPDATE service_sync_jobs SET status='syncing',lease=? WHERE id=? AND status IN('pending','retry','syncing') AND lease<?").bind(lease,candidate.id,Date.now()).run();if(!claim.meta.changes)continue;
  const job=await db.prepare('SELECT * FROM service_sync_jobs WHERE id=? AND lease=?').bind(candidate.id,lease).first();if(!job)continue;const session=await db.prepare('SELECT s.*,o.status order_status FROM product_service_sessions s JOIN commerce_orders o ON o.id=s.order_id WHERE s.id=? AND s.owner=? AND s.mode=?').bind(job.session_id,job.owner,job.mode).first();
  try{if(!session)throw new ApiError('The booking no longer exists.',422);if(session.order_status!=='paid')session.status='cancelled';const result=await syncRemoteSession(job,session);
   if(result.meetingUrl&&session.status!=='cancelled')await db.prepare("UPDATE product_service_sessions SET meeting_url=? WHERE id=? AND status='confirmed'").bind(result.meetingUrl,session.id).run();
   await db.prepare("UPDATE service_sync_jobs SET status=?,lease=0,error='',remote_id=?,meeting_url=?,updated_at=? WHERE id=? AND lease=? AND revision=?").bind(session.status==='cancelled'?'cancelled':'synced',result.remoteId,result.meetingUrl,Date.now(),job.id,lease,job.revision).run();synced++;
   if(job.provider==='zoom'){const calendar=await db.prepare("SELECT id FROM service_sync_jobs WHERE session_id=? AND provider='google' AND status='synced'").bind(job.session_id).first();if(calendar)await db.prepare("UPDATE service_sync_jobs SET status='pending',due_at=?,revision=revision+1 WHERE id=?").bind(Date.now(),calendar.id).run();}
  }catch(error){const retry=!(error instanceof ApiError)||[502,503].includes(error.status),attempts=Number(job.attempts)+1;await db.prepare('UPDATE service_sync_jobs SET status=?,attempts=?,lease=0,due_at=?,error=?,updated_at=? WHERE id=? AND lease=? AND revision=?').bind(retry&&attempts<10?'retry':error instanceof ApiError&&error.status===409?'reconnect':'failed',attempts,Date.now()+Math.min(3600000,30000*2**Math.min(attempts,6)),error instanceof ApiError?error.message:'The provider could not sync this booking.',Date.now(),job.id,lease,job.revision).run();}finally{await db.prepare('UPDATE service_sync_jobs SET lease=0 WHERE id=? AND lease=? AND revision<>?').bind(job.id,lease,job.revision).run();}
 }
 return {processed:jobs.length,synced};
}
