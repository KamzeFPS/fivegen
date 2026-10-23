'use client';

import {useEffect,useState} from 'react';
import {ArrowRight,BookOpen,Check,ChevronDown,Clock3,ListChecks} from 'lucide-react';
import type {ProductContent} from '@/lib/product';
import type {ProductStudioConfig} from '@/lib/product-studio-contract';
import {renderStudioMarkdown} from '@/lib/product-studio-markdown';
import {ProductDecisionDiagram} from '@/app/product-studio-decision';
import './written-content.css';

type WrittenPurchase={id:string;title?:string;format:string;builderType?:string;studio?:ProductStudioConfig;sections:ProductContent['sections'];downloads?:{id:string;name:string;mime:string;size:number}[]};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown)=>typeof value==='string'?value:'';
const strings=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&!!item.trim()):[];
const rows=(value:unknown)=>Array.isArray(value)?value.map(object):[];

function ReaderChecklist({orderId,items}:{orderId:string;items:string[]}){
 const [checked,setChecked]=useState<string[]>([]),key=`fivegen-checklist-${orderId}`;
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>{try{const saved:unknown=JSON.parse(localStorage.getItem(key)||'[]');if(active)setChecked(strings(saved));}catch{if(active)setChecked([]);}});return()=>{active=false;};},[key]);
 function toggle(item:string){const next=checked.includes(item)?checked.filter(value=>value!==item):[...checked,item];setChecked(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{/* Reading and checking remain available when browser storage is full. */}}
 return <section className="written-checklist" aria-labelledby={`written-checklist-${orderId}`}><h4 id={`written-checklist-${orderId}`}><ListChecks size={19}/>Your checklist</h4><p>Check off each action as you go.</p>{items.map((item,index)=><label key={index} className={checked.includes(item)?'is-complete':''}><input type="checkbox" checked={checked.includes(item)} onChange={()=>toggle(item)}/><span>{item}</span></label>)}</section>;
}

/** Render only the verified purchase snapshot; embedded uploads use the
 * purchase-scoped download route rather than the creator's private URLs. */
