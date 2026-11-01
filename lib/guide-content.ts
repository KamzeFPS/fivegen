/** Guide presentation reads the same saved sections as the product editor.
 * Resource assignments select from an already authorized content snapshot;
 * they never grant access to a file or construct a new download URL. */
export type GuideAction={id:string;text:string};
export type GuideStep={id:string;title:string;body:string;objective:string;example:string;actions:GuideAction[];uploadIds:string[];fileNames:string[];minutes?:number};
type GuideSection={id?:string;title:string;body:string;objective?:string;studio?:Record<string,unknown>};
type GuideResources={downloads?:{id:string;name:string;mime:string;size:number}[];files:{name:string;description?:string;content?:string}[]};
const text=(value:unknown)=>typeof value==='string'?value:'';
const strings=(value:unknown)=>Array.isArray(value)?[...new Set(value.filter((item):item is string=>typeof item==='string'&&!!item.trim()))]:[];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function guideStep(section:GuideSection,index=0):GuideStep{
 const studio=section.studio||{},seen=new Set<string>();
 const actions:GuideAction[]=Array.isArray(studio.guideChecklist)?studio.guideChecklist.flatMap((item,actionIndex)=>{
  if(!item||typeof item!=='object'||Array.isArray(item))return [];
  const row=item as Record<string,unknown>,actionText=text(row.text);if(!actionText.trim())return [];
  let id=text(row.id).trim()||`action-${actionIndex}`;if(seen.has(id))id=`action-${actionIndex}`;
  while(seen.has(id))id+='-';seen.add(id);return [{id,text:actionText}];
 }):text(studio.actionStep).split(/\r?\n/).map(line=>line.replace(/^\s*(?:[-*]\s*(?:\[[ xX]\]\s*)?|\d+[.)]\s*)/,'').trim()).filter(Boolean).map((actionText,actionIndex)=>({id:`action-${actionIndex}`,text:actionText}));
 return {id:section.id||`guide-step-${index}`,title:section.title||`Step ${index+1}`,body:section.body,objective:section.objective||'',example:text(studio.guideExample),actions,uploadIds:strings(studio.guideUploadIds).filter(id=>uuid.test(id)),fileNames:strings(studio.guideFileNames),...(typeof studio.minutes==='number'&&Number.isFinite(studio.minutes)&&studio.minutes>0?{minutes:studio.minutes}:{})};
}

export function guideStepResources<T extends GuideResources>(content:T,step:Pick<GuideStep,'uploadIds'|'fileNames'>):T{
 const uploads=new Set(step.uploadIds),names=new Set(step.fileNames);
 return {...content,downloads:content.downloads?.filter(file=>uploads.has(file.id)),files:content.files.filter(file=>names.has(file.name))};
}
