'use client';
import {ArrowDownToLine,FileText} from 'lucide-react';
import {buyerFileSize,buyerFileType} from './presentation';

type ResourceFile={name:string;description?:string;content?:string};
type DownloadContent={id:string;files:ResourceFile[];downloads?:{id:string;name:string;mime:string;size:number}[]};

function previewFileDownload(file:ResourceFile){
 const name=(file.name.split(/[\\/]/).pop()||'resource.txt').replace(/[\u0000-\u001f\u007f<>:"|?*]/g,'_').replace(/[. ]+$/,'')||'resource.txt';
 const extension=name.split('.').at(-1)?.toLowerCase(),mime=({md:'text/markdown',markdown:'text/markdown',html:'text/html',htm:'text/html',txt:'text/plain',csv:'text/csv',json:'application/json'} as Record<string,string>)[extension||'']||'application/octet-stream';
 const url=URL.createObjectURL(new Blob([file.content||''],{type:mime+'; charset=utf-8'})),link=document.createElement('a');
 link.href=url;link.download=name;
 try{document.body.appendChild(link);link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}

/** Preview uses only the saved owner snapshot; customer links retain order authorization. */
export function ProductDownloadList({content,family,previewProductId}:{content:DownloadContent;family?:string;previewProductId?:string}){
 const downloads=content.downloads||[],files=content.files||[],count=downloads.length+files.length;
 if(!count)return null;
 return <section className="buyer-resources" id="customer-downloads" aria-label="Product downloads">
  <div className="buyer-section-heading"><div><h3>{family==='templates'?'Your templates':'Download your files'}</h3><p>{previewProductId?'These files are included in this saved draft. Download any file to check it.':family==='templates'?'Originals and editable resources, ready for your workflow.':'Keep the original files and use them whenever you need.'}</p></div><span>{count} {count===1?'file':'files'}</span></div>
  <div className="buyer-files">
   {downloads.map(file=><a className="buyer-file-link" key={file.id} href={previewProductId?`/api/uploads/${encodeURIComponent(file.id)}?download=1`:`/api/commerce/customer/${encodeURIComponent(content.id)}/uploads/${encodeURIComponent(file.id)}`}><span className="buyer-file-icon"><FileText size={21}/></span><span className="buyer-file-copy"><strong>{file.name}</strong><small>{buyerFileType(file.name)}{buyerFileSize(file.size)&&` · ${buyerFileSize(file.size)}`} · Original file</small></span><span className="buyer-download-label">Download your file <ArrowDownToLine size={17}/></span></a>)}
   {files.map(file=>{const size=file.content===undefined?'':buyerFileSize(new TextEncoder().encode(file.content).length)||'0 B',copy=<><span className="buyer-file-icon"><FileText size={21}/></span><span className="buyer-file-copy"><strong>{file.name}</strong><small>{buyerFileType(file.name)}{size&&` · ${size}`} · Editable resource{file.description&&` · ${file.description}`}</small></span><span className="buyer-download-label">Download resource <ArrowDownToLine size={17}/></span></>;return previewProductId?<button type="button" className="buyer-file-link" key={file.name} onClick={()=>previewFileDownload(file)}>{copy}</button>:<a className="buyer-file-link" key={file.name} href={`/api/commerce/customer/${encodeURIComponent(content.id)}/files/${encodeURIComponent(file.name)}`}>{copy}</a>;})}
  </div>
 </section>;
}
