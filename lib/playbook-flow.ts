import {decisionGraphSchema,draftDecisionGraphSchema,decisionGraphLayout,type ProductDecisionGraph} from './product-decision-contract';

export type PlaybookNodeDetails={body:string;inputs:string;example:string;uploadIds:string[];fileNames:string[]};
export type PlaybookProcedure={id:string;title:string;body:string;objective:string;trigger:string;role:string;inputs:string;outputs:string;definitionOfDone:string;minutes?:number};
type ProcedureSection={id?:string;title:string;body:string;objective?:string;studio?:Record<string,unknown>};
type Resources={downloads?:{id:string;name:string;mime:string;size:number}[];files:{name:string;description?:string;content?:string}[]};
const text=(value:unknown)=>typeof value==='string'?value:'';
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const strings=(value:unknown)=>Array.isArray(value)?[...new Set(value.filter((item):item is string=>typeof item==='string'&&!!item.trim()))]:[];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Incomplete flows remain editable. Only the strict graph may be run, laid
 * out, published or exported; a draft's missing edge is never guessed. */
export function playbookDraftGraph(value:unknown){const parsed=draftDecisionGraphSchema.safeParse(value);return parsed.success?parsed.data:null;}
export function playbookGraph(value:unknown):ProductDecisionGraph|null{const parsed=decisionGraphSchema.safeParse(value);return parsed.success?parsed.data:null;}
export function playbookFlowIssues(value:unknown){if(value===undefined||value===null)return [];const parsed=decisionGraphSchema.safeParse(value);return parsed.success?[]:[...new Set(parsed.error.issues.map(issue=>issue.message))];}
export function playbookFlowLayout(value:unknown){const graph=playbookGraph(value);return graph?decisionGraphLayout(graph):[];}

export function playbookProcedure(section:ProcedureSection,index=0,defaults?:{trigger?:unknown;definitionOfDone?:unknown}):PlaybookProcedure{
 const studio=record(section.studio),outputs=text(studio.outputs),defined=text(studio.definitionOfDone);
 return {id:section.id||`playbook-procedure-${index}`,title:section.title||`Procedure ${index+1}`,body:section.body,objective:section.objective||'',trigger:text(studio.trigger)||text(defaults?.trigger),role:text(studio.role),inputs:text(studio.inputs),outputs,definitionOfDone:defined||outputs||text(defaults?.definitionOfDone),...(typeof studio.minutes==='number'&&Number.isFinite(studio.minutes)&&studio.minutes>0?{minutes:studio.minutes}:{})};
}

/** Never expose orphaned node notes, or invent a file grant from metadata. */
export function playbookNodeDetails(section:Pick<ProcedureSection,'studio'>,nodeId:string):PlaybookNodeDetails{
 const studio=record(section.studio),graph=playbookDraftGraph(studio.decisionGraph),details=record(studio.playbookNodeDetails);
 const value=graph?.nodes.some(node=>node.id===nodeId)&&Object.hasOwn(details,nodeId)?record(details[nodeId]):{};
 return {body:text(value.body),inputs:text(value.inputs),example:text(value.example),uploadIds:strings(value.uploadIds).filter(id=>uuid.test(id)),fileNames:strings(value.fileNames)};
}

export function playbookNodeResources<T extends Resources>(content:T,details:Pick<PlaybookNodeDetails,'uploadIds'|'fileNames'>):T{
 const uploads=new Set(details.uploadIds),names=new Set(details.fileNames);
 return {...content,downloads:content.downloads?.filter(file=>uploads.has(file.id)),files:content.files.filter(file=>names.has(file.name))};
}
