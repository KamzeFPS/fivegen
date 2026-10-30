'use client';
import {useState} from 'react';
import {Check,ChevronDown,LockKeyhole} from 'lucide-react';
type Lesson={id:string;title:string;completed:boolean;locked:boolean};
type Module={id:string;title:string;description:string;indices:number[]};
export function CourseNavigation({modules,lessons,active,onSelect,preview=false}:{modules:Module[];lessons:Lesson[];active:number;onSelect:(index:number)=>void;preview?:boolean}){
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 return <div className="buyer-course-modules">{modules.map((module,moduleIndex)=>{const open=expanded[module.id]??(module.indices.includes(active)||moduleIndex===0),completed=module.indices.filter(index=>lessons[index]?.completed).length;return <section className="buyer-course-module" key={module.id}><button type="button" className="buyer-module-heading" aria-expanded={open} aria-controls={'course-module-'+module.id} onClick={()=>setExpanded({...expanded,[module.id]:!open})}><span><strong>{module.title}</strong><small>{preview?`${module.indices.length} ${module.indices.length===1?'lesson':'lessons'}`:`${completed} of ${module.indices.length} complete`}</small></span><ChevronDown size={15}/></button><div id={'course-module-'+module.id} hidden={!open}>{module.description&&<p>{module.description}</p>}{module.indices.map(index=>{const lesson=lessons[index];return lesson?<button type="button" className="buyer-module-lesson" key={lesson.id} aria-current={active===index?'step':undefined} onClick={()=>onSelect(index)}><span className="buyer-unit-number">{lesson.completed?<Check size={15}/>:lesson.locked?<LockKeyhole size={14}/>:String(index+1).padStart(2,'0')}</span><strong>{lesson.title}</strong></button>:null;})}</div></section>;})}</div>;
}
