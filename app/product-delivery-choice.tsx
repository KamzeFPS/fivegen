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

export function ProductDeliveryChoice({delivery,exportFormat,onChange}:{delivery:ProductDelivery;exportFormat:ProductExportFormat|null;onChange:(choice:{delivery:ProductDelivery;exportFormat:ProductExportFormat|null})=>void}){
 const id=useId(),formatId=`${id}-format`,formatHelpId=`${id}-format-help`;
 return <fieldset className="product-delivery-choice"><legend>Where should your product be delivered?</legend><div className="product-delivery-options">{destinations.map(option=><label key={option.value} className="product-delivery-option"><input type="radio" name={`${id}-delivery`} value={option.value} checked={delivery===option.value} onChange={()=>onChange({delivery:option.value,exportFormat:option.value==='in_app'?null:exportFormat||'pdf'})}/><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}</div>{delivery!=='in_app'&&<div className="product-delivery-format"><label htmlFor={formatId}>Download format</label><select id={formatId} value={exportFormat||'pdf'} aria-describedby={formatHelpId} onChange={event=>{const value=event.target.value;if(formats.some(format=>format.value===value))onChange({delivery,exportFormat:value as ProductExportFormat});}}>{formats.map(format=><option key={format.value} value={format.value}>{format.label}</option>)}</select><p id={formatHelpId}>Your finished product will include a real file to download and share.</p></div>}</fieldset>;
}
