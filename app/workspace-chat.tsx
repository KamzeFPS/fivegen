'use client';

import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowRight,ArrowUp,BookOpen,CalendarDays,Check,CheckCircle2,ChevronDown,ClipboardList,CornerDownLeft,ExternalLink,Lightbulb,Loader2,MessageCircle,Package,PenLine,Plus,ShieldCheck,SkipForward,Sparkles} from 'lucide-react';
import {assistantDestination,assistantResourceReceipts,nextAssistantStep} from '@/lib/workspace-assistant';
import type {AssistantAction,AssistantConversation,AssistantResourceReceipt,AssistantStep,AssistantWorkflow} from '@/lib/workspace-assistant';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {ChatQuestionStepper} from './chat-question-stepper';
import {ChatReplyDownload,WorkspaceChatDownloads} from './workspace-chat-downloads';
import './workspace-chat.css';

type Props={
  conversation:AssistantConversation|null;message:string;sent:string;busy:string;
  name:string;remaining:number;cost:number;credits:number|undefined;aiReady:boolean;unlimited?:boolean;
  onMessage:(value:string)=>void;onSend:(prompt:string)=>Promise<boolean>;
  onAction:(stepId:string,decision:'approve'|'skip')=>Promise<boolean>;onVisit:(href:string)=>void;
  onNewChat?:()=>void;
  products?:{id:string;title:string}[];
};
type AnswerDraft={id:string;values:Record<string,string>;index?:number};
type SavedDraft={message:string;answers:AnswerDraft;updatedAt:number};
type ProductDestination={title:string;id?:string;detail?:string};

const DRAFT_PREFIX='fivegen:workspace-chat:';
const MAX_MESSAGE=3000;
const SUGGESTIONS=[
  {icon:Lightbulb,label:'Start from scratch',prompt:'I want to start from scratch. Help me work out what I can make, who it is for, and the first steps.'},
  {icon:Package,label:'Turn an idea into a product',prompt:'Help me turn an idea into a useful digital product. Ask me what you need, then show me a detailed plan before creating anything.'},
  {icon:PenLine,label:'Plan my marketing',prompt:'Help me plan a marketing campaign for one of my existing products. Let’s choose the product and goal first.'},
  {icon:CalendarDays,label:'Organize my next steps',prompt:'Help me organize what to do next. I would like a practical plan, then we can schedule the tasks I approve.'},
];

function saveDraft(key:string,draft:SavedDraft){
  try{
    sessionStorage.setItem(key,JSON.stringify(draft));
    const keys=Array.from({length:sessionStorage.length},(_,index)=>sessionStorage.key(index)).filter((item):item is string=>Boolean(item?.startsWith(DRAFT_PREFIX)));
    if(keys.length>12){
      const ordered=keys.map(item=>{let updatedAt=0;try{updatedAt=Number(JSON.parse(sessionStorage.getItem(item)||'{}').updatedAt)||0;}catch{}return {key:item,updatedAt};}).sort((a,b)=>b.updatedAt-a.updatedAt);
      ordered.slice(12).forEach(item=>sessionStorage.removeItem(item.key));
    }
  }catch{}
}

function actionLabel(action:AssistantAction){
  return action.type==='create_product'?'Approve & create product':action.type==='create_campaign'?'Approve & create campaign':action.type==='create_calendar_event'?'Approve & add to Calendar':'I’ve done this';
}

