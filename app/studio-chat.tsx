'use client';

import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowRight,ArrowUp,Check,CheckCircle2,ChevronDown,Layers3,Loader2,Sparkles} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import type {StudioConversation,StudioPlan} from '@/lib/studio-plan';

type Props={
  conversation:StudioConversation|null; message:string; sent:string; busy:string;
  name:string; remaining:number; cost:number; credits:number|undefined; allowance:number; aiReady:boolean; unlimited?:boolean;
  onMessage:(value:string)=>void; onSend:(prompt:string)=>Promise<boolean>; onGenerate:()=>void; onOpenProduct:()=>void;
};

export function StudioChat(props:Props){
  const {conversation,message,sent,busy,name,remaining,cost,credits,allowance,aiReady,unlimited,onMessage,onSend,onGenerate,onOpenProduct}=props;
  const messages=conversation?.messages||[];
  const latest=messages.at(-1);
  const questions=latest?.role==='assistant'&&!conversation?.productId?latest.questions||[]:[];
  const draftKey=`fivegen:answers:${conversation?.id}:${latest?.id}`;
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [loadedDraft,setLoadedDraft]=useState('');
  const [planOpen,setPlanOpen]=useState(false);
  const [showLatest,setShowLatest]=useState(false);
  const shellRef=useRef<HTMLDivElement>(null),scrollRef=useRef<HTMLDivElement>(null),latestRef=useRef<HTMLElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null),questionsRef=useRef<HTMLDivElement>(null);
  const followRef=useRef(true),manualScrollRef=useRef(false),firstScroll=useRef(true),submitRef=useRef(false);

  useEffect(()=>{
    let saved:Record<string,string>={};
    try{const value=JSON.parse(sessionStorage.getItem(draftKey)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{}
    setAnswers(saved);setLoadedDraft(draftKey);
  },[draftKey]);
  const currentAnswers=loadedDraft===draftKey?answers:{};
  const answerFor=(q:string)=>typeof currentAnswers[q]==='string'?currentAnswers[q]:'';
  const answered=questions.filter(q=>answerFor(q).trim()).length;
  const answerText=questions.filter(q=>answerFor(q).trim()).map(q=>`${q}\nMy answer: ${answerFor(q).trim()}`).join('\n\n');
  const reply=[answerText,message.trim()].filter(Boolean).join('\n\n');
  const tooLong=reply.length>3000;
  const canSend=reply.length>=3&&!tooLong&&!busy&&(unlimited||remaining>0||credits===undefined||credits>=cost);
  const hasDraft=Boolean(answered||message.trim());

  function updateAnswer(question:string,value:string){
    const next={...currentAnswers,[question]:value};setAnswers(next);
    try{sessionStorage.setItem(draftKey,JSON.stringify(next));}catch{}
  }
  function reveal(node:HTMLElement|null,behavior:ScrollBehavior='smooth'){
    const pane=scrollRef.current;if(!pane||!node)return;
    manualScrollRef.current=false;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    pane.scrollTo({top:node.getBoundingClientRect().top-pane.getBoundingClientRect().top+pane.scrollTop-20,behavior:reduced?'instant':behavior});
    setShowLatest(false);
  }
  useLayoutEffect(()=>{
    const input=inputRef.current;if(!input)return;
    input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,120)}px`;
  },[message]);
  useLayoutEffect(()=>{followRef.current=true;firstScroll.current=true;setShowLatest(false);},[conversation?.id]);
  useLayoutEffect(()=>{
    if(firstScroll.current||followRef.current){reveal(latestRef.current,'instant');firstScroll.current=false;}
    else setShowLatest(true);
  },[latest?.id,sent]);
  useEffect(()=>{
    // Keep the composer above the on-screen keyboard as well as the browser chrome.
    const app=shellRef.current?.closest<HTMLElement>('.gen-app');
    const viewport=window.visualViewport;
    function fit(){app?.style.setProperty('--chat-viewport',`${viewport?.height||window.innerHeight}px`);app?.classList.toggle('chat-keyboard-open',Boolean(viewport&&viewport.height<window.innerHeight*.72));}
    fit();viewport?.addEventListener('resize',fit);window.addEventListener('resize',fit);
    return()=>{viewport?.removeEventListener('resize',fit);window.removeEventListener('resize',fit);app?.style.removeProperty('--chat-viewport');app?.classList.remove('chat-keyboard-open');};
  },[]);
  async function submit(){
    if(!canSend||submitRef.current)return;
    submitRef.current=true;followRef.current=true;
    try{if(await onSend(reply)){
      try{sessionStorage.removeItem(draftKey);}catch{}
      setAnswers({});inputRef.current?.focus({preventScroll:true});
    }}finally{submitRef.current=false;}
  }
  const plan=conversation?.plan;
  const planAction=<div className="chat-plan-action">
    <p>{conversation?.productId?'Your product is saved in your library.':hasDraft?'Send your reply first to include your latest answers.':unlimited?'Unlimited generation included for your account.':allowance>0?'Included in your free product allowance.':`${cost} credits per generation step.`}</p>
    <button className="button primary" disabled={!!busy||(!conversation?.productId&&(hasDraft||!aiReady))} onClick={()=>{setPlanOpen(false);conversation?.productId?onOpenProduct():onGenerate();}}>
      {busy==='create'?<Loader2 size={17} className="spin"/>:conversation?.productId?<CheckCircle2 size={17}/>:<Sparkles size={17}/>}
      {conversation?.productId?'Open product':'Generate product'}<ArrowRight size={16}/>
    </button>
    {!conversation?.productId&&<small>{unlimited?'Images and video are included too.':'Images and video use credits separately.'}</small>}
  </div>;

  return <div className="chat-workspace" ref={shellRef}>
    <header className="chat-heading"><div><span><Sparkles size={14}/>PRODUCT PLANNING</span><h1>{plan?.title||'Let’s shape your idea.'}</h1></div>
      {plan&&<button className="chat-plan-toggle" onClick={()=>setPlanOpen(true)}><Layers3 size={17}/><span>View plan</span><ChevronDown size={15}/></button>}
    </header>
    <div className={`chat-layout ${plan?'has-plan':''}`}>
      <section className="chat-thread" aria-label="Product planning conversation">
        <div className="chat-transcript" ref={scrollRef} onWheel={()=>{manualScrollRef.current=true;}} onTouchMove={()=>{manualScrollRef.current=true;}} onPointerDown={e=>{if(e.target===e.currentTarget)manualScrollRef.current=true;}} onKeyDown={e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key))manualScrollRef.current=true;}} onScroll={()=>{const pane=scrollRef.current;if(pane&&manualScrollRef.current)followRef.current=pane.scrollHeight-pane.scrollTop-pane.clientHeight<100;}} tabIndex={0} aria-label="Conversation history">
          {messages.map((m,index)=><article className={`chat-message ${m.role}`} key={m.id} ref={!sent&&index===messages.length-1?latestRef:undefined}>
            <span className="chat-avatar">{m.role==='assistant'?<Sparkles size={17}/>:name[0]||'Y'}</span>
            <div className="chat-message-body"><strong>{m.role==='assistant'?'FiveGen':name||'You'}</strong><p>{m.content}</p>
              {!!m.questions?.length&&(index===messages.length-1&&!conversation?.productId?<div className="chat-clarifications" ref={questionsRef}>
                <div className="chat-clarification-heading"><div><h2>A few details to make it yours</h2><p>Answer together below, or reply in your own words.</p></div><span>{answered}/{questions.length}</span></div>
                <fieldset disabled={!!busy}>
                  {questions.map((q,i)=><label className="chat-answer" key={`${m.id}-${i}`}><span><b>{i+1}</b>{q}{answerFor(q).trim()&&<Check size={15}/>}</span><textarea rows={2} maxLength={600} value={answerFor(q)} onChange={e=>updateAnswer(q,e.target.value)} onFocus={e=>{const pane=scrollRef.current;if(!pane)return;const bottom=e.currentTarget.getBoundingClientRect().bottom-pane.getBoundingClientRect().bottom+14;if(bottom>0){manualScrollRef.current=false;pane.scrollTop+=bottom;}}} placeholder="Your answer…"/></label>)}
                </fieldset>
                <div className="chat-answer-footer"><span>{answered?`${answered} ${answered===1?'answer':'answers'} ready to send`:'You can leave a detail for FiveGen to suggest.'}</span><button type="button" disabled={!answered||!canSend} onClick={()=>void submit()}>Send {answered===1?'answer':'answers'}<ArrowUp size={15}/></button></div>
              </div>:<details className="chat-past-questions"><summary>Questions from this step</summary><ul>{m.questions.map(q=><li key={q}>{q}</li>)}</ul></details>)}
            </div>
          </article>)}
          {sent&&<><article className="chat-message user" ref={latestRef}><span className="chat-avatar">{name[0]||'Y'}</span><div className="chat-message-body"><strong>You</strong><p>{sent}</p></div></article><div className="chat-thinking" role="status"><Loader2 size={16} className="spin"/>Updating your plan with these details…</div></>}
        </div>
        <div className="chat-compose-dock">
          {showLatest&&<button className="chat-jump" onClick={()=>{followRef.current=true;reveal(latestRef.current);}}>Latest message<ArrowDown size={14}/></button>}
          {conversation?.productId?<div className="chat-finished"><CheckCircle2 size={21}/><span>This plan is now a product.</span><button className="button primary" onClick={onOpenProduct}>Open product<ArrowRight size={15}/></button></div>:<>
            {answered>0&&<button className="chat-draft-summary" onClick={()=>reveal(questionsRef.current)}><CheckCircle2 size={14}/>{answered} of {questions.length} answers included<span>Review</span></button>}
            <form className="chat-composer" onSubmit={e=>{e.preventDefault();void submit();}}>
              <textarea ref={inputRef} rows={2} aria-label="Message FiveGen" placeholder={answered?'Add anything else (optional)…':'Reply to FiveGen or refine your idea…'} value={message} maxLength={3000} disabled={!!busy} onChange={e=>onMessage(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&!window.matchMedia('(pointer: coarse)').matches){e.preventDefault();void submit();}}}/>
              <div className="chat-compose-bottom"><span>{busy==='planning'?'FiveGen is thinking…':unlimited?'Unlimited planning':remaining>0?`${remaining} included messages left`:`${cost} credits per message`}</span><button type="submit" disabled={!canSend} aria-label={answered?'Send answers':'Send message'}>{busy==='planning'?<Loader2 size={18} className="spin"/>:<ArrowUp size={18}/>}<span>{busy==='planning'?'Thinking…':answered?'Send answers':'Send'}</span></button></div>
            </form>
            {tooLong?<p className="chat-reply-error" role="alert">Shorten your combined reply by {reply.length-3000} characters to send it.</p>:<div className="chat-compose-hint"><span>{questions.length?'Answers are sent together in one message.':'Your conversation is saved privately.'}</span><span className="chat-keyboard-hint">Enter to send · Shift + Enter for a new line</span></div>}
          </>}
        </div>
      </section>
      {plan&&<aside className="chat-plan-desktop" aria-label="Current product plan"><div className="chat-plan-label"><Layers3 size={17}/>YOUR PRODUCT PLAN</div><div className="chat-plan-scroll"><PlanDetails plan={plan}/></div>{planAction}</aside>}
    </div>
    <Dialog open={planOpen} onOpenChange={setPlanOpen}><DialogContent className="chat-plan-dialog"><DialogHeader><DialogTitle>Your product plan</DialogTitle><DialogDescription>Review the direction and deliverables before generating.</DialogDescription></DialogHeader><div className="chat-plan-scroll">{plan&&<PlanDetails plan={plan}/>}</div>{planAction}</DialogContent></Dialog>
  </div>;
}

function PlanDetails({plan}:{plan:StudioPlan}){
  return <div className="chat-plan-details"><div className="chat-plan-tags"><span>{plan.format}</span><span>{plan.language}</span></div><h2>{plan.title}</h2><p>{plan.description}</p><section><h3>Made for</h3><p>{plan.audience}</p></section><section><h3>What we’ll create</h3>{plan.deliverables.map((d,i)=><details key={i}><summary><span>{String(i+1).padStart(2,'0')}</span>{d.name}<ChevronDown size={14}/></summary><p>{d.detail}</p></details>)}</section>{plan.assumptions.length>0&&<details className="chat-plan-assumptions"><summary>Working assumptions<ChevronDown size={14}/></summary><ul>{plan.assumptions.map(a=><li key={a}>{a}</li>)}</ul></details>}</div>;
}
