import {z} from 'zod';
import {formats} from './product';
import type {WorkspaceAttachment} from './workspace-attachments';

const text=z.string().trim().min(1);
const stamp=z.number().int().min(Date.UTC(2000,0,1)).max(Date.UTC(2101,0,1));
const productReference={productId:z.string().uuid().nullable(),productStepId:z.string().regex(/^[a-z0-9-]{1,64}$/).nullable()};
export const assistantActionSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('generate_product'),title:text.min(3).max(100),description:text.min(12).max(2000),audience:text.min(3).max(300),format:z.enum(formats),language:text.max(50),buyerProblem:text.min(12).max(3000),outcome:text.min(12).max(1500),creatorExpertise:z.string().max(6000),prerequisites:z.string().max(3000),instructions:text.min(12).max(6000),sectionCount:z.number().int().min(1).max(30),delivery:z.enum(['in_app','download','both']),exportFormat:z.enum(['pdf','epub','html','markdown','zip']).nullable()}),
  z.object({type:z.literal('create_product'),title:text.min(3).max(100),description:text.min(12).max(2000),audience:text.min(3).max(300),format:z.enum(formats),language:text.max(50),sections:z.array(z.object({title:text.max(150),body:text.max(6000)})).min(1).max(8)}),
  z.object({type:z.literal('create_campaign'),...productReference,title:text.max(150),goal:text.max(3000),items:z.array(z.object({channel:z.enum(['social','short_video','email']),title:text.max(180),body:text.max(6000),subject:z.string().max(200)})).min(1).max(8)}),
  z.object({type:z.literal('create_calendar_event'),...productReference,title:text.max(180),startAt:stamp,endAt:stamp,timezone:text.max(100),kind:z.enum(['content','task','meeting','reminder','email']),notes:z.string().max(6000)}),
  z.object({type:z.literal('manual'),instructions:text.max(2000)}),
]);
export const assistantStepProposalSchema=z.object({
  id:z.string().regex(/^[a-z0-9-]{1,64}$/),title:text.max(120),description:text.max(2000),why:text.max(1000),needs:z.array(text.max(300)).max(5),action:assistantActionSchema,
});
export const assistantPlanProposalSchema=z.object({
  title:text.max(150),summary:text.max(2000),assumptions:z.array(text.max(400)).max(6),steps:z.array(assistantStepProposalSchema).min(1).max(6),
}).superRefine((plan,ctx)=>{
  const seen=new Set<string>();
  for(const [index,step] of plan.steps.entries()){
    if(step.action.type==='generate_product'){
      if(step.action.delivery==='in_app'&&step.action.exportFormat!==null||step.action.delivery!=='in_app'&&step.action.exportFormat===null)ctx.addIssue({code:'custom',path:['steps',index,'action','exportFormat'],message:'Choose a supported export format for downloadable delivery, or no export format for in-app only.'});
    }
    if(seen.has(step.id))ctx.addIssue({code:'custom',path:['steps',index,'id'],message:'Every step needs a unique identity.'});
    if('productStepId' in step.action&&step.action.productStepId){
      const productStepId=step.action.productStepId;
      const dependency=plan.steps.slice(0,index).find(item=>item.id===productStepId);
      if(!dependency||!['create_product','generate_product'].includes(dependency.action.type))ctx.addIssue({code:'custom',path:['steps',index,'action','productStepId'],message:'Choose an earlier product creation step.'});
      if(step.action.productId)ctx.addIssue({code:'custom',path:['steps',index,'action','productId'],message:'Choose one product destination.'});
    }
    if(step.action.type==='create_campaign'&&!step.action.productId&&!step.action.productStepId)ctx.addIssue({code:'custom',path:['steps',index,'action'],message:'Campaign drafts need a product destination.'});
    if(step.action.type==='create_calendar_event'){
      if(step.action.endAt<=step.action.startAt||step.action.endAt-step.action.startAt>32*86400000)ctx.addIssue({code:'custom',path:['steps',index,'action','endAt'],message:'Choose an end after the start, within 32 days.'});
      try{new Intl.DateTimeFormat('en-US',{timeZone:step.action.timezone});}catch{ctx.addIssue({code:'custom',path:['steps',index,'action','timezone'],message:'Choose a valid IANA timezone.'});}
    }
    seen.add(step.id);
  }
});
export const assistantResponseSchema=z.object({answer:text.max(6000),questions:z.array(text.max(300)).max(3),plan:assistantPlanProposalSchema.nullable()}).superRefine((response,ctx)=>{
  if(response.questions.length&&response.plan)ctx.addIssue({code:'custom',path:['plan'],message:'Resolve necessary questions before proposing executable steps.'});
});
export type AssistantAction=z.infer<typeof assistantActionSchema>;
export type AssistantStepProposal=z.infer<typeof assistantStepProposalSchema>;
export type AssistantPlanProposal=z.infer<typeof assistantPlanProposalSchema>;
export type AssistantStepResult={label:string;href:string|null;resourceId?:string;productId?:string;summary:string};
export type AssistantResourceReceipt={planId:string;stepId:string;type:AssistantAction['type'];title:string;result:AssistantStepResult};
export type AssistantStep=AssistantStepProposal&{status:'pending'|'completed'|'skipped';result?:AssistantStepResult;error?:string};
export type AssistantWorkflow=Omit<AssistantPlanProposal,'steps'>&{id:string;steps:AssistantStep[]};
export type AssistantMessage={id:string;role:'user'|'assistant';content:string;questions?:string[];attachments?:WorkspaceAttachment[]};
export type AssistantConversation={id:string;messages:AssistantMessage[];plan:null;workflow:AssistantWorkflow|null;resources?:AssistantResourceReceipt[];productId:string|null;updatedAt:number};
export type AssistantEnvelope={kind:'workspace-assistant';workflow:AssistantWorkflow|null;resources?:AssistantResourceReceipt[]};

