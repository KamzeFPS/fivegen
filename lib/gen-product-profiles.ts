import {z} from 'zod';
import {builderTypeDetails,builderTypes,type BuilderType,type BuilderDraft} from './builder-contract';
import {fileSchema,contentSchema,type ProductContent} from './product';
import {decisionGraphSchema,type ProductDecisionGraph} from './product-decision-contract';
import {productStudioSchema,productStudioPublicationSchema,type ProductStudioConfig} from './product-studio-contract';

export type GenProductProfile={type:BuilderType;format:string;unit:string;purpose:string;essentialQuestions:string[];artifactRequirements:string[];limitations:string[]};
const commonQuestions=['Who will use this, what specific problem do they face, and what useful result should the product help them reach?','What experience, examples, original methods or supporting files should make this yours?','Should buyers use it in the app, download files, or both?'];
const profiles:Record<BuilderType,Omit<GenProductProfile,'type'|'format'|'unit'>>={
 book:{purpose:'A coherent readable manuscript: narrative/fiction when requested, or useful nonfiction for the promised subject.',essentialQuestions:['What reading experience or useful result should the book deliver, and what scope, story or finished source material must be preserved?'],artifactRequirements:['Actual chapter prose with a coherent reading or narrative sequence, not chapter summaries.','Use explanations, examples or exercises only when appropriate; fiction must not acquire a compulsory teaching/workbook formula.'],limitations:['This text operation writes a manuscript; it does not create recorded media or a hundred-page binary book.']},
 guide:{purpose:'A practical sequence that helps a reader complete one defined task.',essentialQuestions:['What task should the reader finish, what do they start with, and how will they know they are done?'],artifactRequirements:['Each step contains instructions, a practical action checklist and a visible objective.','Include worked examples and supporting resources only where useful.'],limitations:['Downloads must refer to actual authored files; a promised resource description is not a file.']},
 playbook:{purpose:'An operational process with usable actions, decisions and outcomes.',essentialQuestions:['When is this process used, who follows it, what inputs exist, and what decisions or exceptions change the next action?'],artifactRequirements:['Each procedure identifies trigger, role, inputs and expected output.','A connected, acyclic decisionGraph with real branch conditions and complete action-node instructions.'],limitations:['Do not fabricate branching rules; a genuinely linear procedure can use a linear action-to-outcome flow.']},
 'mini-course':{purpose:'A focused sequence of useful written lessons and practical exercises.',essentialQuestions:['What skill should learners demonstrate, what do they already know, and what practice will show understanding?'],artifactRequirements:['Complete lesson teaching and an actual practical task for each lesson.','A coherent curriculum assigning every lesson once; optional useful knowledge checks and submissions.'],limitations:['Written teaching is not an uploaded video. Do not claim recordings, grades, completion or certificates were created.']},
 'video-course':{purpose:'A structured course curriculum with useful lessons and a clear recording handoff.',essentialQuestions:['What is the course outcome, how should lessons be grouped, and do you have actual recordings or need a written-first curriculum to record?'],artifactRequirements:['Modules contain complete written lessons, examples and practical activities.','Use actual uploaded recordings through a separate reviewed attachment action; until then the lesson is text.'],limitations:['This text operation cannot generate video/audio binaries, captions for unseen footage or pretend an uploaded recording exists.']},
 'template-kit':{purpose:'Actual reusable editable files with clear instructions and useful examples.',essentialQuestions:['What recurring task will the files make easier, which real file formats/software should they work with, and what should be blank versus a worked example?'],artifactRequirements:['Every listed template resolves to a real authored file and explains when/how to use it.','Deliver actual Markdown, CSV, text, HTML, JSON or supported code files; include examples when useful or promised.'],limitations:['Do not invent native XLSX, DOCX, Canva, Notion or cloud duplication assets. Source-app URLs and uploaded originals require actual creator-provided assets.']},
 challenge:{purpose:'A practical sequence of small activities with honest reflection and next steps.',essentialQuestions:['What will participants practice each day, how much time can they spend, and are check-ins optional or reviewed?'],artifactRequirements:['Each day has a useful activity and concrete action checklist.','Include useful examples, optional check-in prompts and actual resources without inventing completion.'],limitations:['No fabricated streaks, participant posts, earned rewards or guaranteed clients/results.']},
 consulting:{purpose:'A human-delivered mentorship offer with scope, preparation and intake.',essentialQuestions:['What can you personally help with, how many sessions and how long are they, what is excluded, and what should clients prepare?'],artifactRequirements:['A specific service scope, useful preparation, intake questions and honest written resources.','Only creator-confirmed session count, duration/timezone and actual meeting availability should be configured.'],limitations:['Generated preparation does not deliver the human session, create availability, connect a calendar or invent credentials/client outcomes.']},
 coaching:{purpose:'A focused human coaching appointment with useful preparation and follow-up guidance.',essentialQuestions:['What is the appointment for, what is its scope and duration, and what should the client bring or answer beforehand?'],artifactRequirements:['A clear human service scope, preparation and focused intake.','Written follow-up guidance is a resource, not invented notes from an appointment that never happened.'],limitations:['No fake live call, booking, transcript, coach answer or completed action plan.']},
 community:{purpose:'A useful native member welcome, spaces, rules and onboarding path.',essentialQuestions:['What brings members together, what should a first visit lead to, which spaces are useful, and what participation rules apply?'],artifactRequirements:['A real welcome, practical rules, named channels and useful onboarding steps.','An introduction prompt and permitted destination; real authored starting resources when helpful.'],limitations:['No invented members, posts, events, paid tiers, integrations or member activity. Do not enable sales or schedule posts automatically.']},
 custom:{purpose:'A clearly defined supported content/file deliverable that solves the chosen problem.',essentialQuestions:['What exactly will buyers receive and use, which parts are written content versus actual files, and what is outside the supported delivery?'],artifactRequirements:['Define the supported content/file components and deliver each actual component.','Use concrete instructions and usable files rather than a vague promise of a future app or service.'],limitations:['Do not fabricate physical fulfillment, external apps, payments, sessions, accounts or third-party integrations.']},
};
export function genProductProfile(typeOrFormat:string):GenProductProfile{
 const type=(builderTypes as readonly string[]).includes(typeOrFormat)?typeOrFormat as BuilderType:(builderTypes.find(type=>builderTypeDetails[type].format===typeOrFormat));
 if(!type)throw new Error('Choose a supported product type.');
 return {type,format:builderTypeDetails[type].format,unit:builderTypeDetails[type].unit,...profiles[type],essentialQuestions:[...commonQuestions,...profiles[type].essentialQuestions]};
}
export const genProductProfiles=builderTypes.map(type=>genProductProfile(type));

