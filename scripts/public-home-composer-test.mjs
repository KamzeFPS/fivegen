import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import * as icons from 'lucide-react';

// Run the shipped React handlers with asynchronous browser storage. Browser QA
// covers actual rendering, hit areas and viewport geometry separately.
const names=['window','document','sessionStorage','indexedDB','fetch','requestAnimationFrame','cancelAnimationFrame'];
const previous=Object.fromEntries(names.map(name=>[name,globalThis[name]]));
const session=new Map(),records=new Map(),timers=new Map(),frames=new Map(),listeners=new Map(),navigations=[];
let failWrites=false,holdWrites=false,reducedMotion=false,httpCalls=0,nextTimer=0,nextFrame=0;
const waitingWrites=[];
const copy=draft=>({...draft,files:draft.files.map(item=>({...item,file:new File([item.file],item.file.name,{type:item.file.type,lastModified:item.file.lastModified})}))});
const stores=new Set();
const idb={objectStoreNames:{contains:name=>stores.has(name)},createObjectStore:name=>stores.add(name),close(){},transaction(){const transaction={objectStore(){return {
  get(key){const request={};queueMicrotask(()=>{request.result=records.has(key)?copy(records.get(key)):undefined;request.onsuccess?.();});return request;},
  put(value,key){const complete=()=>{if(failWrites){transaction.error=new Error('Storage blocked');transaction.onerror?.();}else{records.set(key,copy(value));transaction.oncomplete?.();}};if(holdWrites)waitingWrites.push(complete);else queueMicrotask(complete);},
  delete(key){queueMicrotask(()=>{records.delete(key);transaction.oncomplete?.();});},clear(){queueMicrotask(()=>{records.clear();transaction.oncomplete?.();});},
};}};return transaction;}};
globalThis.indexedDB={open(){const request={result:idb};queueMicrotask(()=>{request.onupgradeneeded?.();request.onsuccess?.();});return request;}};
globalThis.sessionStorage={getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,String(value)),removeItem:key=>session.delete(key)};
globalThis.fetch=async()=>{httpCalls++;throw new Error('The public composer must never upload or call a provider.');};
globalThis.document={hidden:false};
globalThis.requestAnimationFrame=callback=>{const id=++nextFrame;frames.set(id,callback);return id;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
globalThis.window={
  location:{assign:url=>{assert.ok(records.has('landing')||session.has('fivegen:attachment-draft:landing'),'A durable draft exists before navigation');navigations.push(url);}},
  setTimeout:callback=>{const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
  addEventListener:(name,callback)=>{const handlers=listeners.get(name)||new Set();handlers.add(callback);listeners.set(name,handlers);},removeEventListener:(name,callback)=>listeners.get(name)?.delete(callback),
  matchMedia:()=>({get matches(){return reducedMotion;}}),
};
function sourceExports(path,scope){const source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),exports={};new Function('exports',...Object.keys(scope),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText)(exports,...Object.values(scope));return exports;}
const draft=sourceExports('lib/workspace-attachment-draft.ts',{workspaceAttachmentLimits:{files:4,fileBytes:8*1024*1024,totalBytes:20*1024*1024}});
function nodes(tree,predicate=()=>true){const found=[];function visit(node){if(Array.isArray(node))node.forEach(visit);else if(node&&typeof node==='object'){if(predicate(node))found.push(node);visit(node.props?.children);}}visit(tree);return found;}
function text(node){return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):'';}
function one(tree,predicate){const found=nodes(tree,predicate);assert.equal(found.length,1,'One matching control');return found[0];}
function harness(name){
  const slots=[],effects=[],hosts=new WeakMap(),scrolls=[];let cursor=0,tree;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  const useState=initial=>{const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];};
  const useRef=initial=>{const index=cursor++;if(!slots[index])slots[index]={value:{current:initial}};return slots[index].value;};
  const useEffect=(callback,dependencies)=>{const index=cursor++,old=slots[index];if(!old||!same(old.dependencies,dependencies)){slots[index]={dependencies,cleanup:old?.cleanup};effects.push(()=>{slots[index].cleanup?.();slots[index].cleanup=callback();});}};
  const iconNames=['ArrowLeft','ArrowRight','Camera','ChartNoAxesColumnIncreasing','FileText','Funnel','Lightbulb','Loader2','Paperclip','Pause','Pencil','Play','X'];
  const scope={React,...Object.fromEntries(iconNames.map(name=>[name,icons[name]])),...draft,useState,useRef,useEffect,useId:()=>`landing-test-${cursor++}`,Link:'a',Brand:()=>null,AppearanceControl:()=>null};
  const component=sourceExports('app/public-home-composer.tsx',scope)[name];
  function render(){cursor=0;tree=component();nodes(tree,node=>node.props?.ref&&typeof node.type==='string').forEach(node=>{const ref=node.props.ref;if(!hosts.has(ref))hosts.set(ref,{focus(){},click(){},contains:()=>false,scrollLeft:0,clientWidth:500,scrollWidth:3000,querySelector:()=>({offsetWidth:1000}),scrollBy(options){this.scrollLeft+=options.left;scrolls.push(options);}});ref.current=hosts.get(ref);});return tree;}
  async function settle(){for(let index=0;index<6;index++){while(effects.length)effects.shift()();await new Promise(done=>setImmediate(done));render();}return tree;}
  function unmount(){slots.forEach(slot=>slot.cleanup?.());}
  return {render,settle,unmount,scrolls,get tree(){return tree;}};
}
const textarea=app=>one(app.tree,node=>node.type==='textarea');
const form=app=>one(app.tree,node=>node.type==='form');
const button=(app,label)=>one(app.tree,node=>node.type==='button'&&text(node)===label);
const tab=(app,label)=>one(app.tree,node=>node.props?.role==='tab'&&text(node)===label);
function type(app,value){textarea(app).props.onChange({target:{value}});app.render();}
function clickTab(app,label){tab(app,label).props.onClick();app.render();}
function pick(app,files){one(app.tree,node=>node.type==='input'&&node.props.type==='file').props.onChange({target:{files,value:'selected'}});app.render();}
async function clear(){holdWrites=false;failWrites=false;await draft.deleteWorkspaceAttachmentDraft('landing');navigations.length=0;}
function tick(now){const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(now));}

