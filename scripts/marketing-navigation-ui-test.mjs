import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import * as icons from 'lucide-react';
import {z} from 'zod';

function load(path,bindings){
 const source=readFileSync(path,'utf8').replace(/^import[^\n]*\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 const exports={};new Function('exports',...Object.keys(bindings),code)(exports,...Object.values(bindings));return exports;
}
function handler(path,name,bindings){
 const source=readFileSync(path,'utf8'),file=ts.createSourceFile(path,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);let declaration;
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)declaration=node;ts.forEachChild(node,visit);}visit(file);
 assert.ok(declaration,`${name} exists`);
 const code=ts.transpileModule(declaration.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(bindings),code+`;return ${name};`)(...Object.values(bindings));
}
function text(node){if(Array.isArray(node))return node.map(text).join('');if(React.isValidElement(node))return text(node.props.children);return typeof node==='string'?node:'';}
const {readMarketingPluginIds}=load('lib/marketing-plugins.ts',{z});
const window=new EventTarget(),effects=[],states=[];let hookIndex=0,resolveInitial;
const passthrough=({children})=>children;
const sidebarIcons=Object.fromEntries(['Banknote','BarChart3','BookOpen','Brain','ChevronDown','ChevronRight','Copy','Eye','FileText','FlaskConical','FolderOpen','Globe','Home','ImagePlus','Layers3','LifeBuoy','Loader2','Mail','Megaphone','Palette','Plus','Rocket','Share2','Star','Users'].map(name=>[name,icons[name]]));
const menus=Object.fromEntries(['DropdownMenu','DropdownMenuContent','DropdownMenuItem','DropdownMenuLabel','DropdownMenuSeparator','DropdownMenuSub','DropdownMenuSubContent','DropdownMenuSubTrigger','DropdownMenuTrigger','Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'].map(name=>[name,passthrough]));
const {WorkspaceProductSidebar}=load('app/workspace-product-navigation.tsx',{
 React,...sidebarIcons,...menus,readMarketingPluginIds,window,
 useState(initial){const index=hookIndex++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},
 useEffect(effect){effects.push(effect);},
 fetch:()=>new Promise(resolve=>{resolveInitial=resolve;}),
});
const product={id:'nav-product',title:'Original course',color:'orange'},props={product,products:[product],tab:'dashboard',mode:'creator',onProduct(){},onTab(){},onMode(){},onCustomize(){},onReviews(){}};
function render(){hookIndex=0;effects.length=0;return WorkspaceProductSidebar(props);}
render();const cleanups=effects.map(effect=>effect());
assert.equal(typeof resolveInitial,'function','The real sidebar starts its initial installed-tool lookup');
let installed=[],version=0;
const changePlugin=handler('app/marketing-workspace.tsx','changePlugin',{
 state:{installed:[],updatedAt:0},busy:false,panelDirty:false,product,window,
 settings:async(_id,body)=>({installed:installed=body.enabled?[body.pluginId]:[],updatedAt:++version}),
 plugins:[{id:'vsl',name:'VSL'}],setMutation(){},setError(){},setNotice(){},setState(){},setRemoving(){},
});
await changePlugin('vsl',true);
assert.ok(text(render()).includes('VSL script'),'A successful installation immediately adds its sidebar link while the manager stays on the same tab');
window.dispatchEvent(new CustomEvent('fivegen:marketing-plugins-updated',{detail:{productId:'another-product',installed:[]}}));
assert.ok(text(render()).includes('VSL script'),'Another product’s change cannot alter the selected product’s tools');
resolveInitial({ok:true,json:async()=>({installed:[]})});
await new Promise(resolve=>setImmediate(resolve));
assert.ok(text(render()).includes('VSL script'),'A stale in-flight lookup cannot overwrite a newer successful installation');
await changePlugin('vsl',false);
assert.equal(text(render()).includes('VSL script'),false,'Removing a tool immediately removes the sidebar link without a reload or tab change');
cleanups.forEach(cleanup=>cleanup?.());
window.dispatchEvent(new CustomEvent('fivegen:marketing-plugins-updated',{detail:{productId:product.id,installed:['vsl']}}));
assert.equal(text(render()).includes('VSL script'),false,'Unmounting the selected sidebar removes its event subscription');
console.log('Marketing navigation: actual install/remove handlers update the sidebar immediately, remain product scoped, ignore stale reads, and clean up their subscription.');
