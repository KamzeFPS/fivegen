import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';

// Exercise the actual dialog component with a deterministic visible-time clock.
// Dialog primitives remain identifiable tags; close/Escape behavior is delegated
// to their real controlled onOpenChange contract rather than reimplemented here.
const source=readFileSync('app/workspace-product-ready.tsx','utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
const nodes=value=>Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(value.props.children)]:[];
const text=value=>Array.isArray(value)?value.map(text).join(''):React.isValidElement(value)?text(value.props.children):typeof value==='string'||typeof value==='number'?String(value):'';
const completion={key:'conversation-1:plan-1:product-1',convId:'conversation-1',planId:'plan-1',title:'A useful first lesson',href:'/build/product-1?area=content'};

function harness({hidden=false,initialProps={}}={}){
 let props={completion,onClose:()=>closed++,onOpen:()=>opened++,...initialProps},cursor=0,dirty=true,tree,disposed=false,lateUpdates=0,clock=0,timerId=0,opened=0,closed=0;
 const hooks=[],effects=[],timers=new Map(),scheduled=[],listeners=new Map();
 const document={hidden,visibilityState:hidden?'hidden':'visible',addEventListener(name,listener){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(listener);},removeEventListener(name,listener){listeners.get(name)?.delete(listener);}};
 const scope={React,document,
  ...Object.fromEntries(['Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'].map(name=>[name,`test-${name}`])),Button:'button',
  ...Object.fromEntries(['ArrowRight','Check','Package'].map(name=>[name,()=>React.createElement('svg',{'aria-hidden':true})])),
  useState(initial){const index=cursor++;if(!(index in hooks))hooks[index]={value:typeof initial==='function'?initial():initial};return[hooks[index].value,next=>{if(disposed){lateUpdates++;return;}const value=typeof next==='function'?next(hooks[index].value):next;if(!Object.is(value,hooks[index].value)){hooks[index].value=value;dirty=true;}}];},
  useRef(initial){const index=cursor++;return hooks[index]||=({current:initial});},
  useEffect(callback,deps){const index=cursor++,previous=hooks[index];if(!previous||!same(previous.deps,deps)){hooks[index]={deps,cleanup:previous?.cleanup};effects.push(()=>{hooks[index].cleanup?.();hooks[index].cleanup=callback();});}},
  setTimeout(callback,delay){const id=++timerId;timers.set(id,{id,callback,due:clock+delay});scheduled.push(callback);return id;},
  clearTimeout(id){timers.delete(id);},
  fetch(){throw new Error('The product-ready dialog cannot make an external request.');},
 };
 const exports={};new Function('exports',...Object.keys(scope),compiled)(exports,...Object.values(scope));
 function render(){if(disposed||!dirty)return;let passes=0;while(dirty){assert.ok(passes++<20,'Effects must settle without a render loop');dirty=false;cursor=0;tree=exports.WorkspaceProductReady(props);while(effects.length)effects.shift()();}}
 function advance(milliseconds){const target=clock+milliseconds;let passes=0;while(true){const next=[...timers.values()].filter(timer=>timer.due<=target).sort((a,b)=>a.due-b.due||a.id-b.id)[0];if(!next)break;assert.ok(passes++<100,'The countdown must not spin indefinitely');clock=next.due;timers.delete(next.id);next.callback();render();}clock=target;render();}
 function find(type){return nodes(tree).find(node=>node.type===type);}
 function button(label){const found=nodes(tree).find(node=>node.type==='button'&&text(node)===label);assert.ok(found,`${label} control exists`);return found;}
 render();
 return{get tree(){return tree;},get text(){return text(tree);},get opened(){return opened;},get closed(){return closed;},get lateUpdates(){return lateUpdates;},get pending(){return timers.size;},get listenerCount(){return listeners.get('visibilitychange')?.size||0;},get scheduled(){return scheduled;},find,button,advance,
  click(label){button(label).props.onClick();render();},
  update(next){props={...props,...next};dirty=true;render();},
  visibility(value){document.hidden=!value;document.visibilityState=value?'visible':'hidden';for(const listener of [...(listeners.get('visibilitychange')||[])])listener();render();},
  dismiss(){find('test-Dialog').props.onOpenChange(false);render();},
  dispose(){if(disposed)return;disposed=true;for(const hook of hooks)hook?.cleanup?.();},
 };
}