export function WrittenContent({content}:{content:WrittenPurchase}){
 const studio=content.studio||{},writing=object(studio.writing),guide=object(studio.guide),playbook=object(studio.playbook),isBook=content.builderType==='book'||content.format==='Book',isGuide=content.builderType==='guide'||content.format==='Guide',isPlaybook=content.builderType==='playbook'||content.format==='Playbook';
 const theme=['minimal','editorial','classic'].includes(text(writing.theme))?text(writing.theme):'minimal',font=writing.font==='sans'?'sans':'serif',prefix=`written-${content.id}`;
 const images=new Map((content.downloads||[]).filter(file=>file.mime.startsWith('image/')).map(file=>[file.id,`/api/commerce/customer/${encodeURIComponent(content.id)}/uploads/${encodeURIComponent(file.id)}?inline=1`]));
 const imageMap=Object.fromEntries([...images].flatMap(([id,url])=>[[id,url],[`/api/uploads/${id}`,url],[`upload:${id}`,url]]));
 function rich(value:unknown,scope:string){
  const source=text(value).replace(/!\[([^\]\n]*)\]\((?:\/api\/uploads\/|upload:)([a-f0-9-]{36})\)/gi,(original,alt:string,id:string)=>images.has(id)?original:alt?`[${alt}]`:'[Image unavailable]');
  const html=renderStudioMarkdown(source,imageMap).replaceAll('id="footnote-',`id="${prefix}-${scope}-footnote-`).replaceAll('href="#footnote-',`href="#${prefix}-${scope}-footnote-`);
  return <div className="written-rich" dangerouslySetInnerHTML={{__html:html}}/>;
 }
 function imageUrl(source:unknown){const value=text(source),id=/^(?:\/api\/uploads\/|upload:)([a-f0-9-]{36})$/i.exec(value)?.[1];if(id)return images.get(id)||'';try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
 const copyright=text(writing.copyright),dedication=text(writing.dedication),about=text(writing.aboutAuthor),acknowledgments=text(writing.acknowledgments),checklist=strings(guide.checklist),faq=rows(guide.faq).filter(item=>text(item.question)&&text(item.answer)),phases=strings(playbook.phases),kpis=strings(playbook.kpis);
 const words=content.sections.reduce((total,section)=>total+(section.body.trim().match(/\S+/gu)?.length||0),0),minutes=Math.max(1,Math.ceil(words/200)),unit=isBook?'Chapter':isGuide?'Step':isPlaybook?'Play':'Section';
 const toc=[...(isBook&&dedication?[{id:`${prefix}-dedication`,title:'Dedication'}]:[]),...content.sections.map((section,index)=>({id:`${prefix}-section-${index}`,title:section.title||`${unit} ${index+1}`,category:section.category})),...(isBook&&about?[{id:`${prefix}-about`,title:'About the author'}]:[]),...(isBook&&acknowledgments?[{id:`${prefix}-acknowledgments`,title:'Acknowledgments'}]:[])];
 if(!content.sections.length&&!copyright&&!dedication&&!about&&!acknowledgments&&!checklist.length&&!faq.length&&!text(guide.quickStart))return null;
 return <section id="customer-reading" className={`written-reader theme-${theme} font-${font}`} aria-label="Online reader">
  <header className="written-reader-heading"><div><span><BookOpen size={15}/>{isBook?'Your book':isGuide?'Your guide':isPlaybook?'Your playbook':'Read online'}</span><h3>{content.title||'Ready when you are'}</h3>{text(writing.author)&&<p>By {text(writing.author)}</p>}</div><small><Clock3 size={14}/>{minutes} min read</small></header>
  <div className={`written-reader-layout ${writing.showToc===false?'without-toc':''}`}>
   {writing.showToc!==false&&toc.length>0&&<details className="written-toc" open><summary>Contents<ChevronDown size={15}/></summary><nav aria-label="Reading contents">{toc.map((item,index)=><a key={item.id} href={`#${item.id}`}>{'category' in item&&item.category&&<small>{item.category}</small>}<span><i>{String(index+1).padStart(2,'0')}</i>{item.title}</span></a>)}</nav></details>}
   <div className="written-pages">
    {isBook&&(copyright||dedication)&&<div className="written-frontmatter">{copyright&&<section className="written-copyright" aria-label="Copyright">{rich(copyright,'copyright')}</section>}{dedication&&<section className="written-dedication" id={`${prefix}-dedication`}><h4 className="written-sr-only">Dedication</h4>{rich(dedication,'dedication')}</section>}</div>}
    {isGuide&&text(guide.quickStart)&&<aside className="written-quickstart"><span><ArrowRight size={17}/>Start here</span>{rich(guide.quickStart,'quickstart')}</aside>}
    {isPlaybook&&(phases.length>0||kpis.length>0)&&<section className="written-process-overview"><h4>The process at a glance</h4>{phases.length>0&&<ol>{phases.map((phase,index)=><li key={index}><span>{index+1}</span>{phase}</li>)}</ol>}{kpis.length>0&&<><h5>Success measures</h5><ul>{kpis.map((kpi,index)=><li key={index}>{kpi}</li>)}</ul></>}</section>}
    {content.sections.map((section,index)=>{const meta=section.studio||{},illustration=imageUrl(meta.imageUrl),facts=[['Owner / role',meta.role],['Inputs',meta.inputs],['Outputs',meta.outputs],['Time',typeof meta.minutes==='number'&&meta.minutes>0?`${meta.minutes} minutes`:''],['Success measure',meta.kpi]].filter(([,value])=>value),decision=text(meta.decision).split(/→|->|\n/).map(item=>item.trim()).filter(Boolean);return <article className="written-section" id={`${prefix}-section-${index}`} key={section.id||index}>
     <header>{(section.category||meta.phase)&&<p className="written-phase">{text(meta.phase)||section.category}</p>}<span className="written-unit">{unit} {index+1}</span><h4>{section.title||`${unit} ${index+1}`}</h4></header>
     {isPlaybook&&facts.length>0&&<dl className="written-play-facts">{facts.map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl>}
     {meta.takeaway&&<aside className="written-takeaway"><strong>Key takeaway</strong>{rich(meta.takeaway,`takeaway-${index}`)}</aside>}
     {(isGuide||isPlaybook)&&meta.why&&<section className="written-explanation"><h5>Why this matters</h5>{rich(meta.why,`why-${index}`)}</section>}
     {rich(section.body,`body-${index}`)}
     {illustration&&<figure className="written-illustration"><img src={illustration} alt={`${section.title||unit} illustration`} loading="lazy" referrerPolicy="no-referrer"/></figure>}
     {(isGuide||isPlaybook)&&meta.mistakes&&<aside className="written-mistakes"><strong>Common mistakes to avoid</strong>{rich(meta.mistakes,`mistakes-${index}`)}</aside>}
     {isPlaybook&&!!meta.decisionGraph&&<ProductDecisionDiagram value={meta.decisionGraph}/>}
     {isPlaybook&&!meta.decisionGraph&&decision.length>0&&<section className="written-decision"><h5>Decisions & next steps</h5><ol>{decision.map((step,i)=><li key={i}><span>{i+1}</span><p>{step}</p></li>)}</ol></section>}
     {meta.actionStep&&<aside className="written-action"><strong><Check size={17}/>Put it into practice</strong>{rich(meta.actionStep,`action-${index}`)}</aside>}
     {index+1<content.sections.length&&<a className="written-next" href={`#${prefix}-section-${index+1}`}>Next: {content.sections[index+1].title||`${unit} ${index+2}`}<ArrowRight size={15}/></a>}
    </article>;})}
    {isGuide&&checklist.length>0&&<ReaderChecklist key={content.id} orderId={content.id} items={checklist}/>}
    {isGuide&&faq.length>0&&<section className="written-faq"><h4>Questions & troubleshooting</h4>{faq.map((item,index)=><details key={text(item.id)||index}><summary>{text(item.question)}<ChevronDown size={16}/></summary>{rich(item.answer,`faq-${index}`)}</details>)}</section>}
    {isBook&&about&&<section className="written-backmatter" id={`${prefix}-about`}><h4>About the author</h4>{rich(about,'about')}</section>}
    {isBook&&acknowledgments&&<section className="written-backmatter" id={`${prefix}-acknowledgments`}><h4>Acknowledgments</h4>{rich(acknowledgments,'acknowledgments')}</section>}
    {isPlaybook&&text(playbook.licenseTerms)&&<details className="written-license"><summary>License & permitted use<ChevronDown size={15}/></summary>{rich(playbook.licenseTerms,'license')}</details>}
   </div>
  </div>
 </section>;
}
