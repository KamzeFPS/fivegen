'use client';

import {useId,useLayoutEffect,useRef} from 'react';
import {CheckCircle2,ChevronLeft,ChevronRight} from 'lucide-react';
import './chat-question-stepper.css';

type Props={
  questions:string[];index:number;answered:number;value:string;disabled:boolean;
  onAnswer:(value:string)=>void;onIndex:(index:number)=>void;onSubmit:()=>void;
};

/** Keep active questions beside the send action; older replies stay read-only. */
export function ChatQuestionStepper({questions,index,answered,value,disabled,onAnswer,onIndex,onSubmit}:Props){
  const id=useId(),input=useRef<HTMLTextAreaElement>(null);
  const current=Math.max(0,Math.min(index,questions.length-1));
  useLayoutEffect(()=>{
    const field=input.current;if(!field)return;
    field.style.height='auto';field.style.height=`${Math.min(field.scrollHeight,96)}px`;
  },[value,current]);
  function select(next:number){onIndex(next);input.current?.focus({preventScroll:true});}
  return <section className="chat-followup" aria-label="Questions from Gen">
    <div className="chat-followup-top"><span>Question {current+1} of {questions.length}</span><span><CheckCircle2 size={13} aria-hidden="true"/>{answered} answered</span></div>
    <label htmlFor={id}>{questions[current]}</label>
    <textarea id={id} ref={input} rows={1} value={value} disabled={disabled} maxLength={600} placeholder="Your answer (optional)…" onChange={event=>onAnswer(event.target.value)} onKeyDown={event=>{
      if(event.key!=='Enter'||event.shiftKey||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||window.matchMedia('(pointer: coarse)').matches)return;
      event.preventDefault();if(current<questions.length-1)select(current+1);else onSubmit();
    }}/>
    <div className="chat-followup-navigation"><span>Send any answers together. Skip anything you’re unsure of.</span><div><button type="button" disabled={disabled||current===0} aria-label="Previous question" onClick={()=>select(current-1)}><ChevronLeft size={15} aria-hidden="true"/></button><button type="button" disabled={disabled||current===questions.length-1} aria-label="Next question" onClick={()=>select(current+1)}><ChevronRight size={15} aria-hidden="true"/></button></div></div>
  </section>;
}