const text=z.string().trim().min(1),optionalText=z.string().nullish().transform(value=>value??undefined),fileNames=z.array(z.string().min(1)).max(20).nullish().transform(value=>value??undefined);
const quizSchema=z.object({question:text.max(2000),options:z.array(text.max(1000)).min(2).max(8),correctIndex:z.number().int().nonnegative(),explanation:z.string().max(50000).nullish().transform(value=>value??undefined)}).strict().refine(value=>value.correctIndex<value.options.length,'Choose an answer from the listed quiz options.');
const nodeDetailsSchema=z.record(z.object({body:text,inputs:optionalText,example:optionalText,fileNames}).strict());
const sectionShape={title:text.max(150),objective:text.max(1500),body:text,example:optionalText,actions:z.array(text.max(3000)).max(20).nullish().transform(value=>value??undefined),practice:optionalText,minutes:z.number().int().min(1).max(1440).nullish().transform(value=>value??undefined),fileNames};
type NodeDetails={body:string;inputs?:string;example?:string;fileNames?:string[]};
export type GeneratedSection={title:string;objective:string;body:string;example?:string;actions?:string[];practice?:string;minutes?:number;fileNames?:string[];checkIn?:string;quiz?:{question:string;options:string[];correctIndex:number;explanation?:string}[];assignment?:{prompt:string;required:false};trigger?:string;role?:string;inputs?:string;outputs?:string;decisionGraph?:ProductDecisionGraph;nodeDetails?:Record<string,NodeDetails>};
export type GeneratedArtifact={sections:GeneratedSection[];benefits:string[];files:NonNullable<ProductContent['files']>;book?:{subtitle?:string};course?:{modules:{title:string;description?:string;lessonIndexes:number[]}[]};templates?:{usageInstructions:string;compatibleTools:string;items:{name:string;description:string;useCase:string;software:string;blankFileName:string;exampleFileName?:string;steps:string[]}[]};service?:{scope:string;preparation:string;intakePrompt:string;intakeQuestions:string[]};community?:{welcome:string;rules:string;channels:string[];requireAgreement:boolean;requireProfile:boolean;introPrompt:string;introductionChannel?:string;steps:{title:string;body:string}[]};custom?:{deliveryKinds:('content'|'files')[];blocks:{title:string;body:string}[]}};
export type GeneratedBuilderPatch={fields:Record<string,string>;studio:ProductStudioConfig};
export type PreparedGeneratedProduct=ProductContent&{builderPatch:GeneratedBuilderPatch};

