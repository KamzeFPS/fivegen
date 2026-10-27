import {z} from 'zod';
import {ApiError,database,ownedProduct} from './server';
import {briefSchema,contentSchema,slugify} from './product';
import {emptyGrowthBrief} from './growth';
import {campaignSaveSchema} from './campaign';
import {adoptBuilderWorkspace} from './product-builder-server';
import {createCalendarEvent} from './workspace-calendar-server';
import {assistantPlanProposalSchema,assistantResourceReceipts,readAssistantEnvelope,type AssistantConversation,type AssistantMessage,type AssistantStep,type AssistantStepResult,type AssistantWorkflow} from './workspace-assistant';

export const workspaceAssistantActionRequestSchema=z.object({
  conversationId:z.string().uuid(),planId:z.string().uuid(),stepId:z.string().regex(/^[a-z0-9-]{1,64}$/),
  expectedUpdatedAt:z.number().int().min(0),decision:z.enum(['approve','skip']),requestId:z.string().uuid(),
}).strict();
type ActionRequest=z.infer<typeof workspaceAssistantActionRequestSchema>;
type ActionResponse={conversation:AssistantConversation;result?:AssistantStepResult};
type Row=Record<string,unknown>;
type ActionGuard={sql:string;values:(string|number)[]};

/** Identity belongs to the approved step, so recovery with a new request cannot
 * create a second resource after a saved write or lost response. */
