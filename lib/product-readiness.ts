import {builderFamily,builderTypeDetails,type BuilderDraft,type BuilderCheck} from './builder-contract';
import type {SectionStudio} from './product-studio-contract';
import type {SaleUpload} from './file-sale-contract';

export type ProductReadinessLocation={step:'details'|'content'|'review';field?:string;sectionIndex?:number;fileIndex?:number;uploadId?:string};
export type ProductReadinessCheck={key:string;status:'ready'|'blocker'|'advisory';title:string;message:string;action?:string;location:ProductReadinessLocation};
export type ProductReadinessReport={ready:boolean;blockers:number;advisories:number;checks:ProductReadinessCheck[];originalFileOnly:boolean};
type ReadinessOptions={uploads?:SaleUpload[];serverChecks?:BuilderCheck[]};

// Only whole-field drafting stubs block publication. Quoted examples and
// reusable template placeholders remain valid content and may receive advice.
export function isUnfinishedPlaceholder(value:string){
 const text=value.trim().replace(/^#+\s*/, '').replace(/[.!]+$/, '').trim();
 return /^(?:tbd|todo|to be (?:written|added|completed)|coming soon|content (?:goes here|coming soon)|(?:write|add|insert|replace with) (?:your |the |a )?(?:content|text|chapter|description|title|answer|details)(?: here)?|lorem ipsum(?:\s+dolor sit amet)?(?:\s*\.\.\.)?)$/i.test(text)
  || /^\[(?:(?:insert|add|write|replace|your)\b[^\]\n]{0,120}|tbd|todo|placeholder)\]$/i.test(text)
  || /^\{\{\s*(?:title|description|content|chapter|insert\b[^}\n]*)\s*\}\}$/i.test(text);
}
function normalized(value:string){return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
export function findRepeatedSectionBodies(sections:{body:string}[]){
 const first=new Map<string,number>(),duplicates:{index:number;matchesIndex:number}[]=[];
 sections.forEach((section,index)=>{const body=normalized(section.body);if(body.length<80)return;const previous=first.get(body);if(previous===undefined)first.set(body,index);else duplicates.push({index,matchesIndex:previous});});
 return duplicates;
}
export function sectionHasContent(section:{body:string;videoId?:string;studio?:SectionStudio}){const meta=section.studio;return !!(section.body.trim()||section.videoId||typeof meta?.audioId==='string'&&meta.audioId||Array.isArray(meta?.quiz)&&meta.quiz.length||typeof meta?.assignment?.prompt==='string'&&meta.assignment.prompt.trim());}
export function unfinishedSectionIndexes(sections:{title:string;body:string;videoId?:string;studio?:SectionStudio}[]){
 return sections.flatMap((section,index)=>!section.title.trim()||isUnfinishedPlaceholder(section.title)||!sectionHasContent(section)||isUnfinishedPlaceholder(section.body)?[index]:[]);
}
function hasPracticalTask(value:string){return /(?:\b(?:exercise|worksheet|checklist|practice|task|action|try this|your turn|reflection|write down|complete|apply|prompt|step\s*\d+)\b|\[[ xX]\])/i.test(value);}
function validHttps(value:string){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}

/** A local editorial check, never an AI quality score or a claim about results.
 * Storage integrity and merchant eligibility remain authoritative server checks.
 */
export function evaluateProductReadiness(draft:BuilderDraft,options:ReadinessOptions={}):ProductReadinessReport{
 const checks:ProductReadinessCheck[]=[],family=builderFamily(draft),info=builderTypeDetails[draft.type];
 const add=(key:string,status:ProductReadinessCheck['status'],title:string,message:string,location:ProductReadinessLocation,action?:string)=>checks.push({key,status,title,message,location,...(action?{action}:{})});
 const essential=(key:'title'|'description'|'audience',min:number,label:string)=>{
  const value=draft[key].trim(),ready=value.length>=min&&!isUnfinishedPlaceholder(value);
  add(`essential-${key}`,ready?'ready':'blocker',label,ready?`${label} is filled in.`:`Add ${key==='audience'?'the intended reader or customer':`a finished ${label.toLowerCase()}`} (${min} characters minimum).`,{step:'details',field:key},`Edit ${label.toLowerCase()}`);
 };
 essential('title',3,'Product name');essential('description',12,'Description');essential('audience',3,'Audience');
 const hasDownload=draft.uploadIds.length>0,hasEditable=draft.files.some(file=>!!file.content.trim()),hasSections=draft.sections.length>0;
 const templateLinks=Array.isArray(draft.studio?.templates?.items)&&(draft.studio.templates.items as {duplicateUrl?:string}[]).some(item=>validHttps(item.duplicateUrl||''));
 const customBlocks=draft.type==='custom'&&Array.isArray(draft.studio?.custom?.blocks)&&(draft.studio.custom.blocks as {kind?:string;body?:string;url?:string}[]).some(item=>item.body?.trim()||validHttps(item.url||'')||['session','physical'].includes(item.kind||''));
 const originalFileOnly=hasDownload&&!hasSections&&!draft.files.length;
 const bodyComplete=draft.sections.length>0&&draft.sections.every(section=>!!section.title.trim()&&sectionHasContent(section));
 if(['document','custom'].includes(family)&&(!hasSections||bodyComplete||hasDownload||hasEditable||customBlocks||draft.type==='custom'&&(draft.studio?.custom?.deliveryKinds as string[]|undefined)?.includes('community')))add('content-present',bodyComplete||hasDownload||hasEditable||customBlocks?'ready':'blocker','Product content',bodyComplete||hasDownload||hasEditable||customBlocks?(originalFileOnly?'Your original file is the finished product. Extra chapters are optional.':'Your product includes content or attached original files.'):'Write the content, create an editable resource, or attach your finished file.',{step:'content'},'Add content or upload a file');
 if(family==='templates'){
  if(!draft.files.length||hasDownload||hasEditable)add('templates-present',hasDownload||hasEditable||templateLinks?'ready':'blocker','Reusable templates',hasDownload||hasEditable||templateLinks?'Your reusable files are included.':'Attach actual reusable files or fill in an editable template. A description alone is not a template.',{step:'content'},'Add template files');
  const instructions=!!draft.fields.usageInstructions?.trim()&&!isUnfinishedPlaceholder(draft.fields.usageInstructions)||bodyComplete;
  if(instructions||!hasSections)add('template-instructions',instructions?'ready':'blocker','How to use the templates',instructions?'Usage instructions are included.':'Explain how to copy, customize, and use the templates.',{step:'details',field:'usageInstructions'},'Add usage instructions');
 }
 if((family==='course'||family==='challenge')&&(!hasSections||bodyComplete))add('learning-content',bodyComplete?'ready':'blocker',family==='course'?'Lessons':'Daily activities',bodyComplete?'Each added item has written content or a recording.':`Add finished ${family==='course'?'lesson content or recordings':'activity instructions'} to every item.`,{step:'content'},`Edit ${family==='course'?'lessons':'activities'}`);
 if(family==='service'){
  for(const [key,label] of [['serviceScope','Service scope'],['outcome','Session outcome'],['preparation','Client preparation']] as const){const ready=!!draft.fields[key]?.trim()&&!isUnfinishedPlaceholder(draft.fields[key]);add(`service-${key}`,ready?'ready':'blocker',label,ready?`${label} is included.`:`Describe ${label.toLowerCase()} so clients know what to expect.`,{step:'details',field:key},`Edit ${label.toLowerCase()}`);}
  const duration=Number(draft.fields.durationMinutes),ready=duration>=15&&duration<=180;
  add('service-duration',ready?'ready':'blocker','Session duration',ready?'Session duration is set.':'Set a session duration between 15 and 180 minutes.',{step:'details',field:'durationMinutes'},'Set duration');
 }
 if(family==='community')for(const [key,label] of [['memberPromise','Member promise'],['welcome','Member welcome'],['rules','Community rules']] as const){const ready=!!draft.fields[key]?.trim()&&!isUnfinishedPlaceholder(draft.fields[key]);add(`community-${key}`,ready?'ready':'blocker',label,ready?`${label} is included.`:`Add your ${label.toLowerCase()} to make onboarding clear.`,{step:'details',field:key},`Edit ${label.toLowerCase()}`);}

 const bodies=new Map<string,number>(),titles=new Map<string,number>();
 draft.sections.forEach((section,index)=>{
  const name=section.title.trim()||`${info.unit} ${index+1}`,location={step:'content' as const,sectionIndex:index};
  const emptyContent=!sectionHasContent(section);
  if((!section.title.trim()||isUnfinishedPlaceholder(section.title))&&!emptyContent)add(`section-title-${index}`,'blocker',`Finish ${info.unit.toLowerCase()} ${index+1}'s title`,'Replace the drafting label with the actual title.',location,'Edit title');
  if(emptyContent)add(`section-empty-${index}`,'blocker',`${name} needs content`,!section.title.trim()||isUnfinishedPlaceholder(section.title)?'Add a real title and usable content, or remove this unused item.':'Write usable content, attach a recording where supported, or remove this unused item.',location,'Add content');
  else if(section.body.trim()&&isUnfinishedPlaceholder(section.body))add(`section-stub-${index}`,'blocker',`${name} is still a draft`,'Replace the placeholder with the finished content. A title or drafting instruction is not the deliverable.',location,'Finish this item');
  else if(!section.videoId&&section.body.trim().length>0&&section.body.trim().length<100)add(`section-thin-${index}`,'advisory',`Review the depth of ${name}`,'This item is brief. Check that it delivers its promised idea, example, or activity; short content may be intentional.',location,'Review content');
  else if(/\[(?:insert|add|write|replace|your)\b[^\]\n]{0,100}\]|\b(?:TODO|TBD)\b|lorem ipsum/i.test(section.body)&&family!=='templates')add(`section-placeholder-${index}`,'advisory',`Check drafting markers in ${name}`,'A possible placeholder remains. Keep it if it is an intentional example; otherwise replace it.',location,'Review marker');
  const paragraphs=section.body.split(/\n\s*\n/).map(normalized).filter(value=>value.length>=120);
  if(new Set(paragraphs).size<paragraphs.length)add(`section-paragraph-repeat-${index}`,'advisory',`Check repeated passages in ${name}`,'A longer paragraph appears more than once in this item. Review it for accidental repetition.',location,'Review repeated passage');
  const body=normalized(section.body),title=normalized(section.title),prior=bodies.get(body),priorTitle=titles.get(title);
  if(body.length>=80&&prior!==undefined)add(`section-repeat-${index}`,'advisory',`${name} repeats another item`,`The written content matches ${info.unit.toLowerCase()} ${prior+1}. Check whether each item delivers something distinct.`,location,'Review repeated content');
  else if(body.length>=80)bodies.set(body,index);
  if(title&&priorTitle!==undefined)add(`section-title-repeat-${index}`,'advisory',`${name} has a repeated title`,`It shares a title with ${info.unit.toLowerCase()} ${priorTitle+1}. Use distinct titles when they cover different material.`,location,'Review title');
  else if(title)titles.set(title,index);
  if(section.videoId&&options.uploads){const recording=options.uploads.find(file=>file.id===section.videoId);if(!recording||recording.status!=='completed'||!['video/mp4','video/webm'].includes(recording.mime))add(`recording-${index}`,'blocker',`${name} recording is unavailable`,'Attach a completed MP4 or WebM recording, or provide the lesson in writing.',location,'Replace recording');}
 });
 draft.files.forEach((file,index)=>{
  const location={step:'content' as const,fileIndex:index};
  if(!file.content.trim())add(`file-empty-${index}`,'blocker',`${file.name} is empty`,'Add the actual file content or remove this unused resource.',location,'Edit resource');
  else if(family!=='templates'&&isUnfinishedPlaceholder(file.content))add(`file-stub-${index}`,'blocker',`${file.name} contains a drafting placeholder`,'Finish the resource before delivering it.',location,'Finish resource');
 });
 if(options.uploads)for(const id of draft.uploadIds){const file=options.uploads.find(item=>item.id===id);if(!file||file.status!=='completed'||file.size<=0||!file.sha256)add(`upload-${id}`,'blocker',file?`${file.name} is not ready`:'An attached file is missing','Upload the original file again or detach the unavailable attachment.',{step:'content',uploadId:id},'Review files');}
 if(draft.coverUploadId&&options.uploads){const file=options.uploads.find(item=>item.id===draft.coverUploadId);if(!file||file.status!=='completed'||!file.mime.startsWith('image/')||!file.sha256)add('cover-missing','blocker','Cover image is unavailable','Replace the cover image or remove it.',{step:'review',field:'coverUploadId'},'Review cover');}

 // These are editorial suggestions, not arbitrary publication or sales gates.
 if(!draft.coverUploadId)add('cover-suggestion','advisory','Consider a cover','A clear title and consistent visual style can help people recognize your product. A cover is optional.',{step:'review',field:'coverUploadId'},'Add a cover');
 if(!originalFileOnly&&['course','challenge','document'].includes(family)&&!draft.fields.outcome?.trim())add('outcome-suggestion','advisory','Make the promise specific','State what the reader or learner should be able to do by the end.',{step:'details',field:'outcome'},'Clarify the outcome');
 if(!originalFileOnly&&draft.type==='book'&&!draft.fields.subtitle?.trim())add('subtitle-suggestion','advisory','Give the book a useful subtitle','An optional subtitle can clarify the subject, reader, or practical outcome.',{step:'details',field:'subtitle'},'Add a subtitle');
 const typeSuggestions:Partial<Record<BuilderDraft['type'],[string,string,string][]>>={
  book:[['bookPremise','Clarify the central idea','A premise helps the chapters build toward one coherent argument.']],
  guide:[['startingPoint','Define the reader’s starting point','State what readers should know before starting.'],['runningExample','Consider one worked example','A specific scenario can make the guide easier to follow.']],
  playbook:[['trigger','Define when to use this playbook','State which situation starts the process.'],['requiredInputs','List the tools or inputs','Help the reader prepare before following your steps.'],['definitionOfDone','Define the finish line','Describe the observable result that means the process is complete.']],
  challenge:[['dailyTime','Set a realistic daily time commitment','Let participants know how much time to set aside.'],['completionCriteria','Explain how to track completion','Define what participants should do or record each day.']],
  'template-kit':[['compatibleTools','Name the compatible tools','Tell customers which software or file types they need.']],
 };
 if(!originalFileOnly)for(const [field,title,message] of typeSuggestions[draft.type]||[])if(!draft.fields[field]?.trim())add(`type-${field}`,'advisory',title,message,{step:'details',field},'Review product details');
 const editorialFields=['subtitle','bookPremise','readerLevel','startingPoint','runningExample','trigger','requiredInputs','definitionOfDone','dailyTime','completionCriteria','compatibleTools'];
 for(const field of editorialFields)if(draft.fields[field]?.trim()&&isUnfinishedPlaceholder(draft.fields[field]))add(`field-placeholder-${field}`,'advisory','Finish a product detail','One of your product details is still a drafting placeholder. Finish it or clear the optional field.',{step:'details',field},'Review product detail');
 if(family==='course'&&hasSections){const index=draft.sections.findIndex(section=>!section.objective?.trim());if(index>=0)add('learning-objectives','advisory','Make the lesson outcome visible','Add a learning objective so students know what they should be able to do after the lesson.',{step:'content',sectionIndex:index,field:'objective'},'Review lesson outcome');}
 if(hasSections&&(['course','challenge'].includes(family)||draft.type==='playbook')){
  if(!draft.sections.some(section=>hasPracticalTask(section.body)||section.videoId))add('practice-suggestion','advisory','Give learners something to do','Consider adding a concrete exercise, checklist, reflection prompt, or next action. Keep it relevant to the material.',{step:'content',sectionIndex:0},'Review practical activities');
 }
 const titleDayCount=/\b(\d{1,2})[\s-]*day\b/i.exec(draft.title),planned=titleDayCount?Number(titleDayCount[1]):Number(draft.fields.unitCount);
 if(!originalFileOnly&&hasSections&&Number.isInteger(planned)&&planned>draft.sections.length&&planned<=30)add('planned-items','advisory',`Check the promised ${planned} ${titleDayCount?'days':info.plural}`,`Your draft contains ${draft.sections.length} ${info.plural}. Finish the planned sequence or adjust the promise if the shorter version is intentional.`,{step:'content'},'Review the sequence');
 if(family==='service'&&draft.studio?.service?.meetingProvider!=='jitsi'&&!validHttps(draft.fields.meetingUrl||''))add('service-delivery','advisory','Confirm your meeting arrangement','Before selling, set a private meeting link and available session times in payment setup. Page publication can happen first.',{step:'review'},'Review delivery');
 if(family==='community'&&!draft.studio?.community?.enabled&&!validHttps(draft.fields.communityUrl||''))add('community-delivery','advisory','Connect the member space before selling','Add the private HTTPS community invitation link in payment setup. It is not needed to publish the public page.',{step:'review'},'Review member access');
 const sectionProblem=(item:ProductReadinessCheck)=>item.key.startsWith('section-')||item.key.startsWith('recording-');
 const fieldValue=(field:string)=>field in draft?String(draft[field as keyof BuilderDraft]):draft.fields[field]||'';
 const corresponds:Record<string,(item:ProductReadinessCheck)=>boolean>={details:item=>item.key.startsWith('essential-'),sections:sectionProblem,files:item=>item.key.startsWith('file-')||item.key.startsWith('upload-'),content:item=>item.key==='content-present'||sectionProblem(item)||item.key.startsWith('file-'),templates:item=>item.key==='templates-present'||item.key.startsWith('file-'),instructions:item=>item.key==='template-instructions'||sectionProblem(item),lessons:item=>item.key==='learning-content'||sectionProblem(item),scope:item=>item.key==='service-serviceScope'||item.key==='service-outcome',session:item=>item.key==='service-duration'||item.key==='service-preparation',membership:item=>item.key.startsWith('community-'),cover:item=>item.key==='cover-missing',quality:item=>item.key.startsWith('section-stub-')||item.key.startsWith('file-stub-')||item.key.startsWith('section-title-')||!!item.location.field&&isUnfinishedPlaceholder(fieldValue(item.location.field))};
 for(const check of options.serverChecks||[])if(!check.ready&&(/integrity|corrupt|checksum|failed.*(?:validation|verification)/i.test(check.message)||!checks.some(item=>item.status==='blocker'&&corresponds[check.key]?.(item))))add(`server-${check.key}`,'blocker','Complete the publishing check',check.message,{step:check.key==='details'?'details':check.key==='cover'?'review':'content'},'Review this item');
 const blockers=checks.filter(check=>check.status==='blocker').length,advisories=checks.filter(check=>check.status==='advisory').length;
 return {ready:blockers===0,blockers,advisories,checks,originalFileOnly};
}
