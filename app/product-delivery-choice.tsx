'use client';

import {useId} from 'react';
import './product-delivery-choice.css';

export type ProductDelivery='in_app'|'download'|'both';
export type ProductExportFormat='pdf'|'epub'|'html'|'markdown'|'zip';

const formats:{value:ProductExportFormat;label:string}[]=[
 {value:'pdf',label:'PDF'},
 {value:'epub',label:'EPUB'},
 {value:'html',label:'HTML'},
 {value:'markdown',label:'Markdown'},
 {value:'zip',label:'ZIP'},
];
const destinations:{value:ProductDelivery;label:string;description:string}[]=[
 {value:'in_app',label:'In-app product',description:'Let buyers use the product in FiveGen, with its interactive features.'},
 {value:'download',label:'Downloadable file',description:'Create a file you can download and share with your buyers.'},
 {value:'both',label:'Both',description:'Keep the in-app product and create a downloadable file.'},
];

export function productDeliveryContext(format?:string){
 if(format==='Coaching session'||format==='Consulting / Mentorship')return 'A download is a written companion for your service. Human sessions, booking availability and client messages stay in FiveGen.';
 if(format==='Community')return 'A download is a written resource for your community. Member access, conversations, live events and moderation stay in FiveGen.';
 if(format==='Video course'||format==='Mini course'||format==='Challenge')return 'A download contains the written lessons or activities. Playback, quizzes, progress, submissions and scheduled access stay in FiveGen.';
 if(format==='Playbook')return 'A download presents the written procedures and decision paths. Interactive step choices stay in FiveGen.';
 if(format==='Template kit')return 'Choose ZIP to package attached original files with your written instructions and authored resources. Review the exported files before sharing.';
 if(format==='Custom product')return 'A download contains the written content and supported resources. Sessions, member access and other live features stay in FiveGen.';
 return '';
}

export function ProductDeliveryChoice({delivery,exportFormat,onChange,format}:{delivery:ProductDelivery;exportFormat:ProductExportFormat|null;onChange:(choice:{delivery:ProductDelivery;exportFormat:ProductExportFormat|null})=>void;format?:string}){
 const id=useId(),formatId=`${id}-format`,formatHelpId=`${id}-format-help`;
 const context=productDeliveryContext(format);
 return <fieldset className="product-delivery-choice"><legend>Where should your product be delivered?</legend><div className="product-delivery-options">{destinations.map(option=><label key={option.value} className="product-delivery-option"><input type="radio" name={`${id}-delivery`} value={option.value} checked={delivery===option.value} onChange={()=>onChange({delivery:option.value,exportFormat:option.value==='in_app'?null:exportFormat||'pdf'})}/><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}</div>{delivery!=='in_app'&&<div className="product-delivery-format"><label htmlFor={formatId}>Download format</label><select id={formatId} value={exportFormat||'pdf'} aria-describedby={formatHelpId} onChange={event=>{const value=event.target.value;if(formats.some(format=>format.value===value))onChange({delivery,exportFormat:value as ProductExportFormat});}}>{formats.map(format=><option key={format.value} value={format.value}>{format.label}</option>)}</select><p id={formatHelpId}>Your saved product can be exported as a real file to review, download and share.</p>{context&&<p className="product-delivery-context">{context}</p>}</div>}</fieldset>;
}
