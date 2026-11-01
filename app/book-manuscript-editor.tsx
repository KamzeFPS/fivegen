'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {ArrowDown,ArrowUp,Bold,GripVertical,Heading2,ImagePlus,Italic,Link2,Plus,Undo2} from 'lucide-react';
import {parseBookBlocks,moveBookImage,type BookBlock,type BookSelection} from '@/lib/book-manuscript';
import {useStudioTextarea} from './product-studio-fields';

export type ManuscriptSelection=BookSelection&{body:string};
type Props={body:string;chapterId:string;disabled?:boolean;selectedImage?:string|null;onChange:(body:string)=>void;onSelection:(selection:ManuscriptSelection)=>void;onImage:(id:string)=>void;onGenerateImage:()=>void;onError:(message:string)=>void;onUndo:()=>void;canUndo:boolean};
type Editing={start:number;end:number;index:number};

function Paragraph({value,heading,disabled,onChange,onFocus,onSelect,inputRef}:{value:string;heading:number;disabled?:boolean;onChange:(value:string)=>void;onFocus:()=>void;onSelect:(input:HTMLTextAreaElement)=>void;inputRef:(node:HTMLTextAreaElement|null)=>void}){
 const ref=useRef<HTMLTextAreaElement|null>(null);useStudioTextarea(value,true,ref as RefObject<HTMLTextAreaElement|null>);
 return <textarea ref={node=>{ref.current=node;inputRef(node);}} className={`book-paragraph${heading?' is-heading':''}`} value={value} disabled={disabled} rows={1} aria-label={heading?'Chapter subheading':'Manuscript paragraph'} spellCheck placeholder="Start writing. Share one useful idea, then bring it to life with an example." onChange={event=>onChange(event.target.value)} onFocus={onFocus} onSelect={event=>onSelect(event.currentTarget)} onKeyUp={event=>onSelect(event.currentTarget)} onMouseUp={event=>onSelect(event.currentTarget)}/>;
}