/** Provider shape is type-specific; binary uploads, private links, pricing,
 * events and activity are deliberately absent from the generated authority. */
function generatedArtifactObject(typeOrFormat:string,sectionCount:number){
 if(!Number.isInteger(sectionCount)||sectionCount<1||sectionCount>30)throw new Error('Use 1–30 useful content units.');
 const {type}=genProductProfile(typeOrFormat),shape:Record<string,z.ZodTypeAny>={...sectionShape},extra:Record<string,z.ZodTypeAny>={};
 if(type==='guide'||type==='challenge')shape.actions=z.array(text.max(3000)).min(1).max(20);
 if(type==='challenge')shape.checkIn=optionalText;
 if(type==='playbook')Object.assign(shape,{trigger:text,role:text,inputs:text,outputs:text,decisionGraph:decisionGraphSchema,nodeDetails:nodeDetailsSchema});
 if(type==='mini-course'||type==='video-course'){
  Object.assign(shape,{practice:text,quiz:z.array(quizSchema).max(30).nullish().transform(value=>value??undefined),assignment:z.object({prompt:text.max(10000),required:z.literal(false)}).strict().nullish().transform(value=>value??undefined)});
  extra.course=z.object({modules:z.array(z.object({title:text.max(150),description:z.string().max(1500).nullish().transform(value=>value??undefined),lessonIndexes:z.array(z.number().int().min(0).max(sectionCount-1)).min(1).max(30)}).strict()).min(1).max(30)}).strict();
 }
 if(type==='book')extra.book=z.object({subtitle:z.string().max(1500).nullish().transform(value=>value??undefined)}).strict().nullish().transform(value=>value??undefined);
 if(type==='template-kit')extra.templates=z.object({usageInstructions:text.max(6000),compatibleTools:text.max(6000),items:z.array(z.object({name:text.max(200),description:text.max(3000),useCase:text.max(3000),software:text.max(3000),blankFileName:text,exampleFileName:optionalText,steps:z.array(text).min(1).max(20)}).strict()).min(1).max(100)}).strict();
 if(type==='consulting'||type==='coaching')extra.service=z.object({scope:text.max(6000),preparation:text.max(6000),intakePrompt:text.max(1000),intakeQuestions:z.array(text.max(500)).max(15)}).strict();
 if(type==='community')extra.community=z.object({welcome:text.max(6000),rules:text.max(6000),channels:z.array(text.max(80)).min(1).max(20),requireAgreement:z.boolean(),requireProfile:z.boolean(),introPrompt:z.string().max(3000),introductionChannel:optionalText,steps:z.array(z.object({title:text.max(180),body:text.max(5000)}).strict()).min(1).max(20)}).strict();
 if(type==='custom')extra.custom=z.object({deliveryKinds:z.array(z.enum(['content','files'])).min(1).max(2),blocks:z.array(z.object({title:text.max(50000),body:text.max(50000)}).strict()).min(1).max(30)}).strict();
 return z.object({sections:z.array(z.object(shape).strict()).length(sectionCount),benefits:z.array(text.max(300)).min(1).max(8),files:z.array(fileSchema.extend({content:text.max(100000)})).max(20).default([]),...extra}).strict();
}
export function generatedArtifactSchema(typeOrFormat:string,sectionCount:number):z.ZodType<GeneratedArtifact>{return generatedArtifactObject(typeOrFormat,sectionCount) as unknown as z.ZodType<GeneratedArtifact>;}
export function generatedSectionArtifactSchema(typeOrFormat:string){return ((generatedArtifactObject(typeOrFormat,1).shape.sections as z.ZodArray<z.AnyZodObject>).element).omit({title:true,objective:true});}
export function generatedArtifactPackageSchema(typeOrFormat:string,sectionCount:number,options:{includeSectionMetadata?:boolean}={}){
 const base=generatedArtifactObject(typeOrFormat,sectionCount).omit({sections:true,benefits:true});
 return options.includeSectionMetadata?base.extend({sectionArtifacts:z.array(generatedSectionArtifactSchema(typeOrFormat).omit({body:true}).extend({sectionIndex:z.number().int().min(0).max(sectionCount-1)})).length(sectionCount)}):base;
}

