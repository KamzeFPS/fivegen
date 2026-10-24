import {ApiError,database} from './server';
import {getBuilderWorkspace,saveBuilderWorkspace} from './product-builder-server';
import {applyBuilderAgentRefinement,applyBuilderAgentSuggestion} from './builder-assistant-apply';
import type {BuilderAgentMessage} from './builder-assistant-contract';
import {creatorContextGuard,creatorProposalRefs} from './creator-context-server';
export async function applyCreatorContextProposal(owner:string,productId:string,value:{messageId:string;expectedVersion:number;mode:'append'|'replace'}){
 const refs=await creatorProposalRefs(owner,productId,value.messageId),row=await database().prepare('SELECT messages FROM studio_conversations WHERE id=? AND owner=? AND product_id=?').bind('builder:'+productId,owner,productId).first(),message=(row?JSON.parse(String(row.messages)):[] as BuilderAgentMessage[]).find((item:BuilderAgentMessage)=>item.id===value.messageId&&item.role==='assistant');
 if(!message?.suggestion)throw new ApiError('This saved suggestion is unavailable. Ask Gen for a fresh suggestion.',404);
 const current=await getBuilderWorkspace(productId,owner);if(current.version!==value.expectedVersion)throw new ApiError('Your saved draft changed. Review the current version before applying this suggestion.',409);
 if(message.target==='refine'&&!message.refinement)throw new ApiError('This earlier refinement has no selected passage. Request a fresh excerpt refinement.',409);
 const next=message.target==='refine'?applyBuilderAgentRefinement(current.draft,message.suggestion,message.refinement!):applyBuilderAgentSuggestion(current.draft,message.suggestion,value.mode);
 if(next.type==='book'&&next.fields.subtitle!==current.draft.fields.subtitle)next.studio={...next.studio,basics:{...next.studio?.basics,subtitle:next.fields.subtitle||''}};
 return saveBuilderWorkspace(productId,owner,{expectedVersion:value.expectedVersion,draft:next,revisionKind:message.target==='refine'?'ai-refine':message.suggestion.sections?'ai-outline':'ai-fields'},false,creatorContextGuard(owner,productId,refs));
}
