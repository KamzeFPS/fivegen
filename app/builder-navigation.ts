import type {BuilderDraft} from '@/lib/builder-contract';
import type {ProductReadinessLocation} from '@/lib/product-readiness';

export type BuilderPanel='details'|'content'|'resources'|'appearance'|'review';

export function builderPublicationStatus(workspace:{version:number;selling:boolean;publication:{version:number}|null},dirty:boolean){
 const hasUnpublishedChanges=!!workspace.publication&&(dirty||workspace.publication.version!==workspace.version);
 const label=workspace.selling?(hasUnpublishedChanges?'Checkout enabled · delivery draft changes':'Checkout enabled'):hasUnpublishedChanges?'Delivery has unpublished changes':workspace.publication?'Delivery published · sales paused':'Private draft';
 return {label,hasUnpublishedChanges};
}

export function initialBuilderPanel(draft:BuilderDraft):BuilderPanel{
 if(['mini-course','video-course'].includes(draft.type))return 'content';
 if(draft.type==='template-kit'&&(draft.files.length||draft.uploadIds.length))return 'resources';
 return draft.sections.length?'content':draft.files.length||draft.uploadIds.length||draft.source==='upload'?'resources':'details';
}

export function builderNavigationForLocation(location:ProductReadinessLocation,family:string){
 // Private delivery links live with the relevant service/member fields, while
 // page covers have their own work panel. Neither belongs behind the sales gate.
 const focus=location.step==='review'&&!location.field&&['service','community'].includes(family)
  ?{...location,step:'details' as const,field:family==='service'?'meetingUrl':'communityUrl'}:location;
 const stage=1;
 const panel:BuilderPanel=focus.step==='review'&&!focus.field?'review':focus.field==='coverUploadId'?'appearance':focus.uploadId||focus.fileIndex!==undefined||(family==='templates'&&focus.step==='content'&&focus.sectionIndex===undefined)?'resources':focus.step==='details'?'details':'content';
 return {stage,panel,focus};
}
