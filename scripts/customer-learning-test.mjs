import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

// Exercise the shipped helpers and React callbacks. Storage and media are local
// fixtures: no API, provider, authenticated customer, email or database is used.
const compile=path=>ts.transpileModule(readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const presentation=await import('data:text/javascript;base64,'+Buffer.from(compile('app/customer/presentation.ts')).toString('base64'));
const {buyerPresentation,buyerFileSize,buyerFileType}=presentation;
const types=[
 ['book','Book','document','Chapter'],['guide','Guide','document','Section'],['playbook','Playbook','document','Step'],
 ['mini-course','Mini course','course','Lesson'],['video-course','Video course','course','Lesson'],['template-kit','Template kit','templates','Template'],
 ['challenge','Challenge','challenge','Day'],['consulting','Consulting / Mentorship','service','Resource'],['coaching','Coaching session','service','Resource'],
 ['community','Community','community','Resource'],['custom','Custom product','document','Section'],
];
for(const [type,format,family,unit] of types){
 const result=buyerPresentation({format,builderType:type});
 assert.equal(result.type,type,`${type} has its own presentation`);
 assert.equal(result.family,family,`${type} maps to the correct delivery layout`);
 assert.equal(result.unit,unit);
 assert.ok(result.reading&&result.intro&&result.label,'Every type supplies real presentation labels');
 assert.equal(buyerPresentation({format}).family,family,`Legacy ${format} remains supported`);
}
assert.equal(buyerPresentation({format:'Book / Ebook'}).type,'book');
assert.equal(buyerPresentation({format:'Custom product',builderType:'custom',deliveryFamily:'course'}).unit,'Lesson');
assert.equal(buyerPresentation({format:'Custom product',builderType:'custom',deliveryFamily:'service'}).reading,'Choose a time');
assert.equal(buyerPresentation({format:'Custom product',builderType:'custom',deliveryFamily:'community'}).reading,'Join your community');
assert.equal(buyerPresentation({format:'Custom product',builderType:'custom',deliveryFamily:'templates'}).reading,'Get your files');
assert.equal(buyerPresentation({format:'Coaching session',builderType:'custom',deliveryFamily:'document',service:true}).family,'document','Purchased explicit family wins over format and legacy service hints');
for(const family of ['document','course','templates','challenge','service','community','custom'])assert.equal(buyerPresentation({format:'Book',builderType:'custom',deliveryFamily:family}).family,family,'Every supported explicit purchased family is preserved');
assert.equal(buyerPresentation({format:'Unknown legacy format',deliveryFamily:'not-a-family'}).family,'document','Unknown metadata cannot invent a delivery family');
assert.equal(buyerFileSize(1200),'2 KB');assert.equal(buyerFileSize(1048576),'1.0 MB');assert.equal(buyerFileSize(0),'');assert.equal(buyerFileSize(-1),'');
assert.equal(buyerFileType('weekly.plan.csv'),'CSV');assert.equal(buyerFileType('file.unknownextension'),'FILE');

function nodes(value){return Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(value.props.children)]:[];}
function text(value){return Array.isArray(value)?value.map(text).join(' '):React.isValidElement(value)?text(value.props.children):value==null||typeof value==='boolean'?'':String(value);}
const readable=value=>text(value).replace(/\s+/g,' ').trim();
const sameDeps=(before,after)=>before&&after&&before.length===after.length&&before.every((value,index)=>Object.is(value,after[index]));
const code=compile('app/customer/learning-content.tsx');
async function harness(props,{saved={},readFailure=false,writeFailure=false}={}){
 const hooks=[],effects=[],reads=[],writes=[],focusCalls=[],storage=new Map(Object.entries(saved));
 let cursor=0,dirty=true,tree,networkCalls=0;
 const useState=initial=>{const index=cursor++;if(!hooks[index])hooks[index]={value:typeof initial==='function'?initial():initial};return[hooks[index].value,next=>{const value=typeof next==='function'?next(hooks[index].value):next;if(!Object.is(value,hooks[index].value)){hooks[index].value=value;dirty=true;}}];};
 const useRef=initial=>{const index=cursor++;return hooks[index]||=( {current:initial});};
 const useEffect=(callback,deps)=>{const index=cursor++,old=hooks[index];if(!old||!sameDeps(old.deps,deps)){hooks[index]={deps,cleanup:old?.cleanup};effects.push(()=>{hooks[index].cleanup?.();hooks[index].cleanup=callback();});}};
 const localStorage={getItem(key){reads.push(key);if(readFailure)throw new Error('Storage blocked');return storage.get(key)??null;},setItem(key,value){if(writeFailure)throw new Error('Storage full');writes.push({key,value:JSON.parse(value)});storage.set(key,value);}};
 const iconNames=['ArrowLeft','ArrowRight','Check','CheckCircle2','Play'];
 const dependencies={React,useState,useRef,useEffect,localStorage,fetch(){networkCalls++;throw new Error('Learning progress must not make network requests');},...Object.fromEntries(iconNames.map(name=>[name,()=>React.createElement('svg',{'data-test-icon':name,'aria-hidden':true})]))};
 const key=`buyerLearning${randomUUID().replaceAll('-','')}`;globalThis[key]=dependencies;
 let CustomerLearning;try{({CustomerLearning}=await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n${code}`).toString('base64')));}finally{delete globalThis[key];}
 function render(){for(let turn=0;dirty&&turn<30;turn++){dirty=false;cursor=0;tree=CustomerLearning(props);for(const node of nodes(tree))if(node.type==='h4'&&node.props.ref)node.props.ref.current={focus:options=>focusCalls.push({title:text(node),options})};for(const effect of effects.splice(0))effect();}assert.equal(dirty,false,'Learning effects settle without render loops');}
 render();
 return {
  reads,writes,storage,focusCalls,get tree(){return tree;},get text(){return readable(tree);},get networkCalls(){return networkCalls;},
  find(type){return nodes(tree).filter(node=>node.type===type);},
  button(label){const node=nodes(tree).find(node=>node.type==='button'&&(node.props['aria-label']===label||readable(node)===label));assert.ok(node,`Button exists: ${label}`);return node;},
  click(label){const node=this.button(label);assert.ok(!node.props.disabled,`Button enabled: ${label}`);node.props.onClick();render();},
  choose(index){const select=this.find('select')[0];assert.ok(select.props.children.some(option=>option.props.value===index),'Only purchased unit indices are selectable');select.props.onChange({target:{value:String(index)}});render();},
  dispose(){for(const hook of hooks)hook?.cleanup?.();},
 };
}
const sections=[
 {id:'lesson-1',title:'Start with your own promise',body:'Private first lesson content.',videoId:'purchased-video-1'},
 {id:'lesson-2',title:'Make the next action practical',body:'Only the purchased second lesson.'},
 {id:'lesson-3',title:'Reflect and continue',body:'The final purchased lesson.',videoId:'purchased-video-3'},
];

// Navigation reveals only the actual selected purchased unit, uses the private
// media route, and never marks a lesson complete merely because it was opened.
{
 const app=await harness({orderId:'paid-order-a',sections});
 assert.match(app.text,/0 of 3 lessons marked complete/);assert.match(app.text,/Private first lesson content/);assert.doesNotMatch(app.text,/Only the purchased second lesson/);
 assert.deepEqual(app.reads,['fivegen-progress:paid-order-a']);assert.equal(app.writes.length,0,'Mount does not overwrite existing device progress');
 assert.equal(app.button('Previous lesson').props.disabled,true);assert.equal(app.button('Next lesson').props.disabled,false);
 let video=app.find('video')[0];assert.equal(video.props.src,'/api/commerce/customer/paid-order-a/video/purchased-video-1');assert.equal(video.props.controls,true);assert.equal(video.props.playsInline,true);assert.equal(video.props.preload,'metadata');
 assert.equal(video.props.onEnded,undefined,'Playback never implies completed coursework');
 app.click('Next lesson');assert.match(app.text,/Only the purchased second lesson/);assert.doesNotMatch(app.text,/Private first lesson content/);assert.equal(app.find('video').length,0,'A text lesson cannot borrow another unit’s recording');
 assert.deepEqual(app.writes.at(-1),{key:'fivegen-progress:paid-order-a',value:{active:'lesson-2',completed:[]}});
 assert.deepEqual(app.focusCalls.at(-1),{title:'Make the next action practical',options:{preventScroll:true}},'Keyboard focus follows selected lesson heading without unexpected scroll');
 app.click('Mark lesson complete');assert.match(app.text,/1 of 3 lessons marked complete/);assert.equal(app.find('progress')[0].props.value,1);assert.deepEqual(app.writes.at(-1).value.completed,['lesson-2']);
 assert.equal(app.button('Lesson 2: Make the next action practical, marked complete').props['aria-pressed'],true);
 app.click('Mark incomplete');assert.match(app.text,/0 of 3 lessons marked complete/);assert.deepEqual(app.writes.at(-1).value.completed,[]);
 app.click('Next lesson');assert.equal(app.button('Next lesson').props.disabled,true);assert.equal(app.find('video')[0].props.src,'/api/commerce/customer/paid-order-a/video/purchased-video-3');
 app.click('Previous lesson');app.choose(0);assert.equal(app.button('Previous lesson').props.disabled,true);assert.equal(app.find('select')[0].props.value,0);
 assert.match(app.text,/saved on this device/);assert.equal(app.networkCalls,0);
 const html=renderToStaticMarkup(app.tree);assert.match(html,/aria-label="Your classroom"/);assert.match(html,/aria-label="Course lessons"/);assert.match(html,/aria-label="Lesson completion"/);assert.doesNotMatch(html,/certificate|server-saved|synchronized/i);
 app.dispose();
}

// Reopening the same order restores its valid device-local state; another
// purchase (including the same sections) never inherits those answers/progress.
{
 const saved={'fivegen-progress:paid-order-a':JSON.stringify({active:'lesson-3',completed:['lesson-1','removed-lesson',42,'lesson-3']})};
 const app=await harness({orderId:'paid-order-a',sections},{saved});assert.match(app.text,/2 of 3 lessons marked complete/);assert.equal(app.find('select')[0].props.value,2);assert.match(app.text,/The final purchased lesson/);assert.equal(app.focusCalls.length,0,'Restoring progress does not steal focus on page load');
 app.click('Mark incomplete');assert.deepEqual(app.writes.at(-1).value,{active:'lesson-3',completed:['lesson-1']});
 const another=await harness({orderId:'paid-order-b',sections},{saved:Object.fromEntries(app.storage)});assert.match(another.text,/0 of 3 lessons marked complete/);assert.equal(another.find('select')[0].props.value,0);assert.deepEqual(another.reads,['fivegen-progress:paid-order-b']);
 another.click('Mark lesson complete');assert.equal(another.writes.at(-1).key,'fivegen-progress:paid-order-b');assert.deepEqual(JSON.parse(another.storage.get('fivegen-progress:paid-order-a')),{active:'lesson-3',completed:['lesson-1']},'A different purchase cannot overwrite original progress');
 app.dispose();another.dispose();
}

// Invalid, stale or blocked storage must not make paid content unusable.
for(const stored of ['{broken json','null',JSON.stringify({active:'not-in-purchase',completed:[false,'not-in-purchase']})]){
 const app=await harness({orderId:'malformed-order',sections},{saved:{'fivegen-progress:malformed-order':stored}});assert.match(app.text,/Private first lesson content/);assert.match(app.text,/0 of 3 lessons marked complete/);app.click('Next lesson');assert.match(app.text,/Only the purchased second lesson/);assert.equal(app.networkCalls,0);app.dispose();
}
{
 const app=await harness({orderId:'storage-blocked',sections},{readFailure:true,writeFailure:true});assert.match(app.text,/Private first lesson content/);app.click('Next lesson');app.click('Mark lesson complete');assert.match(app.text,/1 of 3 lessons marked complete/);assert.match(app.text,/Progress cannot be saved in this browser/);assert.match(app.text,/Your content is still available/);assert.match(app.text,/Only the purchased second lesson/);assert.equal(app.networkCalls,0);app.dispose();
}
{
 const app=await harness({orderId:'duplicate-progress',sections},{saved:{'fivegen-progress:duplicate-progress':JSON.stringify({active:'lesson-1',completed:['lesson-1','lesson-1','lesson-2','lesson-2','lesson-3','lesson-3']})}});assert.equal(app.find('progress')[0].props.value,3,'Duplicate saved IDs cannot exaggerate completed coursework');assert.match(app.text,/3 of 3 lessons marked complete/);app.dispose();
}
{
 const original=[{title:'Original first section',body:'Purchased legacy notes.'},{title:'Original second section',body:'Purchased next notes.'}];
 const app=await harness({orderId:'legacy-order',sections:original},{saved:{'fivegen-progress:legacy-order':JSON.stringify({active:'section-1',completed:['section-0']})}});assert.equal(app.find('select')[0].props.value,1);assert.match(app.text,/Purchased next notes/);app.click('Mark lesson complete');assert.deepEqual(app.writes.at(-1).value,{active:'section-1',completed:['section-0','section-1']},'Legacy sections without IDs retain deterministic per-order progress keys');app.dispose();
}

// Challenges use real purchased activities, day vocabulary and the same local
// controls. Empty deliveries cannot manufacture placeholder days or network IO.
{
 const days=[{id:'day-one',title:'Choose a small step',body:'Write one action you can take today.'},{id:'day-two',title:'Try and reflect',body:'Reflect on what you tried yesterday.'}];
 const app=await harness({orderId:'challenge-order',sections:days,challenge:true});assert.match(app.text,/Your challenge/);assert.match(app.text,/0 of 2 days marked complete/);assert.equal(app.find('video').length,0);app.click('Mark day complete');assert.match(app.text,/1 of 2 days marked complete/);app.click('Next day');assert.match(app.text,/Reflect on what you tried yesterday/);assert.equal(app.button('Next day').props.disabled,true);assert.equal(app.button('Previous day').props.disabled,false);assert.equal(app.find('nav')[0].props['aria-label'],'Challenge days');assert.deepEqual(app.writes.at(-1).value,{active:'day-two',completed:['day-one']});app.dispose();
 const empty=await harness({orderId:'empty-order',sections:[]});assert.equal(empty.tree,null);assert.equal(empty.writes.length,0);assert.equal(empty.networkCalls,0);empty.dispose();
}
console.log('Buyer learning passed: all 11 types and purchased custom families, private media navigation, exact-order device progress, reversible completion, stale/corrupt/blocked storage, keyboard focus, day controls and no fabricated content or network fulfillment.');
