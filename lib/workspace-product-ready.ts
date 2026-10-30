import type {AssistantConversation} from './workspace-assistant';

export type ProductReadyApproval={conversationId:string;planId:string;stepId:string};
export type ProductReadyCompletion={key:string;conversationId:string;planId:string;title:string;href:string};

/** A success handoff belongs to the exact product approval made in this tab.
 * Loading completed history or finishing unrelated plan steps is not a save. */
export function completedWorkspaceProduct(conversation:AssistantConversation|null,approval:ProductReadyApproval|null):ProductReadyCompletion|null{
 if(!approval||conversation?.id!==approval.conversationId||conversation.workflow?.id!==approval.planId)return null;
 const step=conversation.workflow.steps.find(item=>item.id===approval.stepId);
 if(step?.status!=='completed'||step.action.type!=='create_product'||!step.result)return null;
 const productId=step.result.productId||step.result.resourceId;
 if(!productId||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(productId))return null;
 if(step.result.resourceId&&step.result.resourceId!==productId)return null;
 const href='/build/'+encodeURIComponent(productId);
 if(step.result.href!==href)return null;
 return {key:[approval.conversationId,approval.planId,approval.stepId,productId].join(':'),conversationId:approval.conversationId,planId:approval.planId,title:step.action.title,href};
}
