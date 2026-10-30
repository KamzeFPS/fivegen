import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {createStorage} from '../runtime/render/storage.mjs';
import {textCredits} from '../lib/credit-policy.ts';

const root=resolve('outputs/workspace-assistant-planning-qa',randomUUID()),storage=createStorage(root),sql=storage.sqlite;
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
let owner='assistant-owner',calls=0,reserved=0,refunded=0,fail=false,hold=null,lastInput,lastSystem,lastRequestBytes=0,unlimited=false,ready=true;
const productPlan=()=>({title:'Illustrator handoff kit',summary:'Write a useful first draft, review it, then prepare the launch copy.',assumptions:['This is an editable written draft.'],steps:[{
 id:'write-guide',title:'Write the handoff guide',description:'Create a written guide with a clear client handoff checklist and a reusable delivery email.',why:'A concrete first draft gives you something to test with clients before making a sales page.',needs:['Your preferred handoff process, if you already have one.'],action:{type:'create_product',title:'Illustrator handoff kit',description:'A practical written handoff guide for illustrators finishing their first client project.',audience:'New independent illustrators',format:'Guide',language:'English',sections:[{title:'Deliver the final files',body:'Confirm the approved artwork, agreed formats and delivery date. Put the approved files in clearly named folders. Include a short readme describing each format and the agreed usage rights.'},{title:'Handoff email',body:'Subject: Your completed artwork\n\nHere are the approved final files, grouped by format. Please confirm that you can open them. The readme lists the agreed usage rights and the contact details for any delivery questions.'}]}
 },{id:'draft-announcement',title:'Draft a launch announcement',description:'Prepare editable announcement copy linked to the draft product.',why:'Review the positioning and copy before posting publicly.',needs:['Review the saved guide.'],action:{type:'create_campaign',productId:null,productStepId:'write-guide',title:'Handoff kit announcement',goal:'Explain the useful contents honestly.',items:[{channel:'social',title:'Instagram announcement',body:'Finishing your first illustration project? This handoff kit gives you a final-file checklist and a delivery email you can adapt to your client.',subject:''}]}}
 ]});