const normalizedQuestion=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
/** An explicit request for another product starts a fresh interview, while
 * saved resources and the full conversation remain available separately. */
export function assistantActiveBriefMessages(messages:AssistantMessage[],currentMessage:string){
  const turns:Pick<AssistantMessage,'role'|'content'|'questions'>[]=[...messages,{role:'user',content:currentMessage}];
  const newBrief=/\b(?:start|begin|create|build|make|write|generate|switch to|work on)\s+(?:(?:a|an|my|the)\s+)?(?:new|another|different|second)\s+(?:digital\s+)?(?:product|book|guide|playbook|mini course|full course|video course|template kit|challenge|community|coaching session|consulting offer)\b(?!\s+(?:post|channel|resource|event|lesson|section|chapter)\b)/i;
  const reuse=/\b(?:reuse|keep|use|same)\b.{0,50}\b(?:previous|earlier|same|existing)?\s*(?:answers|brief|audience)\b/i;
  let start=0;
  for(const [index,turn] of turns.entries())if(turn.role==='user'&&newBrief.test(turn.content)&&!reuse.test(turn.content))start=index;
  return turns.slice(start);
}
/** Exact replies are evidence, not inferred facts. Keep older brief decisions
 * available even when the recent conversational window has rolled forward. */
export function assistantIntakeHistory(messages:AssistantMessage[],currentMessage:string){
  const turns=assistantActiveBriefMessages(messages,currentMessage),history:{question:string;reply:string;explicit:boolean}[]=[];
  for(let index=0;index<turns.length;index++){
    const turn=turns[index];if(turn.role!=='assistant'||!('questions' in turn)||!turn.questions?.length)continue;
    const replies=turns.slice(index+1).filter(item=>item.role==='user');if(!replies.length)continue;
    for(const question of turn.questions){
      const reply=replies.filter(item=>item.content.includes(question+'\nMy answer:')).at(-1)||replies[0];
      const start=reply.content.indexOf(question+'\nMy answer:');
      const explicit=start>=0;
      const tail=reply.content.slice(start+question.length+'\nMy answer:'.length);
      const nextAnswer=explicit?turn.questions.filter(item=>item!==question).map(item=>tail.indexOf('\n\n'+item+'\nMy answer:')).filter(offset=>offset>=0):[];
      const answer=explicit?tail.slice(0,nextAnswer.length?Math.min(...nextAnswer):undefined).trim():reply.content;
      history.push({question,reply:answer,explicit});
    }
  }
  return history.slice(-24);
}
export function newAssistantQuestions(questions:string[],history:ReturnType<typeof assistantIntakeHistory>){
  const known=new Set(history.filter(item=>item.explicit).map(item=>normalizedQuestion(item.question)));
  return questions.filter(question=>{const key=normalizedQuestion(question);if(known.has(key))return false;known.add(key);return true;});
}
/** Native saving may preserve supplied copy, but cannot bypass generation by
 * labeling an unapproved model sketch as an already-written product. */
