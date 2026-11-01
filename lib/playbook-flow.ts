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
export type PlaybookFlowProblem={message:string;nodeId?:string;choiceIndex?:number;field?:'title'|'answer'|'destination'|'start'|'connections'|'kind'|'graph'};
/** Publication remains authoritative. These messages point an author to the
 * missing connection instead of exposing schema jargon such as "Invalid". */
export function playbookFlowProblems(value:unknown):PlaybookFlowProblem[]{
 if(value===undefined||value===null)return [];
 const parsed=decisionGraphSchema.safeParse(value);if(parsed.success)return [];
 const raw=record(value),nodes=Array.isArray(raw.nodes)?raw.nodes:[],problems:PlaybookFlowProblem[]=[];
 for(const issue of parsed.error.issues){
  const index=issue.path[0]==='nodes'&&typeof issue.path[1]==='number'?issue.path[1]:undefined,node=index===undefined?{}:record(nodes[index]),nodeId=typeof node.id==='string'?node.id:undefined,name=text(node.label).trim()||`Step ${(index??0)+1}`,choiceIndex=issue.path[2]==='choices'&&typeof issue.path[3]==='number'?issue.path[3]:undefined,choice=choiceIndex===undefined?{}:record(Array.isArray(node.choices)?node.choices[choiceIndex]:undefined);
  let message=issue.message,field:PlaybookFlowProblem['field']='graph';
  if(issue.path[0]==='startId')message='Choose the first step in this procedure.';
  else if(index!==undefined&&issue.path[2]==='label')message=issue.code==='too_big'?`Shorten the name of “${name}” to 300 characters or fewer.`:`Give step ${index+1} a name so readers know what to do.`;
  else if(index!==undefined&&issue.path[2]==='id')message=`“${name}” has an invalid saved step ID. Remove that step and add it again.`;
  else if(index!==undefined&&issue.path[2]==='kind')message=`Choose whether “${name}” is a step, a decision, or an outcome.`;
  else if(choiceIndex!==undefined&&issue.path[4]==='label')message=issue.code==='too_big'?`Shorten branch ${choiceIndex+1} on “${name}” to 150 characters or fewer.`:`Name branch ${choiceIndex+1} on “${name}”, for example Yes or Not yet.`;
  else if(choiceIndex!==undefined&&issue.path[4]==='to')message=node.kind==='action'?`Choose what comes after “${name}”.`:`Choose where branch “${text(choice.label).trim()||choiceIndex+1}” on “${name}” goes.`;
  else if(index!==undefined&&issue.path[2]==='choices'&&issue.code==='too_big')message=`Keep up to four branches on “${name}”.`;
  else if(issue.path[0]==='nodes'&&index===undefined)message=issue.code==='too_big'?'Keep up to 24 steps in one procedure. Split a longer process into another procedure.':'Add a first step and an outcome to this procedure.';
  else if(issue.code!=='custom')message='This saved flow has an unsupported shape. Check its steps and connections before publishing.';
  if(issue.path[0]==='startId')field='start';
  else if(index!==undefined&&issue.path[2]==='label')field='title';
  else if(index!==undefined&&issue.path[2]==='kind')field='kind';
  else if(choiceIndex!==undefined&&issue.path[4]==='label')field='answer';
  else if(choiceIndex!==undefined&&issue.path[4]==='to')field='destination';
  else if(index!==undefined&&issue.path[2]==='choices')field='connections';
  else if(issue.message==='Choose an existing starting step.')field='start';
  problems.push({message,field,...(nodeId?{nodeId}:{}),...(choiceIndex===undefined?{}:{choiceIndex})});
 }
 const draft=playbookDraftGraph(value);
 if(draft){
  const ids=new Set(draft.nodes.map(node=>node.id));
  const replaceCustom=(message:string,replacements:PlaybookFlowProblem[])=>{for(let i=problems.length-1;i>=0;i--)if(problems[i].message===message)problems.splice(i,1);problems.push(...replacements);};
  // Canonical superRefine issues have no path. Derive their exact affected
  // controls from the actual draft rather than guessing a target from prose.
  for(const node of draft.nodes){
   const label=node.label.trim(),name=label||'Untitled step';
   if(node.kind==='decision'&&node.choices.length<2)replaceCustom(`“${label}” needs at least two branches.`,[{message:`Add at least two answers to “${name}”, then choose where each answer goes.`,nodeId:node.id,field:'connections'}]);
   if(node.kind==='action'&&node.choices.length!==1)replaceCustom(`The action “${label}” needs exactly one next step.`,[node.choices.length===0?{message:`Choose what comes after “${name}”.`,nodeId:node.id,choiceIndex:0,field:'destination'}:{message:`“${name}” has several next routes. Change it to a question or keep one next step.`,nodeId:node.id,field:'kind'}]);
   if(node.kind==='end'&&node.choices.length)replaceCustom(`The outcome “${label}” cannot have a next step.`,[{message:`An ending must stop here. Change “${name}” to a step or question to keep its next connections.`,nodeId:node.id,field:'kind'}]);
   const seenLabels=new Map<string,number>(),duplicates:PlaybookFlowProblem[]=[];
   node.choices.forEach((choice,choiceIndex)=>{const key=choice.label.trim().toLowerCase(),first=seenLabels.get(key);if(first===undefined)seenLabels.set(key,choiceIndex);else duplicates.push({message:`Give answer ${choiceIndex+1} on “${name}” a different name from answer ${first+1}.`,nodeId:node.id,choiceIndex,field:'answer'});});
   if(duplicates.length)replaceCustom(`Use distinct branch labels for “${label}”.`,duplicates);
  }
  // The canonical missing-destination message does not include its source.
  // Replace it with a direct route back to the affected inspector row.
  const missing:PlaybookFlowProblem[]=draft.nodes.flatMap(node=>node.choices.flatMap((choice,choiceIndex)=>ids.has(choice.to)?[]:[{message:node.kind==='action'?`Choose what comes after “${node.label||'Untitled step'}”.`:`Choose where branch “${choice.label||choiceIndex+1}” on “${node.label||'Untitled decision'}” goes.`,nodeId:node.id,choiceIndex,field:'destination' as const}]));
  if(missing.length){for(let i=problems.length-1;i>=0;i--)if(problems[i].message.startsWith('Choose an existing destination for'))problems.splice(i,1);problems.push(...missing);}
  const byId=new Map(draft.nodes.map(node=>[node.id,node])),visited=new Set<string>(),active=new Set<string>(),loops:PlaybookFlowProblem[]=[];
  function walk(id:string){if(visited.has(id)||!byId.has(id))return;visited.add(id);active.add(id);const node=byId.get(id)!;node.choices.forEach((choice,choiceIndex)=>{if(active.has(choice.to))loops.push({message:`Change the connection from “${node.label||'Untitled step'}” to “${byId.get(choice.to)?.label||'Untitled step'}”; it is looping back instead of reaching an outcome.`,nodeId:node.id,choiceIndex,field:'destination'});else walk(choice.to);});active.delete(id);}
  walk(draft.startId);
  const disconnected:PlaybookFlowProblem[]=draft.nodes.filter(node=>!visited.has(node.id)).map(node=>({message:`Connect “${node.label||'Untitled step'}” to a route from the first step, or remove it if it is unused.`,nodeId:node.id,field:'connections'}));
  if(disconnected.length){for(let i=problems.length-1;i>=0;i--)if(problems[i].message==='Connect every step to the starting step.')problems.splice(i,1);problems.push(...disconnected);}
  if(loops.length){for(let i=problems.length-1;i>=0;i--)if(problems[i].message==='A decision flow must reach an outcome without looping back.')problems.splice(i,1);problems.push(...loops);}
 }
 const seen=new Set<string>();return problems.filter(problem=>{const key=`${problem.nodeId||''}:${problem.choiceIndex??''}:${problem.field||''}:${problem.message}`;if(seen.has(key))return false;seen.add(key);return true;});
}
export function playbookFlowIssues(value:unknown){return [...new Set(playbookFlowProblems(value).map(issue=>issue.message))];}
export function playbookFlowLayout(value:unknown){const graph=playbookGraph(value);return graph?decisionGraphLayout(graph):[];}