let output={answer:'Hello! What would you like to talk about?',questions:[],plan:null};
const deps={z,zodToJsonSchema,ApiError,textCredits,database:()=>storage.DB,identity:async()=>({userId:owner}),sameOrigin:req=>{if(req.headers.get('origin')!==new URL(req.url).origin)throw new ApiError('Origin rejected',403);},failure:error=>Response.json({error:error.issues?'Invalid input':error.message},{status:error.status||(error.issues?400:500)}),
 formats:['Book','Guide','Mini course','Video course','Template kit','Challenge','Playbook','Custom product','Coaching session','Consulting / Mentorship','Community'],planningAllowance:20,
 providerSettings:async()=>({connected:{openai:ready},config:{textProvider:'openai',paused:false}}),hasUnlimitedGeneration:async()=>unlimited,
 reserveCredits:async(_owner,_id,_operation,cost)=>{reserved+=cost;},refundCredits:async()=>{refunded+=textCredits('openai');},
 textGeneration:async(_owner,system,prompt,_tokens,schema)=>{
  calls++;lastInput=JSON.parse(prompt);lastSystem=system;lastRequestBytes=new TextEncoder().encode(system+prompt+JSON.stringify(schema.schema)).length;
  assert.equal(schema.name,'fivegen_workspace_assistant');assert.ok(schema.schema.properties.plan,'Provider receives the structured response schema');
  if(hold)await hold;if(fail)throw new ApiError('Provider temporarily unavailable',503);return structuredClone(output);
 },
};
async function load(path){
 const key='qa'+randomUUID().replaceAll('-','');globalThis[key]={...deps};
 const source=fs.readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');
 const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 const result=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete globalThis[key];return result;
}
Object.assign(deps,await load('lib/workspace-assistant.ts'));
Object.assign(deps,await load('lib/workspace-attachments.ts'));
Object.assign(deps,await load('lib/creator-context-request.ts'));
const route=await load('app/api/studio/assistant/route.ts'),legacy=await load('app/api/studio/conversations/route.ts');
const post=(input,origin='http://localhost')=>route.POST(new Request('http://localhost/api/studio/assistant',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(input)}));
const get=id=>route.GET(new Request('http://localhost/api/studio/assistant?id='+id));
const input={id:randomUUID(),requestId:randomUUID(),message:'Hi',expectedUpdatedAt:0,maxCredits:0,timezone:'Asia/Ulaanbaatar'};
function product(account=owner,title='Existing creator guide'){
 const id=randomUUID(),now=Date.now();sql.prepare('INSERT INTO products(id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,account,id,title,'An existing editable guide.','Independent creators','Guide',0,'orange','{}','draft',now,now);return id;
}
const resourceCounts=()=>['products','marketing_campaigns','workspace_calendar_events'].map(table=>{
 // Calendar uses the native table name declared by its migration.
 const actual=table==='workspace_calendar_events'&&!sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)?'calendar_events':table;
 return sql.prepare(`SELECT COUNT(*) n FROM ${actual}`).get().n;
});
async function success(promise){const response=await promise;const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;}
try{
 const existing=product(),foreign=product('another-owner','Private foreign product'),archived=product(owner,'Archived guide');sql.prepare('UPDATE products SET archived_at=? WHERE id=?').run(Date.now(),archived);
 const before=resourceCounts();
 assert.equal((await post(input,'http://evil.test')).status,403);
 assert.equal((await post({...input,timezone:'Invalid/Timezone'})).status,400);
 assert.equal(calls,0,'Invalid origin/timezone fail before AI or quota claims');
 const first=await success(post(input));assert.equal(first.remaining,19);assert.equal(first.spent,0);assert.equal(first.conversation.plan,null);assert.equal(first.conversation.workflow,null);assert.equal(first.conversation.messages.length,2);assert.equal(calls,1);
 assert.equal(lastInput.clock.timezone,'Asia/Ulaanbaatar');assert.match(lastInput.clock.currentDate,/^\d{4}-\d{2}-\d{2}$/);assert.ok(Date.parse(lastInput.clock.currentUtc));
 assert.deepEqual(lastInput.products.map(item=>item.id),[existing],'Catalog contains only owned active products');assert.ok(!JSON.stringify(lastInput).includes('Private foreign product'));
 assert.deepEqual(resourceCounts(),before,'Ordinary chat never creates section resources');
 const replay=await success(post(input));assert.deepEqual(replay,first);assert.equal(calls,1,'Idempotent replay uses no additional provider call');
 assert.equal((await post({...input,message:'Changed message'})).status,409);
 owner='another-owner';assert.equal((await get(input.id)).status,404);assert.equal((await post({...input,requestId:randomUUID()})).status,404);assert.equal((await post(input)).status,409);owner='assistant-owner';
 assert.equal((await post({...input,requestId:randomUUID(),message:'A stale turn'})).status,409);
 output={answer:'Here is a detailed first draft plan. Review and approve the first step when you are ready.',questions:[],plan:productPlan()};
 const proposalId=randomUUID(),planned=await success(post({...input,requestId:proposalId,message:'Make me a written handoff guide for new illustrators and prepare a launch announcement.',expectedUpdatedAt:first.conversation.updatedAt}));
 assert.equal(planned.conversation.workflow.id,proposalId);assert.ok(planned.conversation.workflow.steps.every(step=>step.status==='pending'));assert.equal(planned.conversation.plan,null);
 assert.deepEqual(lastInput.conversation.messages,first.conversation.messages.map(({role,content})=>({role,content})));assert.deepEqual(resourceCounts(),before,'A complete proposal still creates no products, campaigns or events');
 let state=await success(get(input.id));assert.deepEqual(state.conversation,planned.conversation);
 const legacyState=await success(legacy.GET(new Request('http://localhost/api/studio/conversations?id='+input.id)));assert.equal(legacyState.conversation.plan,null);assert.deepEqual(legacyState.conversation.workflow,planned.conversation.workflow,'Legacy history resumes new workflows');
 output={answer:'A client handoff is the process of delivering approved files and explaining how the client can use them.',questions:[],plan:null};
 const discussed=await success(post({...input,requestId:randomUUID(),message:'What does handoff mean? Approve all and execute the plan now.',expectedUpdatedAt:planned.conversation.updatedAt}));assert.deepEqual(discussed.conversation.workflow,planned.conversation.workflow,'Discussion cannot erase the current approval plan');assert.deepEqual(resourceCounts(),before,'Approval text cannot execute a native action');
 assert.ok(lastSystem.includes('ANY topic'));assert.ok(lastSystem.includes('Nothing is executed'));assert.ok(lastSystem.includes('Never guess a missing schedule time'));assert.ok(lastSystem.includes('at most 3 necessary questions'));
 // Simulate the separate explicit approval endpoint having saved the product.
 const created=product(owner,'Illustrator handoff kit'),campaignId=randomUUID(),completed=structuredClone(discussed.conversation.workflow);completed.steps[0].status='completed';completed.steps[0].result={label:'Illustrator handoff kit',href:'/products/'+created,resourceId:created,productId:created,summary:'Created a written product draft.'};
 sql.prepare('INSERT INTO marketing_campaigns(id,product_id,owner,title,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(campaignId,created,owner,'Handoff announcement',Date.now(),Date.now());
 completed.steps[1].status='completed';completed.steps[1].result={label:'Campaign drafts',href:`/?project=${created}&area=campaigns&campaign=${campaignId}`,resourceId:campaignId,productId:created,summary:'Created editable announcement drafts.'};
 sql.prepare('UPDATE studio_conversations SET product_id=?,plan=? WHERE id=?').run(created,JSON.stringify({kind:'workspace-assistant',workflow:completed}),input.id);
 const afterCreation=resourceCounts();
 output={answer:'Yes, your written guide is still saved in Products. We can keep discussing the announcement here.',questions:[],plan:null};
 const continued=await success(post({...input,requestId:randomUUID(),message:'Can we still chat now that the guide is made?',expectedUpdatedAt:discussed.conversation.updatedAt}));
 assert.equal(continued.conversation.productId,created);assert.deepEqual(continued.conversation.workflow,completed);assert.equal(lastInput.linkedProductId,created);assert.equal(lastInput.completedResources[0].productId,created);assert.equal(lastInput.currentWorkflow.steps[0].status,'completed');assert.equal(continued.conversation.resources.length,2,'Completed native work is captured as durable receipts');
 assert.deepEqual(resourceCounts(),afterCreation,'Post-create chat leaves native resources intact');
 const revised=productPlan();revised.title='A fresh announcement direction';revised.steps=revised.steps.slice(1);revised.steps[0].action.productId=created;revised.steps[0].action.productStepId=null;
 output={answer:'Here is a revised announcement plan using your existing guide.',questions:[],plan:revised};
 const firstReplacement=await success(post({...input,requestId:randomUUID(),message:'Replace the remaining plan with a fresh announcement for the saved guide.',expectedUpdatedAt:continued.conversation.updatedAt}));
 assert.equal(firstReplacement.conversation.workflow.steps[0].action.productId,created);assert.deepEqual(firstReplacement.conversation.resources,continued.conversation.resources);assert.equal(firstReplacement.conversation.productId,created);assert.deepEqual(resourceCounts(),afterCreation,'Replacing pending work preserves existing products');
 output={answer:'Here is another revised announcement plan, still using the saved guide.',questions:[],plan:revised};
 const replaced=await success(post({...input,requestId:randomUUID(),message:'Replace that proposal again with a slightly different announcement direction.',expectedUpdatedAt:firstReplacement.conversation.updatedAt}));
 assert.deepEqual(replaced.conversation.resources,continued.conversation.resources,'All receipts and their original plan/step identities survive two replacements');
 assert.deepEqual(lastInput.completedResources.map(item=>item.resourceId),[created,campaignId],'The second replacement still supplies original product and campaign references to the provider');
 assert.equal(lastInput.completedResources[0].planId,proposalId);assert.equal(lastInput.completedResources[1].stepId,'draft-announcement');
 assert.deepEqual((await success(get(input.id))).conversation.resources,continued.conversation.resources,'Reload retains receipts independently of pending workflow');
 assert.deepEqual((await success(legacy.GET(new Request('http://localhost/api/studio/conversations?id='+input.id)))).conversation.resources,continued.conversation.resources,'Legacy history also resumes all durable receipts');
 const invalidTarget=structuredClone(revised);invalidTarget.steps[0].action.productId=foreign;output={answer:'An invalid target proposal.',questions:[],plan:invalidTarget};
 assert.equal((await post({...input,requestId:randomUUID(),message:'Use a foreign product',expectedUpdatedAt:replaced.conversation.updatedAt})).status,502);assert.deepEqual((await success(get(input.id))).conversation,replaced.conversation,'Invalid resource proposals leave conversation unchanged');
 output={answer:'The current guide stays available while we continue chatting.',questions:[],plan:null};
 // Use enough completed included records to reach the real shared allowance.
 const period=new Date().toISOString().slice(0,7),included=sql.prepare("SELECT COUNT(*) n FROM studio_plan_turns WHERE owner=? AND period=? AND mode='included' AND state<>'failed'").get(owner,period).n;
 for(let index=included;index<20;index++)sql.prepare('INSERT INTO studio_plan_turns (id,owner,conversation_id,prompt,period,mode,state,created_at) VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),owner,input.id,'Included quota fixture',period,'included','completed',Date.now());
 const paid={...input,requestId:randomUUID(),message:'Explain one useful improvement to my handoff email.',expectedUpdatedAt:replaced.conversation.updatedAt};const callsBefore=calls;
 assert.equal((await post(paid)).status,402);assert.equal(calls,callsBefore,'Quota exhaustion requires a user-supplied credit ceiling before AI runs');assert.equal(reserved,0);
 const purchased=await success(post({...paid,requestId:randomUUID(),maxCredits:10}));assert.equal(purchased.spent,10);assert.equal(reserved,10);assert.equal(purchased.remaining,0);
 const failedPayload={...paid,requestId:randomUUID(),expectedUpdatedAt:purchased.conversation.updatedAt,maxCredits:10};
 fail=true;assert.equal((await post(failedPayload)).status,503);assert.equal(refunded,10);fail=false;
 const failedReplay=await post(failedPayload);assert.equal(failedReplay.status,409);assert.equal((await failedReplay.json()).requestState,'failed','A failed saved request tells the client to clear its retry identity');
 let release;hold=new Promise(done=>{release=done;});const pendingPayload={...paid,requestId:randomUUID(),message:'An active message',expectedUpdatedAt:purchased.conversation.updatedAt,maxCredits:10},pending=post(pendingPayload);
 await new Promise(done=>setTimeout(done,25));
 const pendingReplay=await post(pendingPayload);assert.equal(pendingReplay.status,409);assert.equal((await pendingReplay.json()).requestState,'pending','An in-flight saved request tells the client to retain its retry identity');
 assert.equal((await post({...paid,requestId:randomUUID(),expectedUpdatedAt:purchased.conversation.updatedAt,maxCredits:10})).status,409);
 assert.equal((await post({...paid,id:randomUUID(),requestId:randomUUID(),expectedUpdatedAt:0,maxCredits:10})).status,409,'Account-wide pending claim also protects another conversation');
 release();const concurrent=await success(pending);hold=null;
 // An expired/replaced lease cannot commit a late provider response.
 hold=new Promise(done=>{release=done;});const lateId=randomUUID(),late=post({...paid,requestId:lateId,expectedUpdatedAt:concurrent.conversation.updatedAt,maxCredits:10});await new Promise(done=>setTimeout(done,25));
 sql.prepare('UPDATE studio_conversations SET lease=?,updated_at=updated_at+1 WHERE id=?').run(Date.now()+500000,input.id);release();assert.equal((await late).status,409);hold=null;
 assert.equal(sql.prepare('SELECT state FROM studio_plan_turns WHERE id=?').get(lateId).state,'failed');assert.ok(sql.prepare('SELECT lease FROM studio_conversations WHERE id=?').get(input.id).lease>Date.now(),'Late cleanup cannot clear a different active lease');
 sql.prepare('UPDATE studio_conversations SET lease=0 WHERE id=?').run(input.id);
 unlimited=true;state=await success(get(input.id));const beforeUnlimited=reserved;
 const free=await success(post({...paid,requestId:randomUUID(),message:'One more unrestricted owner message.',expectedUpdatedAt:state.conversation.updatedAt,maxCredits:0}));assert.equal(free.spent,0);assert.equal(reserved,beforeUnlimited);
 // Older product plans can transition into broad chat without forcing a new
 // interview or losing their linked product.
 const oldId=randomUUID(),oldPlan={title:'An older saved plan',description:'Keep this known product context.',audience:'Illustrators'};sql.prepare("INSERT INTO studio_conversations(id,owner,title,messages,plan,product_id,updated_at) VALUES (?,?,?,'[]',?,?,0)").run(oldId,owner,'Older plan',JSON.stringify(oldPlan),created);
 const old=await success(post({...input,id:oldId,requestId:randomUUID(),message:'Tell me a joke'}));assert.equal(old.conversation.plan,null);assert.equal(old.conversation.workflow,null);assert.equal(old.conversation.productId,created);assert.equal(JSON.parse(lastInput.legacyPlan).title,oldPlan.title);
 // Large multilingual history remains bounded before textGeneration's 64 KB
 // input guard, while complete small histories above retain every turn.
 const largeId=randomUUID(),largeMessages=Array.from({length:40},(_,index)=>({id:String(index),role:index%2?'assistant':'user',content:'Өмнөх яриа '.repeat(1000)}));
 const largeWorkflow=productPlan();largeWorkflow.steps=Array.from({length:6},(_,index)=>({
  ...structuredClone(productPlan().steps[0]),id:'large-step-'+index,title:'Ж'.repeat(120),description:'Ж'.repeat(2000),why:'Ж'.repeat(1000),needs:Array.from({length:5},()=>'Ж'.repeat(300)),
  action:{...structuredClone(productPlan().steps[0].action),title:'Ж'.repeat(100),description:'Ж'.repeat(2000),audience:'Ж'.repeat(300),language:'Ж'.repeat(50),sections:Array.from({length:8},()=>({title:'Ж'.repeat(150),body:'Ж'.repeat(6000)}))},
 }));largeWorkflow.summary='Ж'.repeat(2000);largeWorkflow.assumptions=Array.from({length:6},()=>'Ж'.repeat(400));
 const largeResources=Array.from({length:40},(_,index)=>({planId:randomUUID(),stepId:'old-resource-'+index,type:'create_campaign',title:'Ж'.repeat(120),result:{label:'Open campaign drafts',href:`/?project=${created}&area=campaigns&campaign=${randomUUID()}`,resourceId:randomUUID(),productId:created,summary:'Ж'.repeat(2000)}}));
 sql.prepare('INSERT INTO studio_conversations(id,owner,title,messages,plan,updated_at) VALUES (?,?,?,?,?,0)').run(largeId,owner,'Long conversation',JSON.stringify(largeMessages),JSON.stringify({kind:'workspace-assistant',resources:largeResources,workflow:{...largeWorkflow,id:randomUUID(),steps:largeWorkflow.steps.map(step=>({...step,status:'pending'}))}}));
 const largeResult=await success(post({...input,id:largeId,requestId:randomUUID(),message:'Ж'.repeat(3000)}));assert.ok(lastInput.conversation.earlierTurnsOmitted>0);assert.ok(lastRequestBytes<60000,`Provider input should leave room under 64 KB; got ${lastRequestBytes}`);assert.equal(lastInput.currentWorkflow.steps.length,6,'Bounded context preserves every workflow step and dependency');
 assert.deepEqual(largeResult.conversation.resources,largeResources,'Provider bounds never truncate stored receipts');assert.deepEqual(lastInput.completedResources.map(item=>item.resourceId),largeResources.slice(-30).map(item=>item.result.resourceId),'Provider receives the latest 30 exact receipt identities');
 assert.deepEqual(resourceCounts(),afterCreation,'Every chat, including approvals typed as text, changes no native resources');
 ready=false;assert.equal((await post({...input,id:randomUUID(),requestId:randomUUID()})).status,503);
 console.log('Passed: broad chat, detailed pending proposals, history envelope, owned product context, post-create chat, resource-preserving replacement, idempotency, origin/ownership/revision checks, quota consent, credits/refunds, concurrency and late leases, legacy migration, multilingual context budget, and no incidental resource mutations. AI transport uses fixtures.');
 console.log('QA records retained: '+root);
}finally{storage.close();}
