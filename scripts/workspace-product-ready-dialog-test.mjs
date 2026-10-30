import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';

const source=readFileSync('app/workspace-product-ready.tsx','utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');
const nodes=value=>Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(value.props.children)]:[];
const text=value=>Array.isArray(value)?value.map(text).join(''):React.isValidElement(value)?text(value.props.children):typeof value==='string'||typeof value==='number'?String(value):'';
const completion={key:'saved-product',conversationId:'conversation',planId:'plan',title:'A useful first lesson',href:'/build/aa041f25-4e7d-4a3f-9b04-e002b635ac7d'};
function harness(output=completion){
 const calls={open:0,close:0,images:0,marketing:0},exports={},scope={React,useRef:initial=>({current:initial}),...Object.fromEntries(['Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'].map(name=>[name,`test-${name}`])),Button:'button',...Object.fromEntries(['ArrowRight','Check','Package','ImageIcon','Sparkles'].map(name=>[name,()=>React.createElement('svg',{'aria-hidden':true})])),setTimeout(){throw new Error('The next step must stay under the creator’s control.');}};
 new Function('exports',...Object.keys(scope),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText)(exports,...Object.values(scope));
 const tree=exports.WorkspaceProductReady({completion:output,onOpen:()=>calls.open++,onClose:()=>calls.close++,onImages:()=>calls.images++,onMarketing:()=>calls.marketing++});
 const find=type=>nodes(tree).find(node=>node.type===type),button=label=>nodes(tree).find(node=>node.type==='button'&&text(node).startsWith(label));
 return{tree,calls,find,button,click:label=>{const control=button(label);assert.ok(control,label+' exists');control.props.onClick();}};
}
{
 const app=harness();assert.equal(app.find('test-Dialog').props.open,true);assert.match(text(app.find('test-DialogTitle')),/product draft is ready/i);assert.match(text(app.find('test-DialogDescription')),/private product.*Review.*first customer/i);assert.ok(text(app.tree).includes(completion.title));assert.deepEqual(app.calls,{open:0,close:0,images:0,marketing:0},'Nothing navigates or generates merely because a product completed');
 const content=app.find('test-DialogContent');let focused=0,prevented=0;app.button('Open product').props.ref.current={focus(){focused++;}};content.props.onOpenAutoFocus({preventDefault(){prevented++;}});assert.equal(focused,1);content.props.onCloseAutoFocus({preventDefault(){prevented++;}});assert.equal(prevented,2);
 assert.match(text(app.tree),/Every AI step asks for your approval/);assert.notEqual(content.props.showCloseButton,false,'The standard close control remains available');
}
for(const [label,key] of [['Open product','open'],['Stay in chat','close'],['Make a marketing plan','marketing'],['Create product images','images']]){
 const app=harness();app.click(label);assert.equal(app.calls[key],1);app.click(label);app.find('test-Dialog').props.onOpenChange(false);assert.equal(Object.values(app.calls).reduce((a,b)=>a+b,0),1,'One choice cannot navigate or create twice');
}
{
 const app=harness();app.find('test-Dialog').props.onOpenChange(false);assert.equal(app.calls.close,1);app.click('Open product');assert.equal(app.calls.open,0,'Dismissal keeps the creator in chat');
}
{
 const downloadHref='/api/builder/aa041f25-4e7d-4a3f-9b04-e002b635ac7d/export?format=pdf';const app=harness({...completion,delivery:'download',exportFormat:'pdf',downloadHref});const anchor=nodes(app.tree).find(node=>node.type==='a'&&node.props.href===downloadHref);assert.ok(anchor,'Downloadable products expose the real file export');assert.equal(anchor.props.download,true);assert.match(text(anchor),/Download PDF/);assert.match(text(app.find('test-DialogDescription')),/downloadable product/);assert.equal(Object.values(app.calls).reduce((a,b)=>a+b,0),0,'A file is only downloaded when the creator chooses it');
}
console.log('Product-ready dialog passed: explicit product/marketing/image choices, no timed or implicit AI action, single-choice guards, cancellation, accessible purpose and focus. No external calls.');
