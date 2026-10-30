import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';

const storage=new Map(),events=new EventTarget();
const browser={localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};
let active;
const scope={React,window:browser,CustomEvent,queueMicrotask,useState(initial){const slot=active.cursor++;if(!(slot in active.slots))active.slots[slot]=initial;const instance=active;return[instance.slots[slot],value=>{instance.slots[slot]=typeof value==='function'?value(instance.slots[slot]):value;}];},useEffect(fn){const slot=active.cursor++;if(!(slot in active.slots)){active.slots[slot]=true;active.effects.push(fn);}}};
const ui={};new Function('exports',...Object.keys(scope),ts.transpileModule(fs.readFileSync('app/image-quality-control.tsx','utf8').replace(/^import[^\n]*\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText)(ui,...Object.values(scope));
function hook(){const instance={cursor:0,slots:[],effects:[],cleanups:[],render(){active=instance;instance.cursor=0;return ui.useImageQuality();},mount(){instance.render();while(instance.effects.length)instance.cleanups.push(instance.effects.shift()());},close(){instance.cleanups.forEach(cleanup=>cleanup?.());}};return instance;}
const children=node=>Array.isArray(node)?node.flatMap(children):React.isValidElement(node)?[node,...children(node.props.children)]:[];
assert.equal(ui.readImageQuality(),'medium');storage.set('fivegen:image-quality','not-a-quality');assert.equal(ui.readImageQuality(),'medium');storage.set('fivegen:image-quality','high');
const home=hook(),editor=hook();home.mount();editor.mount();await new Promise(resolve=>queueMicrotask(resolve));assert.equal(home.render()[0],'high');assert.equal(editor.render()[0],'high','The editor restores the same browser preference as Home');
let control=ui.ImageQualityControl({value:home.render()[0],onChange:home.render()[1]});assert.equal(control.props['aria-label'],'Image quality');children(control).find(node=>node.type==='button'&&node.props.children==='Low').props.onClick();assert.equal(home.render()[0],'low');assert.equal(editor.render()[0],'low','An explicit choice on Home updates the mounted editor without a reload');assert.equal(storage.get('fivegen:image-quality'),'low');
control=ui.ImageQualityControl({value:'low',onChange:home.render()[1],disabled:true});children(control).find(node=>node.type==='button'&&node.props.children==='High').props.onClick();assert.equal(home.render()[0],'low','A busy control cannot change quality even if its handler is invoked');assert.ok(children(control).filter(node=>node.type==='button').every(node=>node.props.disabled));
storage.set('fivegen:image-quality','medium');const event=new Event('storage');Object.defineProperty(event,'key',{value:'fivegen:image-quality'});browser.dispatchEvent(event);assert.equal(editor.render()[0],'medium','A preference from another tab updates the active controls');
const oldStorage=browser.localStorage;browser.localStorage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};assert.equal(ui.readImageQuality(),'medium');home.render()[1]('high');assert.equal(editor.render()[0],'high','Blocked storage still shares an explicit in-memory selection');browser.localStorage=oldStorage;
home.close();editor.close();
console.log('Image quality control passed: real controlled buttons, busy guards, medium default, invalid storage fallback, refresh restoration, cross-surface and cross-tab selection, and blocked storage. No provider calls.');