export function generatedArtifactIssues(typeOrFormat:string,artifact:GeneratedArtifact):string[]{
 const {type}=genProductProfile(typeOrFormat),issues:string[]=[],names=new Set(artifact.files.map(file=>file.name)),used=new Set<number>();
 const references=(refs:string[]|undefined,label:string)=>{for(const name of refs||[])if(!names.has(name))issues.push(`${label} refers to a supporting file that was not actually created: ${name}.`);};
 if(new Set(artifact.files.map(file=>file.name.toLowerCase())).size!==artifact.files.length)issues.push('Use a distinct name for every actual file.');
 artifact.sections.forEach((section,index)=>{references(section.fileNames,`Content unit${index+1}`);if(type==='playbook'&&section.decisionGraph){const ids=new Set(section.decisionGraph.nodes.map(node=>node.id));for(const [id,detail] of Object.entries(section.nodeDetails||{})){if(!ids.has(id))issues.push('Procedure notes refer to a node outside the actual decision flow.');references(detail.fileNames,'Procedure node');}for(const node of section.decisionGraph.nodes)if(node.kind==='action'&&!section.nodeDetails?.[node.id]?.body?.trim())issues.push(`Add usable instructions for the action “${node.label}”.`);}});
 for(const module of artifact.course?.modules||[])for(const index of module.lessonIndexes){if(used.has(index))issues.push('A lesson can belong to one curriculum module.');used.add(index);}
 if(artifact.course&&used.size!==artifact.sections.length)issues.push('Assign every generated lesson to its curriculum module.');
 if(type==='template-kit'){if(!artifact.files.length)issues.push('A template kit needs actual editable files.');for(const item of artifact.templates?.items||[])references([item.blankFileName,...(item.exampleFileName?[item.exampleFileName]:[])],`Template “${item.name}”`);}
 if(artifact.community){if(new Set(artifact.community.channels).size!==artifact.community.channels.length)issues.push('Use distinct community channel names.');if(artifact.community.introductionChannel&&!artifact.community.channels.includes(artifact.community.introductionChannel))issues.push('Choose an introduction channel that actually exists.');}
 if(artifact.custom?.deliveryKinds.includes('files')&&!artifact.files.length)issues.push('The chosen custom file delivery needs actual files.');
 for(const file of artifact.files)if(file.name.toLowerCase().endsWith('.json')){try{JSON.parse(file.content);}catch{issues.push(`The generated JSON file “${file.name}” is not valid JSON.`);}}
 return [...new Set(issues)];
}

