'use client';

import {ArrowRight,Download,Eye,FileText} from 'lucide-react';
import type {ProductExportFormat} from './product-delivery-choice';
import './product-download-next-step.css';

export function ProductDownloadNextStep({title,format,fileLabel,downloadLabel,busy,hasContent,onDownload,onPreview,onEdit,onSell,overview=false}:{title:string;format:ProductExportFormat;fileLabel?:string;downloadLabel?:string;busy:boolean;hasContent:boolean;onDownload:(format:string)=>Promise<void>;onPreview:()=>void;onEdit:()=>void;onSell:()=>void;overview?:boolean}){
 const label=format==='markdown'?'Markdown':format.toUpperCase();
 const Heading=overview?'h1':'h2';
 return <section className="pb-card product-download-next" aria-label="Your downloadable product">
  <header><span className="pb-eyebrow">YOUR DOWNLOAD</span><Heading>{hasContent?'Your download is ready':'Add your product content'}</Heading><p>{hasContent?'Preview your product, then download the saved file.':'Add your writing or original files in Content, then come back to preview and download.'}</p></header>
  <div className="product-download-summary"><FileText size={24} aria-hidden="true"/><div><strong>{title||'Your product'}</strong><span>{fileLabel||`${label} download`} · Saved privately</span></div></div>
  {hasContent?<div className="product-download-actions"><button type="button" className="button primary" disabled={busy} onClick={()=>void onDownload(format)}><Download size={17}/>{downloadLabel||`Download ${label}`}</button><button type="button" className="button secondary" disabled={busy} onClick={onPreview}><Eye size={17}/>Preview product</button><button type="button" className="text-link" disabled={busy} onClick={onEdit}>Edit content<ArrowRight size={14}/></button></div>:<button type="button" className="button primary" disabled={busy} onClick={onEdit}>Add content<ArrowRight size={16}/></button>}
  <p className="product-download-help">There is nothing to fill out here. Downloading does not require publishing, a price or payment setup.</p>
  <details className="product-download-selling"><summary>Want to sell this through FiveGen?</summary><p>Set up a sales page and checkout when you want to accept orders here. You can also use the downloaded file elsewhere.</p><button type="button" className="button secondary" disabled={busy} onClick={onSell}>Set up selling<ArrowRight size={15}/></button></details>
 </section>;
}