type FlowNode=ProductDecisionGraph['nodes'][number];
export type PlaybookAddNodeOptions={kind:FlowNode['kind'];selectedId?:string;choiceIndex?:number;idFor?:(kind:FlowNode['kind'],index:number)=>string};
export type PlaybookAddNodeResult={graph:ProductDecisionGraph|null;selectedId:string;addedIds:string[];message:string;error?:string};
/** Explicit Add inserts into one selected route. Existing decision branches
 * and their labels stay intact; an ambiguous route is never replaced. The
 * helper creates only editable generic structure, never creator instructions. */
export function playbookAddNode(value:unknown,options:PlaybookAddNodeOptions):PlaybookAddNodeResult{
 const graph=playbookDraftGraph(value),selectedId=options.selectedId||graph?.startId||graph?.nodes[0]?.id||'';
 const fail=(message:string):PlaybookAddNodeResult=>({graph,selectedId,addedIds:[],message,error:message});
 if(value!==undefined&&value!==null&&!graph)return fail('This saved flow cannot be edited safely. Check its steps before adding another.');
 if(!['action','decision','end'].includes(options.kind))return fail('Choose Add step, Add decision, or Add outcome.');
 const current=graph||{startId:'',nodes:[]},selected=current.nodes.find(node=>node.id===selectedId);
 if(current.nodes.length&&!selected)return fail('Select a step in this procedure, then add the next part.');
 let choiceIndex=options.choiceIndex,destination='',appendBranch=false,beforeOutcome=false;
 if(selected?.kind==='end'){
  if(options.kind==='end')return fail('This route already ends here. Select a decision to add another outcome without replacing this one.');
  beforeOutcome=true;destination=selected.id;
 }else if(selected?.kind==='action'){
  if(selected.choices.length>1)return fail('This step has several next routes. Change it to a decision or keep one next step before inserting another.');
  if(choiceIndex!==undefined&&choiceIndex!==0)return fail('Select the next-step connection for this action.');
  choiceIndex=0;destination=selected.choices[0]?.to||'';
 }else if(selected?.kind==='decision'){
  if(choiceIndex!==undefined&&(!Number.isInteger(choiceIndex)||choiceIndex<0||choiceIndex>=selected.choices.length))return fail('Select an existing decision branch before inserting a step.');
  if(choiceIndex===undefined){const blank=selected.choices.findIndex(choice=>!choice.to.trim());if(blank>=0)choiceIndex=blank;else if(selected.choices.length<4){appendBranch=true;choiceIndex=selected.choices.length;}else return fail('This decision already has four branches. Choose the branch you want to add a step to.');}
  destination=selected.choices[choiceIndex]?.to||'';
 }
 const existingDestination=current.nodes.some(node=>node.id===destination);
 if(selected&&options.kind==='end'&&existingDestination)return fail('This route already leads to a step. Select an empty decision branch or add a new branch to create another outcome; the existing route is kept.');
 const needMainOutcome=options.kind!=='end'&&!existingDestination,needed=1+(options.kind==='decision'?1:0)+(needMainOutcome?1:0);
 if(current.nodes.length+needed>24)return fail(`This addition needs ${needed} available ${needed===1?'step':'steps'}. Keep up to 24 steps per procedure or start another procedure.`);
 const added:FlowNode[]=[],taken=new Set(current.nodes.map(node=>node.id));
 function id(kind:FlowNode['kind']){const value=options.idFor?options.idFor(kind,added.length):crypto.randomUUID();if(!/^[a-zA-Z0-9_-]{1,64}$/.test(value)||taken.has(value))throw new Error('The new step could not receive a unique identity. Try adding it again.');taken.add(value);return value;}
 try{
  const part:FlowNode={id:id(options.kind),label:options.kind==='decision'?'Is this ready to continue?':options.kind==='end'?'New outcome':'New step',kind:options.kind,choices:[]};added.push(part);
  if(needMainOutcome){const end:FlowNode={id:id('end'),label:'Finished',kind:'end',choices:[]};added.push(end);destination=end.id;}
  if(part.kind==='action')part.choices=[{label:'Continue',to:destination}];
  else if(part.kind==='decision'){const alternate:FlowNode={id:id('end'),label:'Review this case',kind:'end',choices:[]};added.push(alternate);part.choices=[{label:'Yes',to:destination},{label:'Not yet',to:alternate.id}];}
  let nodes=current.nodes.map(node=>({...node,choices:node.choices.map(choice=>({...choice}))})),startId=current.startId;
  if(beforeOutcome){nodes=nodes.map(node=>({...node,choices:node.choices.map(choice=>choice.to===selected!.id?{...choice,to:part.id}:choice)}));if(startId===selected!.id)startId=part.id;}
  else if(selected){nodes=nodes.map(node=>{if(node.id!==selected.id)return node;const choices=[...node.choices];if(appendBranch){let label='Another case',suffix=2;while(choices.some(choice=>choice.label.toLowerCase()===label.toLowerCase()))label=`Another case ${suffix++}`;choices.push({label,to:part.id});}else choices[choiceIndex??0]={label:choices[choiceIndex??0]?.label.trim()||(node.kind==='decision'?(choiceIndex??0)===0?'Yes':choiceIndex===1?'Not yet':`Another case ${(choiceIndex??0)+1}`:'Continue'),to:part.id};return {...node,choices};});}
  else startId=part.id;
  const next={...current,startId,nodes:[...nodes,...added]},checked=draftDecisionGraphSchema.safeParse(next);if(!checked.success)return fail('This addition would exceed the supported flow shape. Your existing steps are unchanged.');
  const message=part.kind==='decision'?(needMainOutcome?'Decision connected with Yes and Not yet routes. Rename the question, answers and outcomes to match your process.':'Decision added. Yes keeps the original route; Not yet leads to an editable review outcome. Rename the question and both routes to match your process.'):part.kind==='end'?'Outcome connected. Name the result that ends this route.':beforeOutcome?'Step inserted before this outcome. Existing incoming routes are kept.':'Step connected. Rename it and add the instructions a reader should follow.';
  return {graph:checked.data,selectedId:part.id,addedIds:added.map(node=>node.id),message};
 }catch(error){return fail(error instanceof Error?error.message:'This step could not be added. Your existing flow is unchanged.');}
}