export function mapGeneratedSection(typeOrFormat:string,section:GeneratedSection,id=crypto.randomUUID()):ProductContent['sections'][number]{
  const profile=genProductProfile(typeOrFormat);
  const meta:Record<string,unknown>={},actions=(section.actions||[]).map((text,index)=>({id:`action-${index}`,text}));let body=section.body;
  if(section.minutes)meta.minutes=section.minutes;
  if(profile.type==='guide')Object.assign(meta,{guideExample:section.example||'',guideChecklist:actions,guideFileNames:section.fileNames||[],guideUploadIds:[]});
  else if(profile.type==='challenge')Object.assign(meta,{kind:'text',challengeExample:section.example||'',challengeChecklist:actions,challengeFileNames:section.fileNames||[],challengeUploadIds:[],...(section.checkIn?{assignment:{prompt:section.checkIn,required:false},reflection:section.checkIn}:{})});
  else if(profile.type==='mini-course'||profile.type==='video-course')Object.assign(meta,{kind:'text',courseExample:section.example||'',actionStep:section.practice||'',courseFileNames:section.fileNames||[],courseUploadIds:[],...(section.quiz?{quiz:section.quiz}:{}),...(section.assignment?{assignment:section.assignment}:{})});
  else if(profile.type==='playbook')Object.assign(meta,{trigger:section.trigger,role:section.role,inputs:section.inputs,outputs:section.outputs,decisionGraph:section.decisionGraph,playbookNodeDetails:Object.fromEntries(Object.entries(section.nodeDetails||{}).map(([id,detail])=>[id,{...detail,uploadIds:[],fileNames:detail.fileNames||[]}]))});
  else{if(section.example&&!body.includes(section.example))body+='\n\n## Example\n\n'+section.example;if(actions.length)meta.actionStep=actions.map(action=>'- '+action.text).join('\n');if(section.practice)meta.actionStep=section.practice;}
  return {id,title:section.title,objective:section.objective,body,...(Object.keys(meta).length?{studio:JSON.parse(JSON.stringify(meta)) as Record<string,unknown>}:{})};
}
export function mapGeneratedArtifact(typeOrFormat:string,input:GeneratedArtifact,options:{idFor?:(kind:string,index:number)=>string;delivery?:'in_app'|'download'|'both'}={}):PreparedGeneratedProduct{
 const profile=genProductProfile(typeOrFormat),artifact=generatedArtifactSchema(typeOrFormat,input.sections.length).parse(input),issues=generatedArtifactIssues(typeOrFormat,artifact);if(issues.length)throw new Error(issues[0]);
 const idFor=options.idFor||(()=>crypto.randomUUID()),sectionIds=artifact.sections.map((_,index)=>idFor('section',index)),fields:Record<string,string>={},studio:ProductStudioConfig={};
 const sections=artifact.sections.map((section,index)=>mapGeneratedSection(typeOrFormat,section,sectionIds[index]));
 if(profile.type==='book'){studio.writing={showToc:true};if(artifact.book?.subtitle)fields.subtitle=artifact.book.subtitle;}
 if(artifact.course)studio.course={modules:artifact.course.modules.map((module,index)=>({id:idFor('module',index),title:module.title,description:module.description||'',lessonIds:module.lessonIndexes.map(index=>sectionIds[index])})),learning:{release:'all',requirePrevious:false,certificate:false}};
 if(artifact.templates){fields.usageInstructions=artifact.templates.usageInstructions;fields.compatibleTools=artifact.templates.compatibleTools;studio.templates={items:artifact.templates.items.map((item,index)=>({...item,id:idFor('template',index),blankUploadId:'',exampleUploadId:'',exampleFileName:item.exampleFileName||''}))};}
 if(artifact.service){const value=artifact.service;Object.assign(fields,{serviceScope:value.scope,preparation:value.preparation,intakePrompt:value.intakePrompt,durationMinutes:'',timezone:''});studio.service={intakeQuestions:value.intakeQuestions,...(profile.type==='coaching'?{sessionCount:1}:{})};}
 if(artifact.community){const value=artifact.community;Object.assign(fields,{welcome:value.welcome,rules:value.rules,memberPromise:artifact.benefits.join('\n')});studio.community={enabled:true,requireAgreement:value.requireAgreement,channels:value.channels,allowMemberPosts:true,events:[],onboarding:{requireProfile:value.requireProfile,introPrompt:value.introPrompt,...(value.introductionChannel?{introductionChannel:value.introductionChannel}:{}),steps:value.steps.map((step,index)=>({...step,id:idFor('onboarding',index),url:''}))},weeklyPrompts:[]};}
 if(artifact.custom){fields.customDelivery=options.delivery==='in_app'?'content':artifact.custom.deliveryKinds.includes('files')?'downloads':'content';studio.custom={deliveryKinds:artifact.custom.deliveryKinds,blocks:artifact.custom.blocks.map((block,index)=>({...block,id:idFor('block',index),kind:'text'}))};}
 if(profile.type==='challenge')studio.challenge={allowSubmissions:true,groupFeed:false,leaderboard:false,learning:{release:'all',requirePrevious:false,certificate:false}};
 productStudioSchema.parse(studio);productStudioPublicationSchema.parse(studio);
 return {...contentSchema.parse({sections,benefits:artifact.benefits,files:artifact.files,launch:''}),builderPatch:{fields,studio}};
}