async function stepResourceId(conversationId:string,planId:string,stepId:string,suffix='resource'){
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['workspace-assistant',conversationId,planId,stepId,suffix]))));
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes.slice(0,16),byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function workflowFromRow(row:Row):AssistantWorkflow{
  const envelope=readAssistantEnvelope(row.plan),workflow=envelope?.workflow;
  if(!workflow)throw new ApiError('Ask the assistant for a plan before approving a step.',409);
  const proposal=assistantPlanProposalSchema.parse(workflow);
  z.string().uuid().parse(workflow.id);
  const steps=proposal.steps.map((step,index)=>{
    const saved=workflow.steps[index];
    if(!['pending','completed','skipped'].includes(saved.status))throw new ApiError('This plan needs to be reviewed again.',409);
    return {...step,status:saved.status,...(saved.result?{result:saved.result}:{}),...(saved.error?{error:saved.error}:{})};
  });
  return {...proposal,id:workflow.id,steps};
}
function conversation(row:Row,workflow:AssistantWorkflow):AssistantConversation{
  return {id:String(row.id),messages:JSON.parse(String(row.messages)) as AssistantMessage[],plan:null,workflow,resources:assistantResourceReceipts(readAssistantEnvelope(row.plan)),productId:row.product_id?String(row.product_id):null,updatedAt:Number(row.updated_at)};
}
async function activeProduct(productId:string,owner:string){
  const product=await ownedProduct(productId,owner);
  if(product.archived_at!=null)throw new ApiError('Restore this product before adding new work to it.',409);
  return product;
}
async function stepProductId(step:AssistantStep,workflow:AssistantWorkflow,owner:string){
  if(!('productId' in step.action))return null;
  let productId=step.action.productId;
  if(step.action.productStepId){
    const productStepId=step.action.productStepId,dependency=workflow.steps.find(item=>item.id===productStepId);
    if(!dependency||dependency.status!=='completed'||dependency.action.type!=='create_product'||!dependency.result?.productId)
      throw new ApiError('This step needs the product from an earlier step. That step was skipped or is incomplete. Revise the plan or skip this step.',409);
    productId=dependency.result.productId;
  }
  if(productId)await activeProduct(productId,owner);
  return productId;
}
async function assertActionGuard(guard:ActionGuard){
  if(!await database().prepare('SELECT 1 AS valid WHERE 1=1'+guard.sql).bind(...guard.values).first())
    throw new ApiError('This plan changed while saving. Refresh the chat and retry this step to recover any saved draft.',409);
}
async function executeStep(owner:string,input:ActionRequest,workflow:AssistantWorkflow,step:AssistantStep,guard:ActionGuard):Promise<AssistantStepResult>{
  const action=step.action,db=database(),id=await stepResourceId(input.conversationId,input.planId,step.id),now=Date.now();
  await assertActionGuard(guard);
  if(action.type==='manual')return {label:'Marked complete',href:null,summary:'You confirmed that you completed this action.'};
  if(action.type==='create_product'){
    const brief=briefSchema.parse({...action,price:0,color:'orange'}),sections=await Promise.all(action.sections.map(async(section,index)=>({...section,id:await stepResourceId(input.conversationId,input.planId,step.id,`section-${index}`)}))),content=contentSchema.parse({sections,benefits:[],launch:'',files:[]});
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO products(id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,0,?,?,'draft',?,? WHERE 1=1${guard.sql}`)
        .bind(id,owner,slugify(brief.title)+'-'+id.slice(0,6),brief.title,brief.description,brief.audience,brief.format,brief.color,JSON.stringify(content),now,now,...guard.values),
      db.prepare(`INSERT OR IGNORE INTO growth_workspaces(product_id,owner,brief,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?)${guard.sql}`)
        .bind(id,owner,JSON.stringify(emptyGrowthBrief(brief.audience)),now,id,owner,...guard.values),
    ]);
    // Only this deterministic, newly created draft is ever adopted. Existing
    // product content is never rewritten by an approval or a recovery retry.
    const saved=await activeProduct(id,owner);await assertActionGuard(guard);
    await adoptBuilderWorkspace(id,owner,{language:action.language,source:'ai'});
    const savedSections=contentSchema.parse(JSON.parse(String(saved.content))).sections;
    return {label:'Open product draft',href:'/build/'+id,resourceId:id,productId:id,summary:`Saved “${String(saved.title)}” in Products with ${savedSections.length} written ${savedSections.length===1?'section':'sections'}. Open the product to review its current content.`};
  }
  const productId=await stepProductId(step,workflow,owner);
  if(action.type==='create_campaign'){
    if(!productId)throw new ApiError('Choose a product destination for this campaign before approving it.',409);
    const product=await activeProduct(productId,owner),items=await Promise.all(action.items.map(async(item,index)=>({id:await stepResourceId(input.conversationId,input.planId,step.id,`item-${index}`),channel:item.channel,title:item.title,body:item.body,subject:item.subject,sourceIds:[],scheduledAt:null,accountId:null,scheduleTimezone:null,status:'draft'})));
    const draft=campaignSaveSchema.parse({id,title:action.title,goal:action.goal,sourceIds:[],items,contextRefs:null,destination:null,expectedUpdatedAt:0});
    await db.prepare(`INSERT OR IGNORE INTO marketing_campaigns(id,product_id,owner,title,goal,source_ids,items,source_revisions,context_refs,brief_revision,destination,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,0,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=? AND archived_at IS NULL AND updated_at=?) AND (SELECT COUNT(*) FROM marketing_campaigns WHERE product_id=? AND owner=?)<100${guard.sql}`)
      .bind(id,productId,owner,draft.title,draft.goal,'[]',JSON.stringify(draft.items),'[]',null,null,now,now,productId,owner,Number(product.updated_at),productId,owner,...guard.values).run();
    const saved=await db.prepare('SELECT id,title,items FROM marketing_campaigns WHERE id=? AND product_id=? AND owner=?').bind(id,productId,owner).first();
    if(!saved)throw new ApiError('The product changed or reached its campaign limit. Review it before retrying; no duplicate campaign was created.',409);
    const savedItems=JSON.parse(String(saved.items)) as unknown[];
    return {label:'Open campaign drafts',href:`/?project=${productId}&area=campaigns&campaign=${id}`,resourceId:id,productId,summary:`Saved “${String(saved.title)}” in Marketing → Campaigns with ${savedItems.length} ${savedItems.length===1?'item':'items'}. Open the campaign to review its current copy and approval status.`};
  }
  const event=await createCalendarEvent(owner,{requestId:id,title:action.title,startAt:action.startAt,endAt:action.endAt,timezone:action.timezone,kind:action.kind,notes:action.notes,productId,accountId:null,allDay:false,status:'planned',source:'manual',funnelNodeId:null,funnelIdeaId:null},guard);
  return {label:'Open calendar',href:'/?view=calendar',resourceId:event.id,...(productId?{productId}:{}),summary:`Saved “${event.title}” in Calendar for ${new Intl.DateTimeFormat('en-US',{timeZone:event.timezone,dateStyle:'medium',timeStyle:'short'}).format(event.startAt)} (${event.timezone}).`};
}

export async function executeWorkspaceAssistantAction(owner:string,value:unknown):Promise<ActionResponse>{
  const input=workspaceAssistantActionRequestSchema.parse(value),db=database(),now=Date.now(),lease=now+180000,prompt=JSON.stringify({planId:input.planId,stepId:input.stepId,expectedUpdatedAt:input.expectedUpdatedAt,decision:input.decision});
  const previous=await db.prepare('SELECT owner,conversation_id,prompt,mode,state,response,created_at FROM studio_plan_turns WHERE id=?').bind(input.requestId).first();
  if(previous){
    if(previous.owner!==owner||previous.conversation_id!==input.conversationId||previous.prompt!==prompt||previous.mode!=='action')throw new ApiError('This approval reference was already used. Refresh the chat before trying again.',409);
    if(previous.state==='completed')return JSON.parse(String(previous.response)) as ActionResponse;
    if(previous.state==='pending'&&Number(previous.created_at)>now-180000)throw new ApiError('This step is still being saved. Wait for it to finish, then retry.',409);
  }
  const row=await db.prepare('SELECT * FROM studio_conversations WHERE id=? AND owner=?').bind(input.conversationId,owner).first();
  if(!row)throw new ApiError('Conversation not found.',404);
  const workflow=workflowFromRow(row);
  if(workflow.id!==input.planId||Number(row.updated_at)!==input.expectedUpdatedAt)throw new ApiError('The plan changed. Review the current plan before approving a step.',409);
  const step=workflow.steps.find(item=>item.status==='pending');
  if(!step||step.id!==input.stepId)throw new ApiError('Review and finish or skip the next pending step first.',409);
  let locked=false,claimedTurn=false;
  try{
    const claim=await db.prepare('UPDATE studio_conversations SET lease=? WHERE id=? AND owner=? AND updated_at=? AND plan=? AND lease<?').bind(lease,input.conversationId,owner,input.expectedUpdatedAt,String(row.plan),now).run();
    if(!claim.meta.changes)throw new ApiError('This chat is already saving or its plan changed. Wait, then review the current plan.',409);
    locked=true;
    if(previous)await db.prepare("UPDATE studio_plan_turns SET state='pending',response=NULL,created_at=? WHERE id=? AND owner=? AND mode='action' AND state<>'completed'").bind(now,input.requestId,owner).run();
    else await db.prepare("INSERT INTO studio_plan_turns(id,owner,conversation_id,prompt,period,mode,state,created_at) VALUES(?,?,?,?,?,'action','pending',?)").bind(input.requestId,owner,input.conversationId,prompt,new Date(now).toISOString().slice(0,7),now).run();
    claimedTurn=true;
    const guard:ActionGuard={sql:' AND EXISTS(SELECT 1 FROM studio_conversations WHERE id=? AND owner=? AND updated_at=? AND plan=? AND lease=?)',values:[input.conversationId,owner,input.expectedUpdatedAt,String(row.plan),lease]};
    const result=input.decision==='approve'?await executeStep(owner,input,workflow,step,guard):undefined;
    await assertActionGuard(guard);
    const nextWorkflow:AssistantWorkflow={...workflow,steps:workflow.steps.map(item=>item.id===step.id?{...item,status:input.decision==='skip'?'skipped':'completed',...(result?{result}:{}),error:undefined}:item)};
    const resources=assistantResourceReceipts({kind:'workspace-assistant',resources:assistantResourceReceipts(readAssistantEnvelope(row.plan)),workflow:nextWorkflow});
    const nextStep=nextWorkflow.steps.find(item=>item.status==='pending'),content=(input.decision==='skip'?`Skipped “${step.title}”.`:result!.summary)+(nextStep?` Next: “${nextStep.title}”. Review this step and approve it when you are ready.`:' This plan is complete. You can keep chatting or ask for another plan.');
    const messages=[...conversation(row,workflow).messages,{id:input.requestId+'-action',role:'assistant' as const,content}],updatedAt=Math.max(Date.now(),input.expectedUpdatedAt+1),productId=row.product_id?String(row.product_id):step.action.type==='create_product'&&result?.productId?result.productId:null;
    const response:ActionResponse={conversation:{id:input.conversationId,messages,plan:null,workflow:nextWorkflow,resources,productId,updatedAt},...(result?{result}:{})},encodedPlan=JSON.stringify({kind:'workspace-assistant',workflow:nextWorkflow,resources}),encodedMessages=JSON.stringify(messages),encodedResponse=JSON.stringify(response);
    const committed=await db.batch([
      db.prepare("UPDATE studio_conversations SET messages=?,plan=?,product_id=?,updated_at=?,lease=0 WHERE id=? AND owner=? AND updated_at=? AND plan=? AND lease=? AND EXISTS(SELECT 1 FROM studio_plan_turns WHERE id=? AND owner=? AND mode='action' AND state='pending' AND created_at=?)").bind(encodedMessages,encodedPlan,productId,updatedAt,input.conversationId,owner,input.expectedUpdatedAt,String(row.plan),lease,input.requestId,owner,now),
      db.prepare("UPDATE studio_plan_turns SET state='completed',response=? WHERE id=? AND owner=? AND mode='action' AND state='pending' AND created_at=? AND EXISTS(SELECT 1 FROM studio_conversations WHERE id=? AND owner=? AND updated_at=? AND messages=? AND plan=? AND lease=0)").bind(encodedResponse,input.requestId,owner,now,input.conversationId,owner,updatedAt,encodedMessages,encodedPlan),
    ]);
    if(!committed[0].meta.changes||!committed[1].meta.changes)throw new ApiError('This plan changed while saving. Refresh the chat and retry this step to recover any saved draft.',409);
    return response;
  }catch(error){
    if(claimedTurn)await db.prepare("UPDATE studio_plan_turns SET state='failed' WHERE id=? AND owner=? AND mode='action' AND state='pending' AND created_at=?").bind(input.requestId,owner,now).run();
    throw error;
  }finally{
    if(locked)await db.prepare('UPDATE studio_conversations SET lease=0 WHERE id=? AND owner=? AND updated_at=? AND lease=?').bind(input.conversationId,owner,input.expectedUpdatedAt,lease).run();
  }
}
