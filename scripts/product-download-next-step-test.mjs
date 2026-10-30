import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';
import ts from 'typescript';

const source=readFileSync('app/product-download-next-step.tsx','utf8').replace(/^import[^\n]*\n/gm,''),scope={React,...Object.fromEntries(['ArrowRight','Download','Eye','FileText'].map(name=>[name,icons[name]]))},loaded={};
new Function('exports',...Object.keys(scope),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText)(loaded,...Object.values(scope));
function nodes(tree,predicate){const result=[];function visit(value){if(Array.isArray(value))return value.forEach(visit);if(!React.isValidElement(value))return;if(predicate(value))result.push(value);visit(value.props.children);}visit(tree);return result;}
const text=value=>Array.isArray(value)?value.map(text).join(''):React.isValidElement(value)?text(value.props.children):typeof value==='string'||typeof value==='number'?String(value):'';
const events=[],props={title:'A complete eight-module playbook',format:'pdf',busy:false,hasContent:true,overview:true,onDownload:async format=>events.push(['download',format]),onPreview:()=>events.push(['preview']),onEdit:()=>events.push(['edit']),onSell:()=>events.push(['sell'])};
for(const format of ['pdf','epub','html','markdown','zip']){
 const tree=loaded.ProductDownloadNextStep({...props,format}),html=renderToStaticMarkup(tree),label=format==='markdown'?'Markdown':format.toUpperCase();
 assert.match(html,/Your download is ready/);assert.match(html,/There is nothing to fill out here/);assert.equal(nodes(tree,node=>['input','textarea','form','select'].includes(node.type)).length,0,'Private download requires no review notes or commercial setup fields');
 const selling=nodes(tree,node=>node.type==='details')[0];assert.equal(selling.props.open,undefined,'Selling setup is optional and collapsed');
 const download=nodes(tree,node=>node.type==='button'&&text(node)===`Download ${label}`)[0];assert.ok(download&&!download.props.disabled);await download.props.onClick();assert.deepEqual(events.pop(),['download',format]);
 assert.equal(events.length,0,'Rendering and downloading never approve or publish content');
}
const tree=loaded.ProductDownloadNextStep(props);nodes(tree,node=>node.type==='button'&&text(node)==='Preview product')[0].props.onClick();assert.deepEqual(events.pop(),['preview']);nodes(tree,node=>node.type==='button'&&text(node).includes('Set up selling'))[0].props.onClick();assert.deepEqual(events.pop(),['sell'],'A separate deliberate choice opens selling setup');
const busy=loaded.ProductDownloadNextStep({...props,busy:true});assert.ok(nodes(busy,node=>node.type==='button').every(button=>button.props.disabled));
const original=loaded.ProductDownloadNextStep({...props,fileLabel:'Original PDF',downloadLabel:'Download original PDF'});assert.match(text(original),/Original PDF/);assert.ok(nodes(original,node=>node.type==='button'&&text(node)==='Download original PDF').length);
const empty=loaded.ProductDownloadNextStep({...props,hasContent:false});assert.match(text(empty),/Add your product content/);assert.equal(nodes(empty,node=>node.type==='button'&&text(node).startsWith('Download ')).length,0);nodes(empty,node=>node.type==='button'&&text(node).startsWith('Add content'))[0].props.onClick();assert.deepEqual(events.pop(),['edit']);

// Execute the shipped export handler: it saves the owned draft and exports it
// without any publication, editorial approval, selling or payment operation.
const builderSource=readFileSync('app/product-builder.tsx','utf8'),ast=ts.createSourceFile('product-builder.tsx',builderSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler;
function find(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='downloadProduct')handler=node;ts.forEachChild(node,find);}find(ast);assert.ok(handler);
let savedWorkspace={product:{id:'owned-product'},draft:{studio:{},sections:[{body:'A usable short section.'}],files:[],uploadIds:[]},uploads:[]};
const calls=[],bindings={run:async(label,action)=>action(),saveDraft:async()=>{calls.push('save');return savedWorkspace;},activePanel:'review',location:{assign:path=>calls.push(path)}},code=ts.transpileModule(handler.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const downloadProduct=new Function(...Object.keys(bindings),code+';return downloadProduct;')(...Object.values(bindings));await downloadProduct('pdf');assert.deepEqual(calls,['save','/api/builder/owned-product/export?format=pdf']);
savedWorkspace={product:{id:'owned-product'},draft:{studio:{},sections:[],files:[],uploadIds:['original-pdf']},uploads:[{id:'original-pdf',status:'completed',mime:'application/pdf'}]};calls.length=0;await downloadProduct('pdf');assert.deepEqual(calls,['save','/api/uploads/original-pdf?download=1'],'An original PDF is downloaded intact, never replaced by a cover-only export');
savedWorkspace={...savedWorkspace,draft:{...savedWorkspace.draft,uploadIds:['original-pdf','original-csv']},uploads:[...savedWorkspace.uploads,{id:'original-csv',status:'completed',mime:'text/csv'}]};calls.length=0;await downloadProduct('pdf');assert.deepEqual(calls,['save','/api/builder/owned-product/export?format=zip'],'Multiple finished originals are packaged intact');
console.log('Download next step passed: preview/download without forms or publication, explicit optional selling, all supported formats, disabled/empty states and actual owned export handler. No network or AI calls.');