export function assistantCopyIsSupplied(sections:{body:string}[],references:string[]){
  const normalize=(value:string)=>value.normalize('NFKC').replace(/\s+/gu,' ').trim();
  const sources=references.map(normalize);
  return assistantSectionsAreFinished(sections)&&sections.every(section=>sources.some(source=>source.includes(normalize(section.body))));
}
export function assistantSectionsAreFinished(sections:{body:string}[]){
  return sections.length>0&&sections.every(section=>{const body=section.body.trim();return !!body&&!/^(?:TODO|TBD|coming soon|placeholder|write (?:this|the) (?:section|chapter) here)[.!\s]*$/i.test(body);});
}
export function assistantProductReview(action:Extract<AssistantAction,{type:'create_product'|'generate_product'}>){
  const downloadOnly=action.type==='generate_product'&&action.delivery==='download';
  const review:Record<string,string>={
    Book:'Read the opening chapter and check the examples and chapter order.',
    Guide:'Try the steps from the reader\'s starting point and check each task and resource.',
    Playbook:'Walk through the decision paths and check that every choice reaches a useful action.',
    'Mini course':'Try the lessons and practice activities in learner preview.',
    'Video course':'Review the modules and lesson activities, then upload any recordings you want learners to watch.',
    'Template kit':'Open the editable templates and test the instructions with one real example.',
    Challenge:'Try the first day and check its activity, checklist and check-in.',
    'Consulting / Mentorship':downloadOnly?'Read the written service scope, preparation, agenda and follow-up resources. Check that they describe your actual expertise and boundaries.':'Review the service scope and intake, then set your real availability and meeting details.',
    'Coaching session':downloadOnly?'Read the written preparation, reflection prompts and action-plan resources. Check that they fit your intended coaching session.':'Review the session outcome and preparation, then set your real availability and meeting details.',
    Community:downloadOnly?'Review the written welcome, rules and starting resources. The download is a companion document; it does not provide interactive community membership.':'Check the welcome path, channels and rules in member preview before inviting anyone.',
    'Custom product':'Preview the actual deliverables and test each included file or activity.',
  };
  const delivery=action.type==='generate_product'&&action.delivery!=='in_app'?` Then use Download in the product to export your ${action.exportFormat?.toUpperCase()} and open the exported file to check it. You can keep it private; publishing is not required to download.`:' Your product is a private draft; review its buyer preview before publishing.';
  return `${review[action.format]}${delivery} When you are ready, tell Gen whether you want to improve this draft, add images, or prepare a marketing plan and first-customer outreach. Any further AI generation needs its own approval.`;
}

export function readAssistantEnvelope(value:unknown):AssistantEnvelope|null{
  try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed&&parsed.kind==='workspace-assistant'?parsed as AssistantEnvelope:null;}catch{return null;}
}
export function assistantDestination(action:AssistantAction){
  return action.type==='create_product'||action.type==='generate_product'?'Products':action.type==='create_campaign'?'Marketing → Campaigns':action.type==='create_calendar_event'?'Calendar':'Your next action';
}
export function nextAssistantStep(workflow:AssistantWorkflow|null|undefined){return workflow?.steps.find(step=>step.status==='pending')??null;}
/** Keep actual saved receipts independently of a revisable proposal. */
export function assistantResourceReceipts(envelope:AssistantEnvelope|null|undefined):AssistantResourceReceipt[]{
  const resources=[...(envelope?.resources||[])];
  const workflow=envelope?.workflow;
  for(const step of workflow?.steps||[])if(step.status==='completed'&&step.result?.resourceId&&step.result.href)resources.push({planId:workflow!.id,stepId:step.id,type:step.action.type,title:step.title,result:step.result});
  return [...new Map(resources.map(receipt=>[`${receipt.planId}:${receipt.stepId}`,receipt])).values()];
}