export type PlaybookChangeNodeKindResult=PlaybookAddNodeResult&{requiresConfirmation?:boolean;affectedIds:string[];problems:PlaybookFlowProblem[]};
/** Changing an existing branch's meaning is an explicit author action. A
 * destructive conversion requires a second confirmed call, keeps every node,
 * and reports downstream nodes that now need another incoming route. */
export function playbookChangeNodeKind(value:unknown,nodeId:string,kind:FlowNode['kind'],options:{confirmDestructive?:boolean;idFor?:(kind:FlowNode['kind'],index:number)=>string}={}):PlaybookChangeNodeKindResult{
 const graph=playbookDraftGraph(value),selected=graph?.nodes.find(node=>node.id===nodeId);
 const unchanged=(message:string,error?:string,requiresConfirmation?:boolean):PlaybookChangeNodeKindResult=>({graph,selectedId:nodeId,addedIds:[],message,...(error?{error}:{}),...(requiresConfirmation?{requiresConfirmation:true}:{}),affectedIds:[],problems:playbookFlowProblems(graph)});
 if(!graph||!selected)return unchanged('Select an existing step before changing its type.','Select an existing step before changing its type.');
 if(!['action','decision','end'].includes(kind))return unchanged('Choose Step, Decision, or Outcome.','Choose Step, Decision, or Outcome.');
 if(selected.kind===kind)return unchanged('This step already has that type.');
 const byId=new Map(graph.nodes.map(node=>[node.id,node])),successor=selected.choices.find(choice=>choice.to!==selected.id&&byId.has(choice.to)),removed=kind==='end'?selected.choices:kind==='action'?selected.choices.filter(choice=>choice!==successor):[];
 if(removed.length&&!options.confirmDestructive){const message=kind==='end'?'Changing this to an outcome removes its next-step connections. All downstream steps and notes stay in the procedure and may need reconnecting.':`Changing this decision to a step keeps ${successor?`the route to “${byId.get(successor.to)?.label||'Untitled step'}”`:'one next-step route'} and removes the other branch connections. All downstream steps and notes stay.`;return unchanged(message,undefined,true);}
 const needed=(kind==='action'&&!successor?1:0)+(kind==='decision'?Math.max(0,2-selected.choices.length)+selected.choices.filter(choice=>!choice.to.trim()).length:0);
 if(graph.nodes.length+needed>24){const message=`This change needs ${needed} available ${needed===1?'step':'steps'}. Keep up to 24 steps per procedure or start another procedure.`;return unchanged(message,message);}
 const added:FlowNode[]=[],taken=new Set(byId.keys());
 function ending(label:string){const id=options.idFor?options.idFor('end',added.length):crypto.randomUUID();if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id)||taken.has(id))throw new Error('The new outcome could not receive a unique identity. Try the change again.');taken.add(id);const node:FlowNode={id,label,kind:'end',choices:[]};added.push(node);return id;}
 try{
  let choices:FlowNode['choices']=[];
  if(kind==='action')choices=[successor?{...successor,label:successor.label.trim()||'Continue'}:{label:'Continue',to:ending('Finished')}];
  else if(kind==='decision'){
   choices=selected.choices.map((choice,index)=>({...choice,label:choice.label.trim()&&choice.label.trim().toLowerCase()!=='continue'?choice.label:index===0?'Yes':index===1?'Not yet':`Another case ${index}`,to:choice.to.trim()?choice.to:ending(index===0?'Finished':'Review this case')}));
   if(!choices.length)choices.push({label:'Yes',to:ending('Finished')});
   if(choices.length<2)choices.push({label:choices[0].label.toLowerCase()==='not yet'?'Another case':'Not yet',to:ending('Review this case')});
  }
  const next={...graph,nodes:[...graph.nodes.map(node=>node.id===nodeId?{...node,kind,choices}:node),...added]},problems=playbookFlowProblems(next),previousDisconnected=new Set(playbookFlowProblems(graph).filter(problem=>problem.nodeId&&problem.message.startsWith('Connect “')).map(problem=>problem.nodeId)),affectedIds=[...new Set(problems.filter(problem=>problem.nodeId&&problem.message.startsWith('Connect “')&&!previousDisconnected.has(problem.nodeId)).map(problem=>problem.nodeId!))];
  return {graph:next,selectedId:nodeId,addedIds:added.map(node=>node.id),message:kind==='decision'?'Decision connected. Rename the question and its answers to match your process.':kind==='end'?'This step is now an outcome. Its downstream steps and notes are kept; reconnect any unused steps before publishing.':'This is now a step with one next route. Other steps and notes are kept.',affectedIds,problems};
 }catch(error){const message=error instanceof Error?error.message:'This change could not be applied. Your flow is unchanged.';return unchanged(message,message);}
}

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
