'use client';
import {useState} from 'react';
import {ArrowUpRight,CheckCircle2,ChevronDown,ClipboardCheck,Info,TriangleAlert} from 'lucide-react';
import type {ProductReadinessCheck,ProductReadinessLocation,ProductReadinessReport} from '@/lib/product-readiness';
import './product-readiness.css';

export function ProductReadiness({report,onFix}:{report:ProductReadinessReport;onFix:(location:ProductReadinessLocation)=>void}){
 const [showPassed,setShowPassed]=useState(false),required=report.checks.filter(item=>item.status==='blocker'),optional=report.checks.filter(item=>item.status==='advisory'),passed=report.checks.filter(item=>item.status==='ready');
 const itemView=(item:ProductReadinessCheck)=><div className={`product-readiness-item ${item.status}`} key={item.key}><span className="product-readiness-item-icon">{item.status==='blocker'?<TriangleAlert size={16}/>:<Info size={16}/>}</span><div><div className="product-readiness-item-title"><strong>{item.title}</strong><small>{item.status==='blocker'?'Required':'Optional'}</small></div><p>{item.message}</p></div><button type="button" onClick={()=>onFix(item.location)} aria-label={`${item.action||'Review'}: ${item.title}`}>{item.action||'Review'}<ArrowUpRight size={13}/></button></div>;
 return <section className="product-readiness" aria-label="Product readiness check">
  <div className="product-readiness-heading"><span className={`product-readiness-icon ${report.ready?'complete':''}`}><ClipboardCheck size={20}/></span><div><span className="product-readiness-eyebrow">FINISH WITH CONFIDENCE</span><h3>{report.ready?'Ready for your final review':`${report.blockers} ${report.blockers===1?'thing':'things'} to finish`}</h3></div><span className={`product-readiness-state ${report.ready?'complete':''}`}>{report.ready?'Ready to publish':'Needs attention'}</span></div>
  <p className="product-readiness-intro">{report.ready?'The basic checks pass. Preview the full product and confirm the details before publishing.':'Finish the required items below. Your work is saved; suggested improvements can be done when you are ready.'}</p>
  {report.originalFileOnly&&<p className="product-readiness-original"><CheckCircle2 size={15}/>Your original file is the product. You do not need to create extra chapters.</p>}
  {!!required.length&&<div className="product-readiness-list">{required.map(itemView)}</div>}
  {!!optional.length&&<details className="product-readiness-optionals"><summary>{optional.length} optional {optional.length===1?'improvement':'improvements'}<span>Does not block publishing</span></summary><div className="product-readiness-list">{optional.map(itemView)}</div></details>}
  {!!passed.length&&<><button type="button" className="product-readiness-passed-toggle" aria-expanded={showPassed} onClick={()=>setShowPassed(value=>!value)}><CheckCircle2 size={15}/>{passed.length} checks passed<ChevronDown size={15} className={showPassed?'open':''}/></button>{showPassed&&<ul className="product-readiness-passed">{passed.map(item=><li key={item.key}><CheckCircle2 size={14}/>{item.message}</li>)}</ul>}</>}
  <p className="product-readiness-note">Checks flag common gaps. They do not verify factual accuracy, rights, or the contents of uploaded files. Preview your originals before publishing.</p>
 </section>;
}