{
 const app=harness();
 assert.equal(app.find('test-Dialog').props.open,true,'The confirmed completion opens a controlled dialog');
 assert.match(text(app.find('test-DialogTitle')),/product draft is ready/i);
 assert.match(text(app.find('test-DialogDescription')),/Saved privately.*Review your content before you publish/i,'The description distinguishes a saved draft from publication');
 assert.ok(app.text.includes(completion.title),'The dialog names the saved product');
 const content=app.find('test-DialogContent');assert.notEqual(content.props.showCloseButton,false,'The standard accessible close control remains available');
 let focused=0,prevented=0;app.button('Open product').props.ref.current={focus(){focused++;}};
 content.props.onOpenAutoFocus({preventDefault(){prevented++;}});
 assert.equal(focused,1,'Opening focuses the primary Open product control');assert.equal(prevented,1,'Custom initial focus prevents competing default focus');
 content.props.onCloseAutoFocus({preventDefault(){prevented++;}});assert.equal(prevented,2,'The parent controls return focus rather than a missing dialog trigger');
 assert.match(app.text,/Opening your product in 5 seconds/);assert.equal(app.pending,1);assert.equal(app.listenerCount,1);
 app.advance(4000);assert.equal(app.opened,0);assert.match(app.text,/Opening your product in 1 second/);
 app.advance(999);assert.equal(app.opened,0,'Automatic navigation waits for the full five seconds');
 app.advance(1);assert.equal(app.opened,1);assert.equal(app.closed,0);assert.equal(app.pending,0);
 app.advance(10000);app.click('Open product');app.dismiss();assert.equal(app.opened,1,'Automatic completion, button and dismissal races cannot navigate twice');assert.equal(app.closed,0);
 app.dispose();assert.equal(app.listenerCount,0);
}
{
 const app=harness();app.advance(2000);app.click('Open product');
 assert.equal(app.opened,1);assert.equal(app.closed,0);assert.equal(app.pending,0,'Immediate navigation cancels the countdown');
 app.click('Open product');app.advance(10000);assert.equal(app.opened,1,'Repeated primary clicks have one outcome');app.dispose();
}
for(const dismissal of ['Stay in chat','Close button','Escape']){
 const app=harness();app.advance(4999);
 if(dismissal==='Stay in chat')app.click('Stay in chat');else app.dismiss();
 assert.equal(app.closed,1,`${dismissal} cancels the pending navigation`);assert.equal(app.opened,0);assert.equal(app.pending,0);
 app.dismiss();app.click('Stay in chat');app.advance(10000);assert.equal(app.closed,1,`${dismissal} settles once`);assert.equal(app.opened,0);
 app.dispose();assert.equal(app.listenerCount,0);
}
{
 const app=harness();app.advance(2000);assert.match(app.text,/Opening your product in 3 seconds/);
 app.visibility(false);assert.equal(app.pending,0,'Hidden documents have no scheduled navigation tick');
 app.advance(60000);assert.equal(app.opened,0);assert.match(app.text,/Opening your product in 3 seconds/,'Time spent hidden does not consume the countdown');
 app.visibility(true);assert.equal(app.pending,1);app.advance(2999);assert.equal(app.opened,0);app.advance(1);assert.equal(app.opened,1,'Visible time resumes the remaining countdown');
 app.dispose();
}
{
 const app=harness({hidden:true});assert.equal(app.pending,0,'An initially hidden dialog does not start its timer');
 app.advance(10000);assert.equal(app.opened,0);app.visibility(true);app.advance(5000);assert.equal(app.opened,1);app.dispose();
}
{
 const app=harness();app.advance(1000);const cancelled=[...app.scheduled];app.dispose();
 assert.equal(app.pending,0,'Unmount clears the pending timeout');assert.equal(app.listenerCount,0,'Unmount removes the visibility listener');
 app.advance(10000);for(const callback of cancelled)callback();
 assert.equal(app.opened,0,'Even an already queued timeout cannot navigate after unmount');assert.equal(app.closed,0);assert.equal(app.lateUpdates,0,'Unmounted state is never updated');
}
{
 let replacementOpened=0;const app=harness();app.advance(2000);
 app.update({onOpen:()=>replacementOpened++});app.advance(3000);
 assert.equal(app.opened,0);assert.equal(replacementOpened,1,'A rerender uses the latest navigation callback without restarting the countdown');app.dispose();
}
{
 const app=harness();app.advance(4000);
 app.update({completion:{...completion,key:'conversation-1:plan-2:product-2',planId:'plan-2',title:'A second useful draft',href:'/build/product-2?area=content'}});
 assert.match(app.text,/A second useful draft/);assert.match(app.text,/Opening your product in 5 seconds/);
 assert.equal(app.pending,1,'A new completion replaces rather than duplicates the timer');app.advance(4999);assert.equal(app.opened,0);app.advance(1);assert.equal(app.opened,1);app.dispose();
}
console.log('Product-ready dialog passed: full five-second single navigation, immediate open, Stay/close/Escape cancellation, unmount cleanup, hidden pause/resume, completion replacement, current callback, draft-specific title/description and initial focus. Dialog primitive keyboard/focus trapping remains covered by the UI library. No external calls or wall-clock waits.');