export function BookManuscriptEditor({body,chapterId,disabled,selectedImage,onChange,onSelection,onImage,onGenerateImage,onError,onUndo,canUndo}:Props){
 const [editing,setEditing]=useState<Editing|null>(null),[dropTarget,setDropTarget]=useState<number|null>(null),[hasSelection,setHasSelection]=useState(false);
 const inputs=useRef(new Map<number,HTMLTextAreaElement>()),focused=useRef<{index:number;start:number;end:number}|null>(null),drag=useRef<{id:string;body:string;chapterId:string}|null>(null),emitted=useRef(body);
 useEffect(()=>{setEditing(null);focused.current=null;setHasSelection(false);drag.current=null;},[chapterId]);
 useEffect(()=>{if(body!==emitted.current){setEditing(null);focused.current=null;}emitted.current=body;},[body]);
 const parsed=parseBookBlocks(body),blocks:BookBlock[]=editing?[...parsed.filter(block=>block.end<=editing.start),{id:'editing',kind:'text',source:body.slice(editing.start,editing.end),start:editing.start,end:editing.end},...parsed.filter(block=>block.start>=editing.end&&block.start!==editing.start)]:parsed;
 const shown=blocks.length?blocks:[{id:'empty',kind:'text' as const,source:'',start:0,end:0}];
 function change(next:string){emitted.current=next;onChange(next);}
 function select(input:HTMLTextAreaElement,block:BookBlock,index:number,prefix:string){
  const start=block.start+prefix.length+input.selectionStart,end=block.start+prefix.length+input.selectionEnd;
  focused.current={index,start,end};setHasSelection(end>start);
  if(end>start)onSelection({start,end,text:body.slice(start,end),body});
 }
 function format(before:string,after=''){
  const selection=focused.current;if(!selection||disabled)return;
  const next=body.slice(0,selection.start)+before+body.slice(selection.start,selection.end)+after+body.slice(selection.end);setEditing(null);change(next);setHasSelection(false);
  requestAnimationFrame(()=>{const input=inputs.current.get(selection.index);input?.focus();});
 }
 function link(){const address=window.prompt('Link address','https://');if(!address)return;try{const url=new URL(address);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error();format('[',`](${url.href})`);}catch{onError('Enter a full http or https link. Your text is unchanged.');}}
 function move(id:string,direction:'up'|'down'|number){if(disabled)return;try{setEditing(null);change(moveBookImage(body,id,direction));onImage(id);}catch(error){onError(error instanceof Error?error.message:'The image could not be moved.');}}
 function drop(index:number){const source=drag.current;drag.current=null;setDropTarget(null);if(!source||source.chapterId!==chapterId||source.body!==body){onError('The chapter changed while dragging. Select the image and try again.');return;}const from=parseBookBlocks(body).findIndex(block=>block.id===source.id);move(source.id,index>from?index-1:index);}
 return <div className="book-manuscript-editor">
  <div className="book-writing-tools" role="toolbar" aria-label="Manuscript tools"><button type="button" aria-label="Make heading" disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>format('## ')}><Heading2 size={17}/></button><button type="button" aria-label="Bold" disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>format('**','**')}><Bold size={16}/></button><button type="button" aria-label="Italic" disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>format('*','*')}><Italic size={16}/></button><button type="button" aria-label="Add link" disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={link}><Link2 size={17}/></button><span/><button type="button" className="book-image-tool" disabled={disabled||!hasSelection} onMouseDown={event=>event.preventDefault()} onClick={onGenerateImage}><ImagePlus size={17}/>Image from selection</button><button type="button" aria-label="Undo manuscript change" disabled={disabled||!canUndo} onClick={onUndo}><Undo2 size={17}/></button></div>
  <div className="book-paragraphs">
   {shown.map((block,index)=>{const heading=block.kind==='text'?/^(#{1,6}) /.exec(block.source):null,prefix=heading?.[0]||'';return <div className={`book-manuscript-block${block.kind==='image'?' is-image':''}${dropTarget===index?' is-drop-target':''}`} key={`${block.kind}-${index}`} onDragOver={event=>{if(drag.current&&!disabled){event.preventDefault();event.dataTransfer.dropEffect='move';setDropTarget(index);}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDropTarget(null);}} onDrop={event=>{if(drag.current){event.preventDefault();drop(index);}}}>
    {block.kind==='image'&&block.image?<figure className={`book-image-block${selectedImage===block.id?' is-selected':''}`}><button type="button" className="book-image-drag" draggable={!disabled} disabled={disabled} aria-label="Drag image to move it" title="Drag image to move it" onClick={()=>onImage(block.id)} onDragStart={event=>{setEditing(null);drag.current={id:block.id,body,chapterId};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',block.id);onImage(block.id);}} onDragEnd={()=>{drag.current=null;setDropTarget(null);}}><GripVertical size={19}/></button><button type="button" className="book-image-preview" aria-label={`Edit image: ${block.image.alt||'Chapter illustration'}`} onClick={()=>onImage(block.id)}><img src={`/api/uploads/${block.image.uploadId}`} alt={block.image.alt} loading="lazy" draggable={false}/></button>{block.image.caption&&<figcaption>{block.image.caption}</figcaption>}<div className="book-image-actions"><button type="button" disabled={disabled||index===0} onClick={()=>move(block.id,'up')}><ArrowUp size={15}/>Move up</button><button type="button" disabled={disabled||index===shown.length-1} onClick={()=>move(block.id,'down')}><ArrowDown size={15}/>Move down</button></div></figure>:<Paragraph value={block.source.slice(prefix.length)} heading={heading?.[1].length||0} disabled={disabled} inputRef={node=>{if(node)inputs.current.set(index,node);else inputs.current.delete(index);}} onFocus={()=>setEditing({start:block.start,end:block.end,index})} onSelect={input=>select(input,block,index,prefix)} onChange={value=>{const source=prefix+value;setEditing({start:block.start,end:block.start+source.length,index});setHasSelection(false);change(body.slice(0,block.start)+source+body.slice(block.end));}}/>}
   </div>;})}
   <div className={`book-drop-end${dropTarget===shown.length?' is-drop-target':''}`} aria-hidden="true" onDragOver={event=>{if(drag.current&&!disabled){event.preventDefault();setDropTarget(shown.length);}}} onDragLeave={()=>setDropTarget(null)} onDrop={event=>{if(drag.current){event.preventDefault();drop(shown.length);}}}/>
   {shown.at(-1)?.kind==='image'&&<button type="button" className="book-continue-writing" disabled={disabled} onClick={()=>{setEditing(null);change(body+'\n\nStart writing here.');}}><Plus size={15}/>Continue writing</button>}
  </div>
 </div>;
}
