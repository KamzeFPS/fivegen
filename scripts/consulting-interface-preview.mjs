import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStorage} from '../runtime/render/storage.mjs';

// Compose the seven existing interfaces, then add two real service packages.
// This remains the base preview's isolated credential-free, provider-blocked
// runtime. Session state starts empty; local booking actions create real rows.
process.argv.push('--consulting-preview');
const {challengeInfo:info}=await import('./challenge-interface-preview.mjs');
assert.equal(info.synthetic,true);
const storage=createStorage(info.root),db=storage.sqlite,now=Date.now();
const preserved=['book','guide','playbook','mini-course','video-course','template-kit','challenge'].map(type=>[type,db.prepare('SELECT snapshot FROM product_builder_order_snapshots WHERE order_id=?').get(info.orderIds[type]).snapshot]);
const serviceSlots={},serviceSections={};
for(const type of ['consulting','coaching']){
 const coaching=type==='coaching',productId=info.productIds[type],orderId=info.orderIds[type],row=db.prepare('SELECT owner,data FROM product_builder_workspaces WHERE product_id=?').get(productId);assert.ok(row);
 assert.equal(db.prepare('SELECT COUNT(*) AS count FROM product_service_sessions WHERE product_id=?').get(productId).count,0,'No bookings are invented for the preview.');
 assert.equal(db.prepare('SELECT COUNT(*) AS count FROM commerce_bookings WHERE product_id=?').get(productId).count,0);
 const draft=JSON.parse(row.data),sessionCount=coaching?1:3,durationMinutes=45,timezone='Asia/Ulaanbaatar';
 draft.title=coaching?'Portfolio clarity session':'Portfolio & offer mentorship';
 draft.description=coaching?'One focused human coaching session to review a selected portfolio piece, clarify the story it tells and choose a practical next step.':'Three focused human mentorship sessions to clarify your service offer, review selected portfolio work and plan realistic next steps.';
 draft.audience='Independent designers and creators who want to explain their work clearly and choose a focused next step.';
 Object.assign(draft.fields,{
  outcome:coaching?'Leave with a clearer explanation of one portfolio piece and a short practical action plan.':'Leave with a clear service offer, useful feedback on selected work and practical next steps.',
  durationMinutes:String(durationMinutes),timezone,deliveryMode:'in_app',
  serviceScope:coaching?'1. Review one selected portfolio piece.\nDiscuss the intended audience, the problem it addresses and the choices you can explain.\n\n2. Clarify the story of the work.\nIdentify the information a prospective client would need to understand the piece.\n\n3. Choose one practical next step.\nWrite a focused revision or question to investigate. This session does not include creating the portfolio, guaranteed client leads or a promise of income.':'1. Clarify a focused service offer.\nDefine who you want to help, the problem you can address and a clear, practical offer using your actual experience.\n\n2. Review selected portfolio work.\nDiscuss what the chosen work demonstrates, what is unclear and how to describe its limits honestly.\n\n3. Plan a realistic next step.\nPrepare a small action plan based on your goals and current situation. Portfolio creation, legal advice, client introductions and guaranteed income are outside the package.',
  preparation:'- Bring one portfolio link or file you have permission to share.\n- Be clear about the audience you want to help.\n- Come with one question you would like to discuss.\n- Remove confidential information from any sample you share.',
  intakePrompt:coaching?'Which selected portfolio piece would you like to discuss, and what would make this session useful?':'What offer are you considering, and what would make the first session useful?',
  // Reserved example.test is deliberately not a working conference room.
  // Booking QA is local; no external meeting or provider is created.
  meetingUrl:`https://example.test/synthetic-preview/${type}`,
 });
 draft.studio={...draft.studio,service:{...draft.studio?.service,sessionCount,durationMinutes,timezone,bufferMinutes:15,cancellationHours:24,intakeQuestions:['Which portfolio piece would you like feedback on?','What audience do you want to help?'],meetingProvider:'manual',meetingUrl:draft.fields.meetingUrl,calendarSync:false,asyncMessaging:false,agreement:''}};
 const preparationId=randomUUID(),notesId=randomUUID();serviceSections[type]=[preparationId,notesId];
 draft.sections=[{id:preparationId,title:'Prepare for your first session',body:'Choose one project or piece of work and describe the situation it addresses. Bring a viewable link or a file you have permission to share. Remove confidential information.\n\nUse the preparation worksheet to identify one question, the useful outcome you want and any limits we should know about. You do not need to invent a client result or polish an entire portfolio before we meet.'},{id:notesId,title:'Keep a useful action plan',body:'After each session, record the points you actually discussed. Choose one small action, the reason it matters and a realistic time to review it.\n\nKeep assumptions separate from feedback you received. These notes are a blank resource; no session, client feedback or completed action is prefilled.'}];
 draft.files=[{name:'offer-worksheet.md',description:'A real editable preparation worksheet. No client answers are prefilled.',content:'# Prepare for your session\n\n## My selected work\nViewable link or file: \n\n## Audience\nWho am I trying to help?\n\n## Situation and problem\nWhat real task does this work address?\n\n## My current offer or explanation\n\n## My main question\n\n## What would make the session useful?\n\n## Permission and limits\nRemove confidential information and note what can be discussed.\n'},{name:'session-action-plan.md',description:'A blank action plan for your own notes after the session.',content:'# Session action plan\n\nSession date: \n\n## What we actually discussed\n- \n\n## Useful observations and feedback\n- \n\n## My next action\nWhat: \nWhy: \nWhen I will review it: \n\n## What remains uncertain\n- \n\n## Questions for the next conversation\n- \n'}];
 const benefits=coaching?['One focused 45-minute human coaching session','Preparation worksheet and a blank action plan','A private booking flow with real available times']:['Three focused 45-minute human mentorship sessions','Useful preparation, portfolio review and realistic next steps','A private booking flow and downloadable client resources'];
 const content={sections:draft.sections,files:draft.files,benefits,launch:''},delivery={title:draft.title,description:draft.description,format:coaching?'Coaching session':'Consulting / Mentorship',builderType:type,deliveryFamily:'service',sections:draft.sections,files:draft.files,uploadIds:draft.uploadIds,studio:draft.studio,serviceScope:draft.fields.serviceScope,preparation:draft.fields.preparation,intakePrompt:draft.fields.intakePrompt,meetingUrl:draft.fields.meetingUrl},publicData={title:draft.title,description:draft.description,audience:draft.audience,format:delivery.format,benefits,outline:draft.sections.map(section=>section.title),priceCents:draft.priceCents,currency:draft.currency,hasCover:false};
 db.prepare('UPDATE product_builder_workspaces SET data=? WHERE product_id=? AND owner=?').run(JSON.stringify(draft),productId,row.owner);
 db.prepare("UPDATE products SET title=?,description=?,audience=?,content=?,status='published' WHERE id=? AND owner=?").run(draft.title,draft.description,draft.audience,JSON.stringify(content),productId,row.owner);
 db.prepare('INSERT INTO product_builder_publications(product_id,owner,version,slug,public_snapshot,content_snapshot,upload_ids,published_at,updated_at) VALUES(?,?,1,?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET public_snapshot=excluded.public_snapshot,content_snapshot=excluded.content_snapshot,upload_ids=excluded.upload_ids,updated_at=excluded.updated_at').run(productId,row.owner,type+'-preview',JSON.stringify(publicData),JSON.stringify(delivery),JSON.stringify(draft.uploadIds),now,now);
 db.prepare('UPDATE product_builder_order_snapshots SET snapshot=? WHERE order_id=?').run(JSON.stringify(delivery),orderId);db.prepare('UPDATE commerce_orders SET title=? WHERE id=?').run(draft.title,orderId);
 // Replace only these fresh, unbooked base-fixture times. Every offered time
 // is an actual commerce_slots row, not a static count or a recurring pattern.
 db.prepare('DELETE FROM commerce_slots WHERE product_id=? AND owner=?').run(productId,row.owner);
 serviceSlots[type]=[];
 const hour=Math.ceil(now/3600000)*3600000;
 for(let index=0;index<(coaching?2:4);index++){
  const id=randomUUID(),startsAt=hour+((coaching?10:3)+index*2)*86400000,endsAt=startsAt+durationMinutes*60000;
  db.prepare('INSERT INTO commerce_slots(id,owner,product_id,starts_at,ends_at) VALUES(?,?,?,?,?)').run(id,row.owner,productId,startsAt,endsAt);serviceSlots[type].push({id,startsAt,endsAt});
 }
 assert.equal(serviceSlots[type].length,coaching?2:4);assert.equal(delivery.studio.service.sessionCount,sessionCount);assert.equal(delivery.studio.service.durationMinutes,45);assert.equal(delivery.studio.service.timezone,'Asia/Ulaanbaatar');
 assert.ok(delivery.files.every(file=>file.content.trim().startsWith('#')));assert.equal(db.prepare('SELECT COUNT(*) AS count FROM product_service_sessions WHERE product_id=?').get(productId).count,0);
}
for(const [type,snapshot] of preserved)assert.equal(db.prepare('SELECT snapshot FROM product_builder_order_snapshots WHERE order_id=?').get(info.orderIds[type]).snapshot,snapshot,'The '+type+' purchase remains frozen and unchanged.');
storage.close();
export const consultingInfo={...info,consultingURL:`http://localhost:5198/build/${info.productIds.consulting}?area=content`,consultingReaderURL:info.customerURLs.consulting,coachingURL:`http://localhost:5198/build/${info.productIds.coaching}?area=content`,coachingReaderURL:info.customerURLs.coaching,serviceSlots,serviceSections,note:'Isolated nine-interface preview. Consulting has 3×45-minute sessions; Coaching has 1×45. Both have real editable preparation notes/files, canonical buyer timezone metadata and actual future slot rows. Sessions, messages and feedback start empty. Reserved example.test links are not real meeting rooms; all provider calls remain blocked. Seven preceding purchases stay frozen.'};
writeFileSync(resolve(info.root,'consulting-preview-info.json'),JSON.stringify(consultingInfo,null,2));
if(!process.argv.includes('--community-preview'))console.log(JSON.stringify({root:consultingInfo.root,entryURL:consultingInfo.entryURL,consultingURL:consultingInfo.consultingURL,consultingReaderURL:consultingInfo.consultingReaderURL,coachingURL:consultingInfo.coachingURL,coachingReaderURL:consultingInfo.coachingReaderURL,challengeURL:consultingInfo.challengeURL,challengeReaderURL:consultingInfo.challengeReaderURL,templateKitURL:consultingInfo.templateKitURL,templateKitReaderURL:consultingInfo.templateKitReaderURL,fullURL:consultingInfo.fullURL,fullReaderURL:consultingInfo.fullReaderURL,miniCourseURL:consultingInfo.miniCourseURL,miniCourseReaderURL:consultingInfo.miniCourseReaderURL,playbookURL:consultingInfo.playbookURL,playbookReaderURL:consultingInfo.playbookReaderURL,guideURL:consultingInfo.guideURL,guideReaderURL:consultingInfo.guideReaderURL,bookURL:consultingInfo.bookURL,bookReaderURL:consultingInfo.bookReaderURL,note:consultingInfo.note}));
