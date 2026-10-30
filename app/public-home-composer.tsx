'use client';

import {useEffect,useId,useRef,useState,type ChangeEvent,type FormEvent,type KeyboardEvent} from 'react';
import {ArrowRight,Camera,ChartNoAxesColumnIncreasing,FileText,Funnel,Lightbulb,Loader2,Paperclip,Pencil,X} from 'lucide-react';
import Link from 'next/link';
import {Brand} from './ui-brand';
import {AppearanceControl} from './appearance';
import {addWorkspaceDraftFiles,readWorkspaceAttachmentDraft,writeWorkspaceAttachmentDraft,type WorkspaceDraftAttachment} from '@/lib/workspace-attachment-draft';
import './public-home-composer.css';

const tasks=[
  {id:'idea',label:'Idea to product',icon:Lightbulb,prompt:'Make a woodland colouring book for curious little explorers, with friendly animals and bold outlines.'},
  {id:'marketing',label:'Marketing plan',icon:ChartNoAxesColumnIncreasing,prompt:'Help me make a practical marketing plan for my digital product. Let’s choose the product, audience and goal first.'},
  {id:'product-photos',label:'Product photos',icon:Camera,prompt:'Help me create a product marketing image. Let’s choose the product and describe the look before generating anything.'},
  {id:'funnel',label:'Funnel builder',icon:Funnel,prompt:'Help me map a funnel for my digital product, from first interest to a clear next step. Let’s choose the product and audience first.'},
  {id:'designs',label:'Designs',icon:Pencil,prompt:'Help me create an editable visual design. Ask me about the format, style and details, then open Design studio.'},
] as const;
type TaskId=typeof tasks[number]['id'];
const examples=[
  {kind:'ebook',label:'Ebook',task:'idea' as TaskId,prompt:'Help me create an ebook with practical ideas for a calmer home. Let’s shape the audience, chapters and useful exercises first.'},
  {kind:'invitation',label:'Invitation',task:'designs' as TaskId,prompt:'Create an editable botanical wedding invitation. Use soft cream, olive leaves and elegant typography. Ask me for the names, date and event details.'},
  {kind:'colouring-book',label:'Colouring book',task:'designs' as TaskId,prompt:'Create an editable woodland colouring book for curious little explorers, with friendly animals, bold black outlines and plenty of open spaces to colour.'},
  {kind:'course',label:'Course',task:'idea' as TaskId,prompt:'Help me turn my expertise into a practical course. Ask me what I teach, who it helps and what learners should be able to do.'},
  {kind:'template-kit',label:'Template kit',task:'designs' as TaskId,prompt:'Create an editable creative goal planner with clear monthly goals, weekly priorities and room to reflect. Use a calm, thoughtful visual style.'},
] as const;
const initialDrafts=Object.fromEntries(tasks.map(task=>[task.id,task.prompt])) as Record<TaskId,string>;
const startHref='/signin-with-chatgpt?return_to=%2F%3Fview%3Dcreate';
const landingKey='landing';

export function PublicHomeHeader(){
  const [scrolled,setScrolled]=useState(false);
  useEffect(()=>{const update=()=>setScrolled(window.scrollY>24);update();window.addEventListener('scroll',update,{passive:true});return()=>window.removeEventListener('scroll',update);},[]);
  return <header className={`public-home-header${scrolled?' is-scrolled':''}`}>
    <Link href="/" aria-label="FiveGen home"><Brand/></Link>
    <nav aria-label="Main navigation"><a href="#product">Product</a><a href="#examples">Examples</a><a href="/pricing">Pricing</a><a href="https://docs.fivegen.ai">Docs</a></nav>
    <div className="public-home-header-actions"><AppearanceControl className="appearance-route-control"/><a className="public-home-signin" href={startHref}>Sign in</a><a className="public-home-primary public-home-header-start" href="#create">Start free <ArrowRight size={17}/></a></div>
  </header>;
}

