import {z} from 'zod';
import {builderDraftSchema,builderFamily,type BuilderDraft} from './builder-contract';
import {builderAgentFieldKeysForContext} from './builder-assistant-contract';

export const builderRevisionKinds=['manual','ai-fields','ai-outline','ai-refine','ai-generation','restore'] as const;
export type BuilderRevisionKind=typeof builderRevisionKinds[number];
export const builderRevisionLabels:Record<BuilderRevisionKind,string>={manual:'Saved draft','ai-fields':'AI field updates','ai-outline':'AI outline updates','ai-refine':'AI text refinement','ai-generation':'Generated draft applied',restore:'Restored editorial revision'};
export type BuilderRevision={version:number;kind:BuilderRevisionKind;label:string;createdAt:number;title:string;sectionCount:number};
export type BuilderRevisionHistory={currentVersion:number;revisions:BuilderRevision[];hasMore:boolean};
export const builderRevisionRestoreSchema=z.object({expectedVersion:z.number().int().min(1),revisionVersion:z.number().int().min(1)}).strict();

export function builderRevisionSnapshot(draft:BuilderDraft):BuilderDraft{
 const editable=new Set<string>([...builderAgentFieldKeysForContext({type:draft.type,builderType:draft.type,deliveryFamily:builderFamily(draft)}),'instructions','prerequisites']);
 // Store only recoverable editorial work. Large resource bytes, private
 // delivery links and commerce settings are not duplicated on each autosave.
 return builderDraftSchema.parse({...draft,fields:Object.fromEntries(Object.entries(draft.fields).filter(([key])=>editable.has(key))),files:[],uploadIds:[],coverUploadId:undefined,priceCents:0,currency:'usd'});
}

/** History restores editorial content; current delivery, resources and commerce stay authoritative. */
export function restoreBuilderEditorialRevision(current:BuilderDraft,previous:BuilderDraft):BuilderDraft{
 builderDraftSchema.parse(current);builderDraftSchema.parse(previous);
 if(current.type!==previous.type)throw new Error('This revision belongs to a different product type.');
 const editable=builderAgentFieldKeysForContext({type:current.type,builderType:current.type,deliveryFamily:builderFamily(current)}).filter(key=>!['title','description','audience'].includes(key));
 const fields={...current.fields};
 for(const key of [...editable,'instructions','prerequisites']){
  if(Object.hasOwn(previous.fields,key))fields[key]=previous.fields[key];else delete fields[key];
 }
 const sections=previous.sections.map(section=>{
  const live=section.id?current.sections.find(item=>item.id===section.id):undefined;
  // Keep an attached replacement recording. The earlier recording is still
  // retained in its revision and private uploads; restoration never deletes it.
  return {...section,...(live?.videoId?{videoId:live.videoId}:{})};
 });
 // An outline undo must not detach a recording uploaded after that outline.
 for(const section of current.sections)if(section.videoId&&!sections.some(item=>item.id&&item.id===section.id))sections.push({...section});
 if(sections.length>30)throw new Error('This restoration would exceed the section limit while keeping your recordings. Keep the current draft and copy the desired text from an earlier revision.');
 return builderDraftSchema.parse({...current,title:previous.title,description:previous.description,audience:previous.audience,language:previous.language,fields,sections});
}
