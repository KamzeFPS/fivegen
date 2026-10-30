import {z} from 'zod';
import {formats} from './product';
import type {WorkspaceAttachment} from './workspace-attachments';

const text=z.string().trim().min(1);
const stamp=z.number().int().min(Date.UTC(2000,0,1)).max(Date.UTC(2101,0,1));
const productReference={productId:z.string().uuid().nullable(),productStepId:z.string().regex(/^[a-z0-9-]{1,64}$/).nullable()};
export const assistantActionSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('generate_product'),title:text.min(3).max(100),description:text.min(12).max(2000),audience:text.min(3).max(300),format:z.enum(formats),language:text.max(50),buyerProblem:text.min(12).max(3000),outcome:text.min(12).max(1500),creatorExpertise:z.string().max(6000),prerequisites:z.string().max(3000),instructions:text.min(12).max(6000),sectionCount:z.number().int().min(3).max(30),delivery:z.enum(['in_app','download','both']),exportFormat:z.enum(['pdf','epub','html','markdown','zip']).nullable()}),
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
      if(['Coaching session','Consulting / Mentorship'].includes(step.action.format)&&step.action.sectionCount!==3)ctx.addIssue({code:'custom',path:['steps',index,'action','sectionCount'],message:'Use exactly three service-preparation sections: preparation, session plan and follow-up.'});
      if(step.action.format!=='Challenge'&&step.action.sectionCount>8)ctx.addIssue({code:'custom',path:['steps',index,'action','sectionCount'],message:'Keep this focused generation to 3–8 sections. Use the editor for a larger product.'});
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
export const assistantResponseSchema=z.object({answer:text.max(6000),questions:z.array(text.max(300)).max(3),plan:assistantPlanProposalSchema.nullable()});
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
