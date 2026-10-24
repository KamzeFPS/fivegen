import {z} from 'zod';

export const courseModuleSchema=z.object({id:z.string().uuid(),title:z.string().trim().min(1).max(150),description:z.string().max(1500).default(''),lessonIds:z.array(z.string().max(80)).max(30)});
export const courseModulesSchema=z.array(courseModuleSchema).max(30).superRefine((modules,context)=>{
  const ids=new Set<string>(),lessons=new Set<string>();
  for(const [index,module] of modules.entries()){
    if(ids.has(module.id))context.addIssue({code:'custom',path:[index,'id'],message:'Use a distinct module identity.'});ids.add(module.id);
    for(const lesson of module.lessonIds){if(lessons.has(lesson))context.addIssue({code:'custom',path:[index,'lessonIds'],message:'A lesson can belong to one module.'});lessons.add(lesson);}
  }
});
export type CourseModule=z.infer<typeof courseModuleSchema>;
export type CurriculumSection={id?:string;title:string;category?:string};
export const curriculumLessonId=(section:CurriculumSection,index:number)=>section.id||`section-${index}`;
export function curriculumGroups(sections:CurriculumSection[],modules:CourseModule[]=[]){
  if(!modules.length&&sections.some(section=>section.category?.trim())){
    const legacy:{id:string;title:string;description:string;lessonIds:string[];indices:number[]}[]=[];
    sections.forEach((section,index)=>{const title=section.category?.trim()||'Getting started';let group=legacy.at(-1);if(!group||group.title!==title){group={id:`legacy-module-${index}`,title,description:'',lessonIds:[],indices:[]};legacy.push(group);}group.indices.push(index);group.lessonIds.push(curriculumLessonId(section,index));});
    return legacy;
  }
  const indices=new Map(sections.map((section,index)=>[curriculumLessonId(section,index),index])),seen=new Set<number>();
  const groups=modules.map(module=>({...module,indices:module.lessonIds.flatMap(id=>{const index=indices.get(id);if(index===undefined||seen.has(index))return [];seen.add(index);return [index];})}));
  const loose=sections.flatMap((_,index)=>seen.has(index)?[]:[index]);
  if(loose.length)groups.push({id:'unassigned',title:modules.length?'Other lessons':'Lessons',description:'',lessonIds:loose.map(index=>curriculumLessonId(sections[index],index)),indices:loose});
  return groups;
}
export function validateCurriculum(modules:CourseModule[],sections:CurriculumSection[]){
  const result=courseModulesSchema.safeParse(modules);if(!result.success)return result.error.issues[0].message;
  if(modules.length&&sections.some(section=>!section.id))return 'Save stable lesson identities before organizing course modules.';
  const ids=new Set(sections.map(curriculumLessonId));
  return modules.some(module=>module.lessonIds.some(id=>!ids.has(id)))?'A module refers to a lesson that is no longer in this product.':'';
}
export function curriculumOrder<T extends CurriculumSection>(sections:T[],modules:CourseModule[]){return curriculumGroups(sections,modules).flatMap(group=>group.indices.map(index=>sections[index]));}

/** Deterministic results from this purchase only; never invent an AI assessment. */
export function challengeResults(sections:{id?:string;title:string}[],progress:{sectionId:string;completedAt:number|null;assignment:string;proof:string;fileIds:string[];quizPassed:boolean;reviewStatus:string;feedback:string}[],startedAt:number,now=Date.now()){
  const rows=new Map(progress.map(row=>[row.sectionId,row]));
  const activities=sections.map((section,index)=>{const row=rows.get(curriculumLessonId(section,index));return {id:curriculumLessonId(section,index),title:section.title,completed:!!row?.completedAt,reflection:row?.assignment||'',proof:row?.proof||'',attachments:row?.fileIds.length||0,quizPassed:!!row?.quizPassed,reviewStatus:row?.reviewStatus||'none',feedback:row?.feedback||''};});
  const completed=activities.filter(activity=>activity.completed).length;
  return {completed,total:sections.length,percent:sections.length?Math.round(completed/sections.length*100):0,daysPracticed:new Set(progress.filter(row=>row.completedAt).map(row=>new Date(row.completedAt!).toISOString().slice(0,10))).size,elapsedDays:Math.max(1,Math.ceil((now-startedAt)/86400000)),submitted:activities.filter(activity=>activity.reflection||activity.proof||activity.attachments).length,approved:activities.filter(activity=>activity.reviewStatus==='approved').length,activities};
}
