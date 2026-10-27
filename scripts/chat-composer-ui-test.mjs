import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import * as icons from 'lucide-react';

// Exercise the shipped React controls and asynchronous handlers without providers.
// Browser QA separately verifies viewport and keyboard geometry.
const store=new Map(),previous={window:globalThis.window,sessionStorage:globalThis.sessionStorage};
const sessionStorage={get length(){return store.size;},key:index=>[...store.keys()][index]??null,getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};
const matches={coarse:false,reduced:true};
globalThis.window={innerHeight:900,requestAnimationFrame:fn=>{fn();return 1;},cancelAnimationFrame(){},addEventListener(){},removeEventListener(){},matchMedia:query=>({matches:query.includes('pointer')?matches.coarse:matches.reduced})};
globalThis.sessionStorage=sessionStorage;
const components={ChatQuestionStepper:()=>null,WorkspaceChatDownloads:()=>null,ChatReplyDownload:()=>null,GenMascot:()=>null};
const iconNames=['ArrowDown','ArrowRight','ArrowUp','BookOpen','CalendarDays','Check','CheckCircle2','ChevronDown','ChevronLeft','ChevronRight','ClipboardList','CornerDownLeft','ExternalLink','Layers3','Lightbulb','Loader2','MessageCircle','Package','PenLine','Plus','ShieldCheck','SkipForward','Sparkles'];
const deps={React,...Object.fromEntries(iconNames.map(name=>[name,icons[name]])),...components,...Object.fromEntries(['Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'].map(name=>[name,`test-${name}`])),nextAssistantStep:workflow=>workflow?.steps.find(step=>step.status==='pending'),assistantResourceReceipts:()=>[],assistantDestination:()=> 'Products'};
function nodes(tree,predicate=()=>true){const result=[];function visit(node){if(Array.isArray(node))node.forEach(visit);else if(node&&typeof node==='object'){if(predicate(node))result.push(node);visit(node.props?.children);}}visit(tree);return result;}
function text(node){return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):'';}
function one(tree,predicate){const result=nodes(tree,predicate);assert.equal(result.length,1);return result[0];}
function harness(file,name,props){
  const slots=[],effects=[],layouts=[],scrolls=[],hosts=new WeakMap();let cursor=0,tree;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  const useState=initial=>{const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return[slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];};
  const useRef=initial=>{const index=cursor++;if(!slots[index])slots[index]={value:{current:initial}};return slots[index].value;};
  const effect=(fn,dependencies,queue)=>{const index=cursor++,old=slots[index];if(!old||!same(old.dependencies,dependencies)){slots[index]={dependencies,cleanup:old?.cleanup};queue.push(()=>{slots[index].cleanup?.();slots[index].cleanup=fn();});}};
  const scope={...deps,useState,useRef,useId:()=>`chat-test-${cursor++}`,useEffect:(fn,values)=>effect(fn,values,effects),useLayoutEffect:(fn,values)=>effect(fn,values,layouts)};
  const source=fs.readFileSync(file,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),loaded={};
  new Function('exports',...Object.keys(scope),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText)(loaded,...Object.values(scope));
  const app={style:{setProperty(){},removeProperty(){}},classList:{toggle(){},remove(){}}};
  function render(){
    cursor=0;tree=loaded[name](props);
    nodes(tree,node=>node.props?.ref&&typeof node.type==='string').forEach(node=>{
      const ref=node.props.ref;if(!hosts.has(ref))hosts.set(ref,{style:{setProperty(){},removeProperty(){}},classList:{toggle(){}},closest:()=>app,scrollHeight:1200,clientHeight:400,scrollTop:0,focus(){},addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({top:100,bottom:500}),scrollTo(options){this.scrollTop=options.top;scrolls.push({className:node.props.className,...options});}});
      ref.current=hosts.get(ref);
    });
    while(layouts.length)layouts.shift()();return tree;
  }
  async function settle(){for(let index=0;index<6;index++){while(effects.length)effects.shift()();await new Promise(done=>setImmediate(done));render();}return tree;}
  return{props,render,settle,scrolls,get tree(){return tree;}};
}
const conversation={id:'conversation-one',messages:[{id:'reply-one',role:'assistant',content:'Let’s make a plan.',questions:['Who is this for?','What do they need?','What do you want to make?']}]};
const base={conversation,message:'',sent:'',busy:'',name:'Creator',remaining:10,cost:10,credits:100,aiReady:true,allowance:20,onMessage(){},onSend:async()=>false,onAction:async()=>true,onVisit(){},onGenerate(){},onOpenProduct(){}};
const stepper=tree=>one(tree,node=>node.type===components.ChatQuestionStepper);
const form=tree=>one(tree,node=>node.type==='form');
try{
  const sent=[];let succeed=false,approve=0;
  const chat=harness('app/workspace-chat.tsx','WorkspaceChat',{...base,onMessage:value=>{chat.props.message=value;},onSend:async value=>{sent.push(value);return succeed;},onAction:async()=>{approve++;return true;}});
  chat.render();await chat.settle();
  const transcript=one(chat.tree,node=>node.props?.className==='wa-transcript');
  assert.equal(nodes(transcript,node=>node.type==='textarea'||node.type===components.ChatQuestionStepper).length,0,'Active answers are never embedded in historical messages');
  assert.equal(one(transcript,node=>node.type===components.ChatReplyDownload).props.content,conversation.messages[0].content,'Freeform assistant replies remain downloadable without a workflow');
  assert.equal(nodes(form(chat.tree),node=>node.type===components.ChatQuestionStepper).length,1,'Question controls live with the send action');
  stepper(chat.tree).props.onAnswer('Independent creators');chat.render();await chat.settle();
  stepper(chat.tree).props.onIndex(1);chat.render();stepper(chat.tree).props.onAnswer('A clear first lesson');chat.render();await chat.settle();
  assert.equal(stepper(chat.tree).props.answered,2);assert.equal(stepper(chat.tree).props.value,'A clear first lesson');
  stepper(chat.tree).props.onIndex(0);chat.render();assert.equal(stepper(chat.tree).props.value,'Independent creators','Question navigation retains earlier answers');
  stepper(chat.tree).props.onIndex(1);chat.render();await chat.settle();
  const restored=harness('app/workspace-chat.tsx','WorkspaceChat',{...base,onMessage:value=>{restored.props.message=value;}});restored.render();await restored.settle();
  assert.equal(stepper(restored.tree).props.index,1);assert.equal(stepper(restored.tree).props.value,'A clear first lesson','Session reload restores answer and question position');
  one(chat.tree,node=>node.type==='button'&&text(node)==='Add a note or reply in your own words').props.onClick();chat.render();
  one(form(chat.tree),node=>node.type==='textarea').props.onChange({target:{value:'Keep my own voice.'}});chat.render();
  assert.equal(nodes(form(chat.tree),node=>node.type===components.ChatQuestionStepper).length,0,'Note mode uses one visible input');
  one(chat.tree,node=>node.type==='button'&&text(node).startsWith('Back to questions')).props.onClick();chat.render();await chat.settle();
  assert.equal(stepper(chat.tree).props.answered,2);assert.equal(chat.props.message,'Keep my own voice.','Switching back to questions preserves the unsent note');
  form(chat.tree).props.onSubmit({preventDefault(){}});await chat.settle();
  assert.match(sent[0],/Who is this for\?\nMy answer: Independent creators/);assert.match(sent[0],/What do they need\?\nMy answer: A clear first lesson/);assert.ok(sent[0].endsWith('Keep my own voice.'));
  assert.equal(stepper(chat.tree).props.answered,2);assert.equal(chat.props.message,'Keep my own voice.','Failed send keeps all answers and the message');assert.match(text(chat.tree),/wasn’t sent/);
  succeed=true;form(chat.tree).props.onSubmit({preventDefault(){}});await chat.settle();assert.equal(stepper(chat.tree).props.answered,0);assert.equal(chat.props.message,'','Successful send clears the sent draft');
  const workflow={id:'plan',title:'Launch',summary:'A reviewed plan',assumptions:[],steps:[{id:'create',title:'Create product',description:'A useful lesson',why:'Start small',needs:[],status:'pending',action:{type:'create_product',title:'Lesson',format:'course',audience:'Creators',language:'English',description:'Practical',sections:[]}}]};
  chat.props.conversation={...conversation,workflow};chat.props.message='Change the title';chat.render();
  let approval=one(chat.tree,node=>node.type==='button'&&text(node)==='Approve & create product');assert.equal(approval.props.disabled,true);approval.props.onClick();await chat.settle();assert.equal(approve,0,'Unsent edits cannot be bypassed by approving a stale plan');
  chat.props.message='';chat.render();approval=one(chat.tree,node=>node.type==='button'&&text(node)==='Approve & create product');assert.equal(approval.props.disabled,false);approval.props.onClick();await chat.settle();assert.equal(approve,1);
  assert.ok(chat.scrolls.length>0&&chat.scrolls.every(item=>item.className==='wa-transcript'),'Following a reply scrolls the transcript, not the document');
  chat.props.message='x'.repeat(3000);chat.render();stepper(chat.tree).props.onAnswer('Answer');chat.render();assert.equal(one(chat.tree,node=>node.type==='button'&&node.props.type==='submit').props.disabled,true,'Combined answers and note respect the server message limit');

  const calls=[];const questions=harness('app/chat-question-stepper.tsx','ChatQuestionStepper',{questions:conversation.messages[0].questions,index:0,answered:0,value:'',disabled:false,onAnswer:value=>calls.push(['answer',value]),onIndex:value=>calls.push(['index',value]),onSubmit:()=>calls.push(['submit'])});questions.render();
  assert.equal(nodes(questions.tree,node=>node.type==='textarea').length,1,'Only the current question creates an input');
  const key=(nativeEvent={},extra={})=>({key:'Enter',shiftKey:false,nativeEvent:{keyCode:13,isComposing:false,...nativeEvent},preventDefault(){calls.push(['prevent']);},...extra});
  const input=()=>one(questions.tree,node=>node.type==='textarea');
  input().props.onKeyDown(key({isComposing:true}));input().props.onKeyDown(key({keyCode:229}));input().props.onKeyDown(key({}, {shiftKey:true}));assert.equal(calls.length,0,'IME composition and multiline input never advance or send');
  matches.coarse=true;input().props.onKeyDown(key());assert.equal(calls.length,0,'Mobile Enter remains a newline');matches.coarse=false;
  input().props.onKeyDown(key());assert.deepEqual(calls,[['prevent'],['index',1]],'Desktop Enter advances a question before sending');
  questions.props.index=2;questions.render();input().props.onKeyDown(key());assert.deepEqual(calls.at(-1),['submit']);

  const legacySent=[];const legacy=harness('app/studio-chat.tsx','StudioChat',{...base,onMessage:value=>{legacy.props.message=value;},onSend:async value=>{legacySent.push(value);return false;}});legacy.render();await legacy.settle();
  assert.equal(nodes(one(legacy.tree,node=>node.props?.className==='chat-transcript'),node=>node.type===components.ChatQuestionStepper).length,0);
  stepper(legacy.tree).props.onAnswer('My existing audience');legacy.render();stepper(legacy.tree).props.onIndex(1);legacy.render();stepper(legacy.tree).props.onAnswer('Practical help');legacy.render();form(legacy.tree).props.onSubmit({preventDefault(){}});await legacy.settle();assert.equal(stepper(legacy.tree).props.answered,2);assert.match(legacySent[0],/My existing audience/);assert.match(legacySent[0],/Practical help/);assert.match(text(legacy.tree),/draft is still here/);
  legacy.props.aiReady=false;legacy.render();assert.equal(one(legacy.tree,node=>node.type==='button'&&node.props.type==='submit').props.disabled,true);
  let complete,requests=0;const concurrent=harness('app/workspace-chat.tsx','WorkspaceChat',{...base,conversation:null,message:'A useful idea',onMessage:value=>{concurrent.props.message=value;},onSend:()=>{requests++;return new Promise(resolve=>{complete=resolve;});}});concurrent.render();await concurrent.settle();const sendForm=form(concurrent.tree);sendForm.props.onSubmit({preventDefault(){}});sendForm.props.onSubmit({preventDefault(){}});assert.equal(requests,1,'A double click cannot send the same reply twice');complete(false);await concurrent.settle();assert.equal(concurrent.props.message,'A useful idea');
  console.log('Passed: actual chat controls, docked questions, one-at-a-time navigation, session answer/cursor recovery, reply aggregation, send-failure preservation, approval draft gate, transcript follow scrolling, message limits, IME/Shift/mobile Enter and legacy chat parity. No provider calls.');
}finally{Object.assign(globalThis,previous);}
