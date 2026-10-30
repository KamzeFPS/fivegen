import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import ts from 'typescript';
import * as icons from 'lucide-react';

const previous={window:globalThis.window,localStorage:globalThis.localStorage},storage=new Map(),listeners=new Map();
let mobile=false,productContext=false;
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))};
globalThis.window={matchMedia:()=>({get matches(){return mobile;}}),addEventListener:(name,callback)=>{const set=listeners.get(name)||new Set();set.add(callback);listeners.set(name,set);},removeEventListener:(name,callback)=>listeners.get(name)?.delete(callback)};
const source=readFileSync('app/workspace-navigation.tsx','utf8'),iconNames=/import \{([^}]+)\} from 'lucide-react'/.exec(source)[1].split(','),menuNames=['DropdownMenu','DropdownMenuContent','DropdownMenuItem','DropdownMenuLabel','DropdownMenuSeparator','DropdownMenuTrigger','DropdownMenuSub','DropdownMenuSubContent','DropdownMenuSubTrigger','Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'];
const components=Object.fromEntries(menuNames.map(name=>[name,`test-${name}`])),WorkspaceSearch=()=>null;
function nodes(tree,predicate=()=>true){const found=[];function visit(node){if(Array.isArray(node))node.forEach(visit);else if(node&&typeof node==='object'){if(predicate(node))found.push(node);visit(node.props?.children);}}visit(tree);return found;}
function text(node){return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):'';}
function one(tree,predicate){const matches=nodes(tree,predicate);assert.equal(matches.length,1);return matches[0];}
function harness(initial={}){
  const slots=[],effects=[],calls={views:[],visits:[],products:[],chats:[],signout:0};let cursor=0,tree,blocked=false;
  const props={user:{name:'A Creator',email:'creator@example.test'},view:'create',label:'Home',admin:false,products:[{id:'owned-product',title:'A real saved draft',format:'Ebook'}],history:[{id:'owned-chat',title:'A real saved conversation'}],creditsLabel:'42 credits',onCreate(){},onView:value=>{if(!blocked)calls.views.push(value);},onProduct:value=>{if(!blocked)calls.products.push(value);},onConversation:value=>{if(!blocked)calls.chats.push(value);},onVisit:value=>{if(!blocked)calls.visits.push(value);},onSignOut:()=>{if(!blocked)calls.signout++;},...initial};
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  const useState=initial=>{const index=cursor++;slots[index]||={value:typeof initial==='function'?initial():initial};return[slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];};
  const useRef=initial=>{const index=cursor++;slots[index]||={value:{current:initial}};return slots[index].value;};
  const useEffect=(callback,dependencies)=>{const index=cursor++,old=slots[index];if(!old||!same(old.dependencies,dependencies)){slots[index]={dependencies,cleanup:old?.cleanup};effects.push(()=>{slots[index].cleanup?.();slots[index].cleanup=callback();});}};
  const scope={React,...components,...Object.fromEntries(iconNames.map(name=>[name.trim(),icons[name.trim()]])),useState,useRef,useEffect,useId:()=>`navigation-${cursor++}`,WorkspaceSearch,Brand:()=>null,AppearanceMenuItems:()=>null},exports={};
  new Function('exports',...Object.keys(scope),ts.transpileModule(source.replace(/^import[\s\S]*?;\r?\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText)(exports,...Object.values(scope));
  function render(){cursor=0;tree=exports.WorkspaceNavigation(props);const header=one(tree,node=>node.type==='header');header.props.ref.current={nextElementSibling:{classList:{contains:name=>name==='has-product'&&productContext}}};return tree;}
  async function settle(){for(let index=0;index<5;index++){while(effects.length)effects.shift()();await new Promise(done=>setImmediate(done));render();}return tree;}
  return{calls,props,render,settle,get tree(){return tree;},block(value){blocked=value;},dispose(){slots.forEach(slot=>slot.cleanup?.());}};
}
const header=app=>one(app.tree,node=>node.type==='header');
const toggle=app=>one(app.tree,node=>node.type==='button'&&node.props.className==='workspace-menu-trigger');
const drawer=app=>one(app.tree,node=>node.props?.className==='workspace-navigation-drawer');
const drawerDialog=app=>one(app.tree,node=>node.type===components.Dialog&&nodes(node,child=>child.props?.className==='workspace-navigation-drawer').length===1);
try{
  const home=harness();home.render();await home.settle();assert.equal(toggle(home).props['aria-label'],'Hide navigation');assert.equal(toggle(home).props['aria-expanded'],true);assert.equal(toggle(home).props['aria-controls'],one(home.tree,node=>node.type==='aside').props.id);
  const nav=one(one(home.tree,node=>node.type==='aside'),node=>node.type==='nav');assert.deepEqual(nodes(nav,node=>node.type==='button').map(node=>text(node).replace(/1$/,'')),['Home','My products','Marketing','Design','Calendar','Customers','Library','Domains']);assert.equal(nodes(home.tree,node=>node.type==='button'&&/Create product|New product/.test(text(node))).length,0,'Creation is not duplicated in the sidebar');
  toggle(home).props.onClick();home.render();assert.equal(header(home).props['data-navigation-collapsed'],'true');assert.equal(toggle(home).props['aria-label'],'Show navigation');assert.equal(storage.get('fivegen.workspace-navigation-collapsed'),'true');home.dispose();
  const hub=harness({view:'marketing',label:'Marketing'});hub.render();await hub.settle();assert.equal(header(hub).props['data-navigation-collapsed'],'true','A fresh tool-hub mount restores the hidden sidebar preference');toggle(hub).props.onClick();hub.render();assert.equal(header(hub).props['data-navigation-collapsed'],undefined);assert.equal(toggle(hub).props['aria-expanded'],true);assert.equal(storage.get('fivegen.workspace-navigation-collapsed'),'false');
  const homeButton=nodes(one(hub.tree,node=>node.type==='aside'),node=>node.type==='button'&&text(node)==='Home')[0];homeButton.props.onClick();assert.equal(hub.calls.visits.at(-1),'/?view=create','Home opens central creation, not the previous chat or dashboard');
  const dashboard=nodes(hub.tree,node=>node.type===components.DropdownMenuItem&&text(node)==='Results & dashboard')[0];assert.ok(dashboard);dashboard.props.onSelect();assert.equal(hub.calls.views.at(-1),'overview','The dashboard remains available from account settings');hub.dispose();

  mobile=true;const phone=harness();phone.render();await phone.settle();toggle(phone).props.onClick();phone.render();assert.equal(drawerDialog(phone).props.open,true);assert.equal(toggle(phone).props['aria-expanded'],true);assert.equal(storage.get('fivegen.workspace-navigation-collapsed'),'false','Opening mobile navigation does not alter the desktop preference');
  nodes(drawer(phone),node=>node.type==='button'&&text(node)==='Marketing')[0].props.onClick();phone.render();assert.equal(drawerDialog(phone).props.open,false);assert.deepEqual(phone.calls.views,[],'Drawer navigation waits for its focus trap to close');let prevented=false;phone.block(true);drawer(phone).props.onCloseAutoFocus({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.deepEqual(phone.calls.views,[],'The parent unsaved-work guard still decides whether to navigate');
  phone.block(false);toggle(phone).props.onClick();phone.render();nodes(drawer(phone),node=>node.type==='button'&&text(node)==='Calendar')[0].props.onClick();phone.render();drawer(phone).props.onCloseAutoFocus({preventDefault(){}});assert.deepEqual(phone.calls.views,['calendar']);phone.dispose();

  mobile=false;productContext=true;const product=harness({view:'library',label:'A real saved draft'});product.render();await product.settle();toggle(product).props.onClick();product.render();assert.equal(drawerDialog(product).props.open,true,'Inside a product, the persistent toggle opens global navigation in a drawer');assert.equal(header(product).props['data-navigation-collapsed'],undefined,'Product navigation does not collapse or change native product context');assert.equal(storage.get('fivegen.workspace-navigation-collapsed'),'false');product.dispose();
  mobile=false;productContext=false;const sameName=harness({view:'marketing',label:'Marketing',productContext:false});sameName.render();await sameName.settle();sameName.props.productContext=true;sameName.render();await sameName.settle();toggle(sameName).props.onClick();sameName.render();assert.equal(drawerDialog(sameName).props.open,true,'A product with the same name as a hub still opens the drawer when context changes');sameName.dispose();
  console.log('Workspace navigation passed: exact destinations, no sidebar creation button, real recent work, collapse/expand persistence across Home/tool hubs, central Home routing, retained dashboard, mobile close-before-guard navigation and product-context drawer access. No network.');
}finally{Object.assign(globalThis,previous);}