export function PublicHomeComposer(){
  const [active,setActive]=useState<TaskId>('idea'),[drafts,setDrafts]=useState(initialDrafts),[kinds,setKinds]=useState<Partial<Record<TaskId,string>>>({idea:'colouring-book'});
  const [files,setFiles]=useState<WorkspaceDraftAttachment[]>([]),[error,setError]=useState(''),[storageWarning,setStorageWarning]=useState(false),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
  const input=useRef<HTMLTextAreaElement>(null),fileInput=useRef<HTMLInputElement>(null),edited=useRef(false),id=useId();
  const message=drafts[active];
  function chooseExample(kind:string){const example=examples.find(item=>item.kind===kind);if(!example)return;edited.current=true;setActive(example.task);setDrafts(value=>({...value,[example.task]:example.prompt}));setKinds(value=>({...value,[example.task]:example.kind}));setError('');input.current?.focus();}
  useEffect(()=>{let current=true;void readWorkspaceAttachmentDraft(landingKey).then(saved=>{if(!current)return;if(saved&&!edited.current){const task=tasks.some(item=>item.id===saved.task)?saved.task as TaskId:'idea';setActive(task);setDrafts(value=>({...value,[task]:saved.message}));setFiles(saved.files);if(saved.productKind)setKinds(value=>({...value,[task]:saved.productKind}));if(saved.missingFiles)setError('Your text was restored, but the files could not be kept. Add the original files again before continuing.');}setReady(true);});return()=>{current=false;};},[]);
  useEffect(()=>{if(!ready)return;let current=true;const timer=window.setTimeout(()=>{void writeWorkspaceAttachmentDraft(landingKey,{message,files,task:active,productKind:kinds[active],updatedAt:Date.now()}).then(saved=>{if(current)setStorageWarning(!saved&&files.length>0);});},250);return()=>{current=false;window.clearTimeout(timer);};},[active,message,files,kinds,ready]);
  useEffect(()=>{const onExample=(event:Event)=>{const kind=(event as CustomEvent<{kind:string}>).detail?.kind,example=examples.find(value=>value.kind===kind);if(!example)return;edited.current=true;setActive(example.task);setDrafts(value=>({...value,[example.task]:example.prompt}));setKinds(value=>({...value,[example.task]:example.kind}));setError('');input.current?.focus({preventScroll:true});};window.addEventListener('fivegen:landing-example',onExample);return()=>window.removeEventListener('fivegen:landing-example',onExample);},[]);
  function addFiles(event:ChangeEvent<HTMLInputElement>){edited.current=true;const next=addWorkspaceDraftFiles(files,Array.from(event.target.files||[]));setFiles(next.files);setError(next.error);event.target.value='';}
  function changeTask(task:TaskId){edited.current=true;setActive(task);setError('');}
  function tabKey(event:KeyboardEvent<HTMLButtonElement>,index:number){const offset=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;if(!offset&&event.key!=='Home'&&event.key!=='End')return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tasks.length-1:(index+offset+tasks.length)%tasks.length;changeTask(tasks[next].id);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();}
  async function submit(event:FormEvent){event.preventDefault();if(busy||(!message.trim()&&!files.length))return;setBusy(true);setError('');try{const saved=await writeWorkspaceAttachmentDraft(landingKey,{message:message.trim(),files,task:active,productKind:kinds[active],updatedAt:Date.now()});if(!saved&&files.length){setStorageWarning(true);setError('Your browser could not keep these files for sign in. Keep this page open. Allow local storage or remove the files, then continue.');setBusy(false);return;}window.location.assign('/signin-with-chatgpt?return_to='+encodeURIComponent('/?view=create&intent=1'));}catch{setError('Your draft could not be prepared. Keep this page open and try again.');setBusy(false);}}
  return <div className="public-home-create" id="create">
    <img className="public-home-idea-note" src="/landing/idea-starts-here.webp" alt="Your idea starts here" width="600" height="360"/>
    <div className="public-home-task-tabs" role="tablist" aria-label="What would you like to make?">{tasks.map(({id:task,label,icon:Icon},index)=><button key={task} id={`${id}-${task}`} type="button" role="tab" aria-selected={active===task} aria-controls={`${id}-panel`} tabIndex={active===task?0:-1} disabled={busy} onKeyDown={event=>tabKey(event,index)} onClick={()=>changeTask(task)}><Icon size={20} aria-hidden="true"/>{label}</button>)}</div>
    <form className="public-home-composer" onSubmit={event=>void submit(event)} role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${active}`}>
      <label className="public-home-sr-only" htmlFor={`${id}-message`}>Describe what you would like to make</label>
      <textarea ref={input} id={`${id}-message`} value={message} onChange={event=>{edited.current=true;setDrafts(value=>({...value,[active]:event.target.value}));setKinds(value=>({...value,[active]:undefined}));setError('');}} rows={2} maxLength={3000} disabled={busy} placeholder="Describe your idea. Make something that’s yours…" aria-describedby={`${id}-help${error?` ${id}-error`:''}`}/>
      {files.length>0&&<ul className="public-home-attachments" aria-label="Attached files">{files.map(item=><li key={item.id}><FileText size={16} aria-hidden="true"/><span title={item.file.name}>{item.file.name}<small>{(item.file.size/1024/1024).toFixed(1)} MB · ready</small></span><button type="button" disabled={busy} aria-label={`Remove ${item.file.name}`} onClick={()=>{edited.current=true;setFiles(value=>value.filter(file=>file.id!==item.id));setError('');}}><X size={15}/></button></li>)}</ul>}
      <div className="public-home-composer-bar"><div className="public-home-attach"><input ref={fileInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.txt" aria-label="Attach images, documents or PDFs" tabIndex={-1} className="public-home-sr-only" onChange={addFiles} disabled={busy}/><button type="button" disabled={busy||files.length>=4} onClick={()=>fileInput.current?.click()}><Paperclip size={20} aria-hidden="true"/>Add files</button><span>Images, docs, PDFs</span></div><div className="public-home-submit-group"><button className="public-home-primary" type="submit" disabled={busy||(!message.trim()&&!files.length)}>{busy?<><Loader2 size={18} className="spin"/>Keeping your draft…</>:<>Make it <ArrowRight size={19}/></>}</button></div></div>
    </form>
    {error&&<p className="public-home-composer-error" id={`${id}-error`} role="alert">{error}</p>}
    {storageWarning&&!error&&<p className="public-home-composer-error" role="status">Keep this page open. Your browser could not save these files for sign in.</p>}
    <div className="public-home-try"><span>Try it:</span>{examples.map(example=><button type="button" key={example.kind} disabled={busy} onClick={()=>chooseExample(example.kind)}>{example.label}</button>)}</div>
    <p className="public-home-composer-help" id={`${id}-help`}>Sign in to continue, then review and send with Gen. <span>Up to 4 files · 8 MB each · 20 MB total.</span></p>
  </div>;
}

const projects=[
  {kind:'ebook',format:'Ebook',title:'A calmer home',image:'calmer-home-ebook',alt:'Example warm ochre ebook cover for A Calmer Home'},
  {kind:'invitation',format:'Invitation',title:'Botanical wedding invitation',image:'botanical-invitation',alt:'Example cream wedding invitation with botanical leaves and flowers'},
  {kind:'colouring-book',format:'Colouring book',title:'Woodland friends colouring book',image:'woodland-colouring',alt:'Example woodland animal colouring book with original black outline artwork'},
  {kind:'course',format:'Course',title:'Creative business roadmap',image:'creative-business-course',alt:'Example Creative Business Roadmap course on a desktop screen'},
  {kind:'template-kit',format:'Template kit',title:'Creative goal planner',image:'creative-goal-planner',alt:'Example lavender creative goal planner with floral line art'},
] as const;
export function PublicHomeShowcase(){
  const rail=useRef<HTMLDivElement>(null),hovered=useRef(false),focused=useRef(false);
  useEffect(()=>{const element=rail.current;if(!element)return;const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');let frame=0,last=0;const animate=(now:number)=>{const delta=last?Math.min(now-last,40):0;last=now;if(!hovered.current&&!focused.current&&!reduced.matches&&!document.hidden){const length=element.querySelector<HTMLElement>('.public-home-project-group')?.offsetWidth||0;if(length>0)element.scrollLeft=(element.scrollLeft+delta*.018)%length;}frame=requestAnimationFrame(animate);};frame=requestAnimationFrame(animate);return()=>cancelAnimationFrame(frame);},[]);
  const content=(project:typeof projects[number],duplicate:boolean)=><><img src={`/landing/${project.image}.webp`} width={750} height={1000} loading="lazy" alt={duplicate?'':project.alt}/><span>{project.format}</span><h3>{project.title}</h3><small>Make it yours</small></>;
  return <section className="public-home-showcase" id="examples" aria-labelledby="public-home-examples-title">
    <div className="public-home-showcase-heading"><div><h2 id="public-home-examples-title">Explore what you could make.</h2></div></div>
    <div className="public-home-projects" ref={rail} aria-label="Example projects" onMouseEnter={()=>{hovered.current=true;}} onMouseLeave={()=>{hovered.current=false;}} onFocus={()=>{focused.current=true;}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))focused.current=false;}}>{[0,1,2].map(copy=><div className="public-home-project-group" key={copy} aria-hidden={copy>0?true:undefined}>{projects.map(project=><a href="#create" className="public-home-project" key={project.image} tabIndex={copy>0?-1:undefined} aria-label={`Example ${project.format}: ${project.title}. Make it yours`} onClick={()=>{window.dispatchEvent(new CustomEvent('fivegen:landing-example',{detail:{kind:project.kind}}));}}>{content(project,copy>0)}</a>)}</div>)}</div>
  </section>;
}
