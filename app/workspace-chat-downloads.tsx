'use client';

import {useState} from 'react';
import {Download,ImageDown} from 'lucide-react';
import type {AssistantWorkflow} from '@/lib/workspace-assistant';
import {assistantMaterialFilename,assistantReplyMarkdown,assistantWorkflowSketch,assistantWorkflowZip} from '@/lib/workspace-assistant-downloads';
import './workspace-chat-downloads.css';

function save(bytes:string|Uint8Array,mime:string,name:string){const blob=new Blob([typeof bytes==='string'?bytes:Uint8Array.from(bytes).buffer],{type:mime}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);try{link.click();}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}}

export function ChatReplyDownload({messageId,content,questions=[]}:{messageId:string;content:string;questions?:string[]}){
 const [error,setError]=useState('');
 if(!content.trim()&&!questions.length)return null;
 return <div className="chat-reply-download"><button type="button" onClick={()=>{setError('');try{save(assistantReplyMarkdown(content,questions),'text/markdown;charset=utf-8','fivegen-reply-'+assistantMaterialFilename(messageId)+'.md');}catch{setError('The reply could not be downloaded. Please try again.');}}}><Download size={13}/>Download reply <span>.md</span></button>{error&&<p role="alert">{error}</p>}</div>;
}

export function WorkspaceChatDownloads({workflow}:{workflow:AssistantWorkflow}){
 const [error,setError]=useState('');
 function download(type:'zip'|'sketch'){setError('');try{const name=assistantMaterialFilename(workflow.title);if(type==='zip')save(assistantWorkflowZip(workflow),'application/zip',name+'-materials.zip');else save(assistantWorkflowSketch(workflow),'image/svg+xml;charset=utf-8',name+'-workflow-sketch.svg');}catch{setError('These materials could not be prepared. Review the plan’s dates and try again. Your conversation is still here.');}}
 return <section className="workspace-chat-downloads" aria-label="Download plan materials"><div><strong>Keep your working materials</strong><p>Editable drafts, your workflow sketch and any proposed calendar items. Saved workspace drafts may contain newer edits.</p></div><div className="workspace-chat-download-actions"><button type="button" onClick={()=>download('zip')}><Download size={15}/>Download materials <span>ZIP</span></button><button type="button" onClick={()=>download('sketch')}><ImageDown size={15}/>Workflow sketch <span>SVG</span></button></div><small>Downloads stay on your device. They don’t approve, publish, send or schedule anything.</small>{error&&<p role="alert" className="workspace-chat-download-error">{error}</p>}</section>;
}