try{
  const app=harness('PublicHomeComposer');app.render();await app.settle();
  clickTab(app,'Marketing plan');type(app,'Market my existing gardening guide with a practical seven-day plan.');
  clickTab(app,'Idea to product');type(app,'Create an ebook for first-time gardeners.');
  clickTab(app,'Marketing plan');assert.equal(textarea(app).props.value,'Market my existing gardening guide with a practical seven-day plan.','Switching tasks preserves an edited draft');
  clickTab(app,'Idea to product');assert.equal(textarea(app).props.value,'Create an ebook for first-time gardeners.');
  button(app,'Invitation').props.onClick();app.render();assert.equal(tab(app,'Designs').props['aria-selected'],true);assert.match(textarea(app).props.value,/botanical wedding invitation/);
  type(app,'Create an ebook about indoor plants instead.');form(app).props.onSubmit({preventDefault(){}});await app.settle();
  assert.equal(records.get('landing').message,'Create an ebook about indoor plants instead.');assert.equal(records.get('landing').productKind,undefined,'Typing a new prompt clears the chip’s stale product format');
  assert.equal(navigations.length,1);assert.equal(new URL(navigations[0],'https://fivegen.test').searchParams.get('return_to'),'/?view=create&intent=1');assert.ok(!navigations[0].includes('indoor'),'Prompt content never enters the authentication URL');app.unmount();await clear();

  const files=harness('PublicHomeComposer');files.render();await files.settle();type(files,'Use my private reference to plan a guide.');
  const reference=new File(['Original private reference bytes'],'reference.txt',{type:'text/plain',lastModified:42});pick(files,[reference]);
  assert.equal(httpCalls,0,'Selecting and editing an attachment keeps its bytes local');assert.equal(navigations.length,0);assert.equal(nodes(files.tree,node=>node.type==='button'&&node.props['aria-label']==='Remove reference.txt').length,1);
  holdWrites=true;form(files).props.onSubmit({preventDefault(){}});await files.settle();assert.equal(navigations.length,0,'Sign in waits for the IndexedDB transaction');assert.equal(waitingWrites.length,1);assert.equal(one(files.tree,node=>node.type==='button'&&node.props.type==='submit').props.disabled,true);
  holdWrites=false;waitingWrites.splice(0).forEach(complete=>complete());await files.settle();assert.equal(navigations.length,1);assert.equal(await records.get('landing').files[0].file.text(),'Original private reference bytes','The actual File bytes are persisted before authentication');assert.equal(httpCalls,0);files.unmount();await clear();

  const blocked=harness('PublicHomeComposer');blocked.render();await blocked.settle();pick(blocked,[reference]);failWrites=true;form(blocked).props.onSubmit({preventDefault(){}});await blocked.settle();
  assert.equal(navigations.length,0,'A failed durable write with files blocks navigation');assert.match(text(blocked.tree),/Keep this page open/);assert.equal(nodes(blocked.tree,node=>node.type==='button'&&node.props['aria-label']==='Remove reference.txt').length,1,'Failed persistence keeps the removable original file in the current page');assert.equal(one(blocked.tree,node=>node.type==='button'&&node.props.type==='submit').props.disabled,false);blocked.unmount();await clear();

  const carousel=harness('PublicHomeShowcase');carousel.render();await carousel.settle();const rail=one(carousel.tree,node=>node.props?.className==='public-home-projects'),host=rail.props.ref.current;
  tick(100);tick(3200);assert.ok(host.scrollLeft>0,'Examples can advance automatically');
  const beforeHover=host.scrollLeft;rail.props.onMouseEnter();tick(3300);assert.equal(host.scrollLeft,beforeHover,'Hover pauses automatic motion');rail.props.onMouseLeave();rail.props.onFocus();tick(3400);assert.equal(host.scrollLeft,beforeHover,'Keyboard focus pauses automatic motion');rail.props.onBlur({currentTarget:host,relatedTarget:null});
  assert.equal(nodes(carousel.tree,node=>node.type==='button').length,0,'The continuous strip contains no playback or arrow controls');
  assert.equal(nodes(carousel.tree,node=>node.type==='a'&&node.props.tabIndex!==-1).length,5,'Only the original examples are keyboard links');assert.equal(nodes(carousel.tree,node=>node.props?.className==='public-home-project-group'&&node.props['aria-hidden']===true).length,2,'Duplicate groups make the loop seamless without duplicate accessible content');
  host.scrollLeft=999.8;tick(5000);assert.ok(host.scrollLeft<1,'Automatic scrolling wraps by one measured group, retaining the visible duplicate composition');
  const wrapped=host.scrollLeft;reducedMotion=true;tick(10000);tick(14000);assert.equal(host.scrollLeft,wrapped,'Reduced motion prevents automatic scrolling');carousel.unmount();
  assert.equal(httpCalls,0,'Public interactions never perform an upload or provider request');
  console.log('Public composer passed: actual preset/chip handlers, independent edited drafts, stale-format clearing, real File persistence before auth, blocked-storage navigation guard, private URL, no HTTP, and seamless examples with hover/focus/reduced-motion pause.');
}finally{Object.assign(globalThis,previous);}
