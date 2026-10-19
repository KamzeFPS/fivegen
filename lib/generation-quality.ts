import type {Brief,ProductContent} from './product';
import {findRepeatedSectionBodies,isUnfinishedPlaceholder} from './product-readiness';

function expectedUnits(brief:Brief){
 if(brief.format==='Challenge')return brief.duration||7;
 if(brief.format==='Coaching session'||brief.format==='Consulting / Mentorship')return 3;
 const requested=/\bRequested [^\n:]{1,40}:\s*(\d{1,2})(?:\s|$)/i.exec(brief.instructions||'');
 const count=requested?Number(requested[1]):undefined;
 return count&&count>=3&&count<=30?count:undefined;
}
export function generatedOutlineError(brief:Brief,sections:{title:string;objective:string}[]){
 const expected=expectedUnits(brief);
 if(expected&&sections.length!==expected)return `The generated outline did not include the requested ${expected} items. Your saved content is safe. Retry this step; this attempt was not charged.`;
 const seen=new Set<string>();
 for(const section of sections){
  if(!section.title.trim()||!section.objective.trim()||isUnfinishedPlaceholder(section.title)||isUnfinishedPlaceholder(section.objective))return 'The generated outline included empty content or unfinished placeholders. Your saved content is safe. Retry this step; this attempt was not charged.';
  const title=section.title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  if(seen.has(title))return 'The generated outline repeated an item instead of creating a distinct sequence. Your saved content is safe. Retry this step; this attempt was not charged.';
  seen.add(title);
 }
 return null;
}
export function generatedSectionError(sections:ProductContent['sections'],index:number,body:string){
 if(!body.trim()||isUnfinishedPlaceholder(body))return 'AI returned empty content or an unfinished placeholder. Your saved sections are safe. Retry this step; this attempt was not charged.';
 const previous=sections.slice(0,index).map(section=>({body:section.body}));
 if(findRepeatedSectionBodies([...previous,{body}]).some(match=>match.index===index))return 'AI repeated an earlier section instead of writing new content. Your saved sections are safe. Retry this step; this attempt was not charged.';
 return null;
}
export function generatedPackageError(files:NonNullable<ProductContent['files']>){
 if(files.some(file=>!file.content.trim()||isUnfinishedPlaceholder(file.content)))return 'AI returned an unfinished supporting file. Your saved product is safe. Retry this step; this attempt was not charged.';
 return null;
}