export function WorkspaceChat({conversation,message,sent,busy,name,remaining,cost,credits,aiReady,unlimited,onMessage,onSend,onAction,onVisit,onNewChat,products=[]}:Props){
  const messages=conversation?.messages||[];
  const latest=messages.at(-1);
  const questions=latest?.role==='assistant'?(latest.questions||[]).slice(0,3):[];
  const workflow=conversation?.workflow;
  const next=nextAssistantStep(workflow);
  const savedResources=assistantResourceReceipts({kind:'workspace-assistant',workflow:workflow||null,resources:conversation?.resources}).filter(receipt=>receipt.type!=='manual');
  const previousResources=savedResources.filter(receipt=>receipt.planId!==workflow?.id);
  const manualFinished=workflow?.steps.filter(step=>step.status==='completed'&&step.action.type==='manual')||[];
  const pendingCount=workflow?.steps.filter(step=>step.status==='pending').length||0;
  const draftKey=`${DRAFT_PREFIX}${conversation?.id||'new'}`;
  const [answers,setAnswers]=useState<AnswerDraft>({id:'',values:{}});
  const [loadedKey,setLoadedKey]=useState('');
  const [localError,setLocalError]=useState('');
  const [acting,setActing]=useState(false);
  const [sending,setSending]=useState(false);
  const [showLatest,setShowLatest]=useState(false);
  const [planOpen,setPlanOpen]=useState(false);
  const [noteOpen,setNoteOpen]=useState(false);
  const shellRef=useRef<HTMLDivElement>(null);
  const scrollRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const latestRef=useRef<HTMLDivElement>(null);
  const nextRef=useRef<HTMLElement>(null);
  const submitRef=useRef(false);
  const actionRef=useRef(false);
  const followRef=useRef(true);
  const firstScrollRef=useRef(true);
  const messageChangeRef=useRef(onMessage);
  const inputId=useId();
  const helpId=useId();
  const errorId=useId();
  const statusId=useId();
  const currentAnswers=loadedKey===draftKey&&answers.id===latest?.id?answers.values:{};
  const answerFor=(index:number)=>currentAnswers[String(index)]||'';
  const answered=questions.filter((_,index)=>answerFor(index).trim()).length;
  const questionIndex=answers.id===latest?.id?Math.max(0,Math.min(answers.index||0,questions.length-1)):0;
  const showMessage=!questions.length||noteOpen;
  const answerText=questions.map((question,index)=>answerFor(index).trim()?`${question}\nMy answer: ${answerFor(index).trim()}`:'').filter(Boolean).join('\n\n');
  const reply=[answerText,message.trim()].filter(Boolean).join('\n\n');
  const tooLong=reply.length>MAX_MESSAGE;
  const hasDraft=Boolean(message.trim()||answered);
  const isBusy=Boolean(busy||sending||acting);
  const hasCredits=Boolean(unlimited||remaining>0||credits===undefined||credits>=cost);
  const canSend=reply.length>0&&!tooLong&&!isBusy&&aiReady&&hasCredits;
  const actionDisabled=isBusy||hasDraft;

  useEffect(()=>{messageChangeRef.current=onMessage;},[onMessage]);

  useEffect(()=>{
    let saved:SavedDraft|null=null;
    try{const parsed=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(parsed&&typeof parsed==='object')saved=parsed;}catch{}
    const restored:Record<string,string>={};
    if(saved?.answers?.values&&typeof saved.answers.values==='object')Object.entries(saved.answers.values).slice(0,3).forEach(([key,value])=>{if(/^[0-2]$/.test(key)&&typeof value==='string')restored[key]=value.slice(0,600);});
    const frame=window.requestAnimationFrame(()=>{
      setAnswers({id:typeof saved?.answers?.id==='string'?saved.answers.id:'',values:restored,index:Math.max(0,Math.min(2,Number(saved?.answers?.index)||0))});
      if(typeof saved?.message==='string')messageChangeRef.current(saved.message.slice(0,MAX_MESSAGE));
      setLoadedKey(draftKey);setLocalError('');setShowLatest(false);setNoteOpen(typeof saved?.message==='string'&&Boolean(saved.message.trim()));followRef.current=true;firstScrollRef.current=true;
    });
    return()=>window.cancelAnimationFrame(frame);
  },[draftKey]);

  useEffect(()=>{
    if(loadedKey!==draftKey)return;
    saveDraft(draftKey,{message:message.slice(0,MAX_MESSAGE),answers,updatedAt:Date.now()});
  },[draftKey,loadedKey,message,answers]);

  useEffect(()=>{
    const pane=scrollRef.current;if(!pane)return;
    function trackScroll(){if(pane)followRef.current=pane.scrollHeight-pane.scrollTop-pane.clientHeight<120;}
    pane.addEventListener('scroll',trackScroll,{passive:true});
    return()=>pane.removeEventListener('scroll',trackScroll);
  },[]);

  useLayoutEffect(()=>{
    const input=inputRef.current;if(!input)return;
    input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,168)}px`;
  },[message,showMessage]);

  useEffect(()=>{
    if(!latest?.id&&!sent)return;
    if(firstScrollRef.current||followRef.current){
      const pane=scrollRef.current;if(pane)pane.scrollTo({top:pane.scrollHeight,behavior:'instant'});
      firstScrollRef.current=false;
      setShowLatest(false);
    }else setShowLatest(true);
  },[latest?.id,sent,loadedKey,conversation?.updatedAt]);

  useEffect(()=>{
    const viewport=window.visualViewport;
    const app=shellRef.current?.closest<HTMLElement>('.gen-app');
    function fit(){
      const keyboard=Boolean(viewport&&viewport.height<window.innerHeight*.75);
      shellRef.current?.classList.toggle('wa-keyboard-open',keyboard);
      shellRef.current?.style.setProperty('--wa-viewport-height',`${viewport?.height||window.innerHeight}px`);
      app?.style.setProperty('--chat-viewport',`${viewport?.height||window.innerHeight}px`);
      app?.classList.toggle('chat-keyboard-open',keyboard);
    }
    fit();viewport?.addEventListener('resize',fit);window.addEventListener('resize',fit);
    return()=>{viewport?.removeEventListener('resize',fit);window.removeEventListener('resize',fit);app?.style.removeProperty('--chat-viewport');app?.classList.remove('chat-keyboard-open');};
  },[]);

  function updateAnswer(index:number,value:string){setAnswers({id:latest?.id||'',values:{...currentAnswers,[String(index)]:value.slice(0,600)},index});setLocalError('');}
  function selectQuestion(index:number){setAnswers({id:latest?.id||'',values:currentAnswers,index});}
  function focusMessage(value?:string){
    if(value!==undefined)onMessage(value);
    setNoteOpen(true);
    window.requestAnimationFrame(()=>inputRef.current?.focus({preventScroll:true}));
  }
  function jumpLatest(){followRef.current=true;setShowLatest(false);const pane=scrollRef.current;if(pane)pane.scrollTo({top:pane.scrollHeight,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  function reviewNext(){setPlanOpen(false);window.requestAnimationFrame(()=>{const pane=scrollRef.current,node=nextRef.current;if(pane&&node)pane.scrollTo({top:node.getBoundingClientRect().top-pane.getBoundingClientRect().top+pane.scrollTop-16,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});node?.focus({preventScroll:true});});}
  async function submit(){
    if(!canSend||submitRef.current)return;
    submitRef.current=true;setSending(true);setLocalError('');followRef.current=true;
    try{
      if(await onSend(reply)){
        setAnswers({id:'',values:{}});setNoteOpen(false);onMessage('');
        try{sessionStorage.removeItem(draftKey);}catch{}
        inputRef.current?.focus({preventScroll:true});
      }else setLocalError('Your message wasn’t sent. Your draft is saved here so you can try again.');
    }catch{setLocalError('Your message wasn’t sent. Your draft is saved here so you can try again.');}
    finally{submitRef.current=false;setSending(false);}
  }
  async function decide(step:AssistantStep,decision:'approve'|'skip'){
    if(actionDisabled||actionRef.current||step.id!==next?.id)return;
    actionRef.current=true;setActing(true);setLocalError('');
    try{if(!await onAction(step.id,decision))setLocalError('This step could not be saved. Review the message above, then try again.');}
    catch{setLocalError('This step could not be saved. Please try again.');}
    finally{actionRef.current=false;setActing(false);}
  }

  return <div className="workspace-assistant" ref={shellRef}>
    <header className="wa-heading">
      <div><span className="wa-eyebrow"><Sparkles size={14} aria-hidden="true"/>CHAT WITH GEN</span><h1>{messages.length?'Let’s keep things moving.':'What would you like to work on?'}</h1><p>Think it through here. Create it in the right part of your workspace.</p></div>
      <div className="wa-heading-actions">{workflow&&<button type="button" className="wa-new-chat wa-plan-toggle" onClick={()=>setPlanOpen(true)}><ClipboardList size={15} aria-hidden="true"/><span>View plan</span><span className="wa-plan-progress">{workflow.steps.length-pendingCount}/{workflow.steps.length}</span></button>}{onNewChat&&messages.length>0&&<button type="button" className="wa-new-chat" aria-label="New chat" title="New chat" onClick={onNewChat} disabled={isBusy}><Plus size={15} aria-hidden="true"/><span>New chat</span></button>}</div>
    </header>
    <div className="wa-layout">
      <section className="wa-thread" aria-label="Workspace assistant conversation" aria-busy={isBusy}>
        <div className="wa-transcript" ref={scrollRef} tabIndex={0} aria-label="Conversation history">
          {!messages.length&&!sent&&<section className="wa-welcome" aria-label="Start a conversation">
            <span className="wa-welcome-icon"><MessageCircle size={24} aria-hidden="true"/></span>
            <h2>A rough idea is enough.</h2><p>Ask a question, tell me what you want to make, or say you’re starting from zero. We’ll work out the details and a clear plan together.</p>
            <div className="wa-suggestions">{SUGGESTIONS.map(({icon:Icon,label,prompt})=><button type="button" key={label} disabled={isBusy} onClick={()=>focusMessage(prompt)}><Icon size={17} aria-hidden="true"/><span>{label}</span><ArrowRight size={15} aria-hidden="true"/></button>)}</div>
            <div className="wa-how"><span><b>1</b>Tell me your goal</span><span><b>2</b>Review the plan & drafts</span><span><b>3</b>Approve one step at a time</span></div>
            <p className="wa-existing-path">Already have your content? <button type="button" onClick={()=>onVisit('/build/new?source=upload')}>Import a file</button><span aria-hidden="true"> · </span><button type="button" onClick={()=>onVisit('/build/new?source=manual')}>Write it yourself</button></p>
          </section>}
          {messages.map((item,index)=><article key={item.id} className={`wa-message wa-${item.role}`}>
            <span className="wa-avatar" aria-hidden="true">{item.role==='assistant'?<Sparkles size={17}/>:name.slice(0,1).toUpperCase()||'Y'}</span>
            <div className="wa-message-body"><strong>{item.role==='assistant'?'Gen':name||'You'}</strong><div className="wa-message-copy">{item.content}</div>
              {item.questions?.length&&!(item.role==='assistant'&&index===messages.length-1&&questions.length>0)?<details className="wa-earlier-questions"><summary>Questions from this reply</summary><ul>{item.questions.slice(0,3).map((question,questionIndex)=><li key={questionIndex}>{question}</li>)}</ul></details>:null}
              {item.role==='assistant'&&<ChatReplyDownload messageId={item.id} content={item.content} questions={item.questions}/>}
            </div>
          </article>)}
          {sent&&<article className="wa-message wa-user"><span className="wa-avatar" aria-hidden="true">{name.slice(0,1).toUpperCase()||'Y'}</span><div className="wa-message-body"><strong>{name||'You'}</strong><div className="wa-message-copy">{sent}</div></div></article>}
          {Boolean(sent||sending||busy==='planning')&&<p className="wa-thinking" role="status"><Loader2 size={17} className="wa-spin" aria-hidden="true"/>Gen is thinking through your next step…</p>}
          {savedResources.length>0&&<section className="wa-results" aria-label="Created in your workspace"><h2><CheckCircle2 size={17} aria-hidden="true"/>Saved in your workspace</h2>{savedResources.map(receipt=><Result key={`${receipt.planId}:${receipt.stepId}`} step={receipt} onVisit={onVisit}/>)}</section>}
          {manualFinished.length>0&&<section className="wa-results" aria-label="Completed actions"><h2><CheckCircle2 size={17} aria-hidden="true"/>You’ve completed</h2>{manualFinished.map(step=><Result key={step.id} step={step} onVisit={onVisit}/>)}</section>}
          {workflow&&next&&<section className="wa-next-step" ref={nextRef} tabIndex={-1} aria-labelledby={`${statusId}-step`}>
            <div className="wa-next-label"><span>STEP {workflow.steps.indexOf(next)+1} OF {workflow.steps.length}</span><span><ActionIcon action={next.action}/>{assistantDestination(next.action)}</span></div>
            <h2 id={`${statusId}-step`}>{next.title}</h2><p className="wa-step-description">{next.description}</p>
            <div className="wa-reason"><h3>Why this comes next</h3><p>{next.why}</p></div>
            {next.needs.length>0&&<div className="wa-needs"><h3>What’s needed</h3><ul>{next.needs.map((need,index)=><li key={index}>{need}</li>)}</ul></div>}
            <ActionPreview action={next.action} productDestination={resolveProductDestination(next.action,workflow,products,savedResources)} expanded/>
            {next.error&&<p className="wa-inline-error" role="alert">{next.error}</p>}
            <div className="wa-step-permission"><ShieldCheck size={16} aria-hidden="true"/><p>{next.action.type==='manual'?'Complete this action yourself, then mark it done to move on.':`This creates the draft shown above in ${assistantDestination(next.action)}. Nothing is created until you approve. Execution adds no extra AI generation charge.`}</p></div>
            {hasDraft&&<p className="wa-unsent-note">Send your draft reply first so Gen can include your changes before you approve.</p>}
            <div className="wa-step-actions"><button type="button" className="wa-primary" disabled={actionDisabled} onClick={()=>void decide(next,'approve')} aria-describedby={hasDraft?`${statusId}-approval-help`:undefined}>{acting?<Loader2 size={17} className="wa-spin" aria-hidden="true"/>:next.action.type==='manual'?<Check size={17} aria-hidden="true"/>:<Sparkles size={17} aria-hidden="true"/>}{acting?'Saving step…':actionLabel(next.action)}</button><button type="button" className="wa-skip" disabled={actionDisabled} onClick={()=>void decide(next,'skip')}><SkipForward size={15} aria-hidden="true"/>Skip this step</button></div>
            <p className="wa-approval-help" id={`${statusId}-approval-help`}>Want to change anything? Tell Gen in the chat before approving.</p>
          </section>}
          {workflow&&!next&&<div className="wa-plan-finished"><CheckCircle2 size={19} aria-hidden="true"/><div><strong>This plan is complete.</strong><p>Keep chatting to ask a question, improve what you made, or work on your next idea.</p></div></div>}
          <div className="wa-latest-anchor" ref={latestRef}/>
        </div>
        <div className="wa-compose-dock">
          {showLatest&&<button type="button" className="wa-jump" onClick={jumpLatest}><ArrowDown size={14} aria-hidden="true"/>Jump to latest</button>}
          <form className="wa-composer" onSubmit={event=>{event.preventDefault();void submit();}}>
            {questions.length>0&&<>{!showMessage&&<ChatQuestionStepper questions={questions} index={questionIndex} answered={answered} value={answerFor(questionIndex)} disabled={isBusy} onAnswer={value=>updateAnswer(questionIndex,value)} onIndex={selectQuestion} onSubmit={()=>void submit()}/>}<button type="button" className="wa-note-toggle" aria-expanded={showMessage} onClick={()=>{setNoteOpen(open=>!open);if(!showMessage)window.requestAnimationFrame(()=>inputRef.current?.focus({preventScroll:true}));}} disabled={isBusy}>{showMessage?`Back to questions · ${answered}/${questions.length} answered`:message.trim()?'Review your added note':'Add a note or reply in your own words'}<ChevronDown size={13} aria-hidden="true"/></button></>}
            <label htmlFor={inputId} hidden={!showMessage}>{questions.length?'Anything else?':'Message Gen'}</label>
            <textarea id={inputId} ref={inputRef} hidden={!showMessage} rows={2} value={message} maxLength={MAX_MESSAGE} disabled={isBusy} placeholder={answered?'Add anything else, or send your answers…':workflow?'Ask anything, refine the plan, or start something new…':'Tell me what’s on your mind…'} aria-describedby={`${helpId}${tooLong||localError?` ${errorId}`:''}`} aria-invalid={tooLong||Boolean(localError)} onChange={event=>{onMessage(event.target.value);setNoteOpen(true);setLocalError('');}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229&&!window.matchMedia('(pointer: coarse)').matches){event.preventDefault();void submit();}}}/>
            <div className="wa-composer-bottom"><span>{!aiReady?'AI is not connected yet':isBusy?acting?'Saving your approved step…':'Gen is working…':unlimited?'Unlimited planning':remaining>0?`${remaining} included ${remaining===1?'message':'messages'} left`:`${cost} credits per message`}</span><button type="submit" disabled={!canSend} className="wa-send">{sending||busy==='planning'?<Loader2 size={17} className="wa-spin" aria-hidden="true"/>:<ArrowUp size={17} aria-hidden="true"/>}<span>{sending||busy==='planning'?'Thinking…':answered?'Send answers':'Send'}</span></button></div>
          </form>
          <div className="wa-composer-help" id={helpId}><span>Planning uses your message allowance. Each creation needs its own approval.</span><span className="wa-keyboard-hint"><CornerDownLeft size={12} aria-hidden="true"/>{questions.length&&!showMessage&&questionIndex<questions.length-1?'Enter for next question':'Enter to send'} · Shift + Enter for a new line</span></div>
          {(tooLong||localError||!hasCredits)&&<p className="wa-inline-error" role="alert" id={errorId}>{tooLong?`Your combined reply is ${reply.length-MAX_MESSAGE} characters too long. Shorten your message or answers to send it.`:localError||'You need more credits to send another planning message.'}</p>}
        </div>
      </section>
    </div>
      {workflow&&<Dialog open={planOpen} onOpenChange={setPlanOpen}><DialogContent className="wa-plan-dialog"><DialogHeader><DialogTitle>Your working plan</DialogTitle><DialogDescription>{workflow.steps.length-pendingCount} of {workflow.steps.length} steps reviewed. Each creation still needs your approval in the conversation.</DialogDescription></DialogHeader>
          <div className="wa-plan-inner">
            <h2>{workflow.title}</h2><p className="wa-plan-summary">{workflow.summary}</p><Roadmap workflow={workflow}/>
            <WorkspaceChatDownloads workflow={workflow}/>
            <ol className="wa-plan-steps">{workflow.steps.map((step,index)=><li key={step.id} className={`wa-plan-step is-${step.status}${step.id===next?.id?' is-next':''}`}>
              <details open={step.id===next?.id}>
                <summary><span className="wa-step-number">{step.status==='completed'?<Check size={14} aria-label="Completed"/>:step.status==='skipped'?<SkipForward size={13} aria-label="Skipped"/>:index+1}</span><span><strong>{step.title}</strong><small>{step.status==='completed'?'Completed':step.status==='skipped'?'Skipped':step.id===next?.id?index===0?'First: ready for your review':'Now: ready for your review':'Next: waiting for the previous step'}</small></span><ChevronDown size={14} aria-hidden="true"/></summary>
                <div className="wa-step-detail">
                  <span className="wa-destination"><ActionIcon action={step.action}/>{assistantDestination(step.action)}</span><p>{step.description}</p><h3>Why</h3><p>{step.why}</p>
                  {step.needs.length>0&&<><h3>Needed</h3><ul>{step.needs.map((need,needIndex)=><li key={needIndex}>{need}</li>)}</ul></>}
                  <ActionPreview action={step.action} productDestination={resolveProductDestination(step.action,workflow,products,savedResources)}/>
                  {step.result&&<Result step={step} onVisit={onVisit}/>}
                </div>
              </details>
            </li>)}</ol>
            {previousResources.length>0&&<details className="wa-saved-items"><summary>Previously saved items ({previousResources.length})<ChevronDown size={14} aria-hidden="true"/></summary><div>{previousResources.map(receipt=><Result key={`${receipt.planId}:${receipt.stepId}`} step={receipt} onVisit={onVisit}/>)}</div></details>}
            {workflow.assumptions.length>0&&<details className="wa-assumptions"><summary>Working assumptions<ChevronDown size={14} aria-hidden="true"/></summary><ul>{workflow.assumptions.map((assumption,index)=><li key={index}>{assumption}</li>)}</ul></details>}
            {next&&<button type="button" className="wa-review-next" onClick={reviewNext}>Review step {workflow.steps.indexOf(next)+1}<ArrowRight size={15} aria-hidden="true"/></button>}
            <p className="wa-plan-footnote"><ShieldCheck size={14} aria-hidden="true"/>Only the next step can be approved. You can revise the plan by chatting.</p>
          </div>
      </DialogContent></Dialog>}
    <p className="wa-sr-only" role="status" aria-live="polite" aria-atomic="true">{latest?.role==='assistant'?`Gen replied. ${latest.content.slice(0,180)}`:''}</p>
  </div>;
}

function ActionIcon({action}:{action:AssistantAction}){
  const Icon=action.type==='create_product'?Package:action.type==='create_campaign'?PenLine:action.type==='create_calendar_event'?CalendarDays:ClipboardList;
  return <Icon size={14} aria-hidden="true"/>;
}

function ActionPreview({action,expanded=false,productDestination}:{action:AssistantAction;expanded?:boolean;productDestination?:ProductDestination}){
  if(action.type==='manual')return <div className="wa-manual-preview"><h3>Your action</h3><p>{action.instructions}</p></div>;
  return <details className="wa-preview" open={expanded}>
    <summary><BookOpen size={15} aria-hidden="true"/><span>Exact draft to be saved{action.type==='create_product'?` · ${action.sections.length} sections`:action.type==='create_campaign'?` · ${action.items.length} items`:''}</span><ChevronDown size={15} aria-hidden="true"/></summary>
    <div className="wa-preview-content">
      <h3>{action.title}</h3>
      {productDestination&&<dl className="wa-preview-meta wa-product-destination"><div><dt>Product</dt><dd><strong>{productDestination.title}</strong>{productDestination.id&&<code>{productDestination.id}</code>}{productDestination.detail&&<small>{productDestination.detail}</small>}</dd></div></dl>}
      {action.type==='create_product'&&<><dl className="wa-preview-meta"><div><dt>Format</dt><dd>{action.format.replaceAll('_',' ')}</dd></div><div><dt>Language</dt><dd>{action.language}</dd></div><div><dt>For</dt><dd>{action.audience}</dd></div></dl><p>{action.description}</p><div className="wa-content-items">{action.sections.map((section,index)=><details key={index} open={expanded&&index===0}><summary><span>{String(index+1).padStart(2,'0')}</span>{section.title}<ChevronDown size={14} aria-hidden="true"/></summary><div className="wa-exact-copy">{section.body}</div></details>)}</div></>}
      {action.type==='create_campaign'&&<><p><b>Goal:</b> {action.goal}</p><p className="wa-preview-small">Saved as campaign drafts. Nothing is sent or published.</p><div className="wa-content-items">{action.items.map((item,index)=><details key={index} open={expanded&&index===0}><summary><span>{item.channel==='short_video'?'Short video':item.channel==='email'?'Email':'Social'}</span>{item.title}<ChevronDown size={14} aria-hidden="true"/></summary><div className="wa-exact-copy">{item.subject&&<p><b>Subject:</b> {item.subject}</p>}{item.body}</div></details>)}</div></>}
      {action.type==='create_calendar_event'&&<><dl className="wa-preview-meta wa-calendar-meta"><div><dt>Starts</dt><dd><time dateTime={eventDateTime(action.startAt)}>{formatEventDate(action.startAt,action.timezone)}</time></dd></div><div><dt>Ends</dt><dd><time dateTime={eventDateTime(action.endAt)}>{formatEventDate(action.endAt,action.timezone)}</time></dd></div><div><dt>Time zone</dt><dd>{action.timezone}</dd></div><div><dt>Type</dt><dd>{action.kind}</dd></div></dl>{action.notes&&<div className="wa-exact-copy">{action.notes}</div>}<p className="wa-preview-small">Will be added to your FiveGen Calendar after approval.</p></>}
    </div>
  </details>;
}

function formatEventDate(timestamp:number,timezone:string){
  try{return new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(timestamp);}catch{return new Date(timestamp).toLocaleString('en-US');}
}

function eventDateTime(timestamp:number){
  const date=new Date(timestamp);return Number.isFinite(date.getTime())?date.toISOString():undefined;
}

function Result({step,onVisit}:{step:AssistantStep|AssistantResourceReceipt;onVisit:(href:string)=>void}){
  const result=step.result;
  const href=result?.href?.startsWith('/')&&!result.href.startsWith('//')?result.href:null;
  const type='action' in step?step.action.type:step.type;
  const destination=type==='create_product'?'Products':type==='create_campaign'?'Marketing → Campaigns':type==='create_calendar_event'?'Calendar':'Your next action';
  return <div className="wa-result"><CheckCircle2 size={16} aria-hidden="true"/><div><strong>{result?.label||step.title}</strong><p>{result?.summary||'Completed.'}</p>{href&&<a href={href} onClick={event=>{if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onVisit(href);}}}>Open in {destination}<ExternalLink size={12} aria-hidden="true"/></a>}</div></div>;
}

function resolveProductDestination(action:AssistantAction,workflow:AssistantWorkflow|null|undefined,products:{id:string;title:string}[],resources:AssistantResourceReceipt[]):ProductDestination|undefined{
  if(action.type!=='create_campaign'&&action.type!=='create_calendar_event')return undefined;
  if(action.productStepId){
    const index=workflow?.steps.findIndex(step=>step.id===action.productStepId)??-1;
    const step=workflow?.steps[index];
    if(step?.action.type==='create_product')return {title:step.action.title,id:step.result?.productId||step.result?.resourceId,detail:`${step.status==='completed'?'Created':'Will be created'} in step ${index+1}`};
    return {title:'Product from an earlier plan step',detail:`Step reference: ${action.productStepId}`};
  }
  if(action.productId){
    const product=products.find(item=>item.id===action.productId);
    const receipt=resources.find(item=>item.type==='create_product'&&(item.result.productId===action.productId||item.result.resourceId===action.productId));
    return {title:product?.title||receipt?.result.label||receipt?.title||'Existing product',id:action.productId};
  }
  return {title:'No product attached',detail:'Saved to your workspace Calendar'};
}

function roadmapLines(title:string){
  const words=title.split(/\s+/);const lines=[''];
  for(const word of words){const current=lines.length-1;if(`${lines[current]} ${word}`.trim().length>19&&lines[current]){if(lines.length===2){lines[1]=`${lines[1].slice(0,16)}…`;break;}lines.push(word);}else lines[current]=`${lines[current]} ${word}`.trim();}
  return lines.map(line=>line.length>20?`${line.slice(0,18)}…`:line);
}

function Roadmap({workflow}:{workflow:AssistantWorkflow}){
  const rows=Math.ceil(workflow.steps.length/2),height=rows*89+10;
  const positions=workflow.steps.map((_,index)=>({x:(Math.floor(index/2)%2===0?index%2:1-index%2)*146+7,y:Math.floor(index/2)*89+7}));
  return <figure className="wa-roadmap"><svg viewBox={`0 0 298 ${height}`} fill="none" aria-hidden="true">{positions.slice(0,-1).map((point,index)=>{const next=positions[index+1];return <path key={`line-${index}`} className="wa-roadmap-line" d={point.y===next.y?point.x<next.x?`M ${point.x+132} ${point.y+36} Q ${point.x+140} ${point.y+31} ${next.x-2} ${next.y+36} m -5 -4 l 5 4 -5 4`:`M ${point.x} ${point.y+36} Q ${point.x-8} ${point.y+31} ${next.x+135} ${next.y+36} m 5 -4 l -5 4 5 4`:`M ${point.x+65} ${point.y+72} Q ${point.x+62} ${point.y+81} ${next.x+65} ${next.y-2} m -4 -5 l 4 5 4 -5`}/>;})}{workflow.steps.map((step,index)=>{const {x,y}=positions[index];return <g key={step.id} className={`wa-roadmap-node is-${step.status}`}><path d={`M ${x+4} ${y+1} Q ${x+66} ${y-2} ${x+127} ${y+1} Q ${x+133} ${y+3} ${x+132} ${y+9} L ${x+130} ${y+65} Q ${x+129} ${y+71} ${x+122} ${y+70} L ${x+8} ${y+72} Q ${x+1} ${y+71} ${x+2} ${y+63} L ${x+1} ${y+9} Q ${x} ${y+2} ${x+4} ${y+1} Z`}/><text className="wa-roadmap-index" x={x+12} y={y+17}>{String(index+1).padStart(2,'0')} {step.status==='completed'?'· done':step.status==='skipped'?'· skipped':''}</text>{roadmapLines(step.title).map((line,lineIndex)=><text key={lineIndex} x={x+12} y={y+37+lineIndex*15}>{line}</text>)}</g>;})}</svg><figcaption>A sketch of the steps below, in order.</figcaption></figure>;
}
