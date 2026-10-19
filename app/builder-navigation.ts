import type {BuilderDraft} from '@/lib/builder-contract';
import type {ProductReadinessLocation} from '@/lib/product-readiness';

export type BuilderPanel='details'|'content'|'resources'|'appearance';

export function initialBuilderPanel(draft:BuilderDraft):BuilderPanel{
 return draft.sections.length||draft.files.length?'content':draft.uploadIds.length||draft.source==='upload'?'resources':'details';
}

export function builderNavigationForLocation(location:ProductReadinessLocation,family:string){
 // Private delivery links live with the relevant service/member fields, while
 // page covers have their own work panel. Neither belongs behind the sales gate.
 const focus=location.step==='review'&&!location.field&&['service','community'].includes(family)
  ?{...location,step:'details' as const,field:family==='service'?'meetingUrl':'communityUrl'}:location;
 const stage=focus.step==='review'&&focus.field!=='coverUploadId'?2:1;
 const panel:BuilderPanel=focus.field==='coverUploadId'?'appearance':focus.uploadId?'resources':focus.step==='details'?'details':'content';
 return {stage,panel,focus};
}