const generatedFieldKeys=new Set(['subtitle','serviceScope','preparation','intakePrompt','durationMinutes','timezone','usageInstructions','compatibleTools','welcome','rules','memberPromise','customDelivery']);
const generatedStudioKeys=new Set(['writing','course','templates','service','community','custom','challenge']);
export const generatedBuilderPatchSchema=z.object({fields:z.record(z.string().max(6000)).refine(fields=>Object.keys(fields).every(key=>generatedFieldKeys.has(key)),'Generated settings include a field outside the product artifact.'),studio:productStudioSchema.refine(studio=>Object.keys(studio).every(key=>generatedStudioKeys.has(key)),'Generated settings include operational configuration outside the product artifact.')}).strict();
/** Initial adoption has no editor to overwrite. Explicit Apply may replace
 * generated content, while real links, prices, access and learning rules stay. */
export function applyGeneratedBuilderPatch(draft:BuilderDraft,input:unknown,preserveConfigured=true):BuilderDraft{
 const patch=generatedBuilderPatchSchema.parse(input),fields={...draft.fields,...patch.fields},studio:ProductStudioConfig={...draft.studio};
 if(preserveConfigured)for(const key of ['durationMinutes','timezone','customDelivery'])if(draft.fields[key])fields[key]=draft.fields[key];
 for(const [key,value] of Object.entries(patch.studio)){
  if(!preserveConfigured){studio[key]=value;continue;}
  const prior=draft.studio?.[key];if(!prior||typeof prior!=='object'||Array.isArray(prior)||!value||typeof value!=='object'||Array.isArray(value)){studio[key]=value;continue;}
  const old=prior as Record<string,unknown>,next=value as Record<string,unknown>;
  if(key==='course')studio[key]={...old,...next,learning:{...(next.learning as Record<string,unknown>||{}),...(old.learning as Record<string,unknown>||{})}};
  else if(key==='templates')studio[key]={...next,...old,items:next.items};
  else if(key==='custom')studio[key]={...next,...old,blocks:next.blocks};
  else if(key==='service')studio[key]={...next,...old,intakeQuestions:next.intakeQuestions as string[]|undefined};
  else if(key==='community'){
   const oldOnboarding=(old.onboarding||{}) as Record<string,unknown>,newOnboarding=(next.onboarding||{}) as Record<string,unknown>,onboarding:Record<string,unknown>={...newOnboarding,...oldOnboarding,steps:newOnboarding.steps,introPrompt:newOnboarding.introPrompt};
   const channels=(old.channels||next.channels||[]) as string[],target=oldOnboarding.introductionChannel||newOnboarding.introductionChannel;
   if(typeof target==='string'&&channels.includes(target))onboarding.introductionChannel=target;else delete onboarding.introductionChannel;
   studio[key]={...next,...old,onboarding} as ProductStudioConfig['community'];
  }
  else studio[key]={...next,...old};
 }
 productStudioSchema.parse(studio);return {...draft,fields,studio};
}

export function genProductInstructions(typeOrFormat:string){const profile=genProductProfile(typeOrFormat);return `${profile.purpose}\nRequired artifacts:\n${profile.artifactRequirements.map(item=>'- '+item).join('\n')}\nBoundaries:\n${profile.limitations.map(item=>'- '+item).join('\n')}\nReturn the type-specific structured fields in the supplied schema. Use only actual authored filenames for resources. Examples are illustrative, not invented evidence. Do not generate pricing, private URLs, upload IDs, availability, activity or third-party assets. Optional resources may be empty when they do not serve the product.`;}
