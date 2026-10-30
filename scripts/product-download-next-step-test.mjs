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

// Execute the shipped download handler and its real run() error boundary.
// Generated documents are fetched once and offered as a download while the
// current builder stays open. Original files and ZIPs remain streamed.
const builderSource=readFileSync('app/product-builder.tsx','utf8'),ast=ts.createSourceFile('product-builder.tsx',builderSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler,runHandler;
function find(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='downloadProduct')handler=node;if(ts.isFunctionDeclaration(node)&&node.name?.text==='run')runHandler=node;ts.forEachChild(node,find);}find(ast);assert.ok(handler);assert.ok(runHandler);
let savedWorkspace={product:{id:'owned-product',slug:'useful-guide'},draft:{studio:{},sections:[{body:'A usable short section.'}],files:[],uploadIds:[]},uploads:[]},responseFactory;
const calls=[],requests=[],downloads=[],files=[],revoked=[],timers=[],errors=[],busyLabels=[],busyRef={current:false};
const bindings={
 run:undefined,
 busyRef,setBusy:label=>busyLabels.push(label),setError:message=>errors.push(message),
 saveDraft:async()=>{calls.push('save');return savedWorkspace;},activePanel:'review',
 location:{assign:path=>calls.push(['navigate',path])},
 fetch:async(url,options)=>{requests.push({url,options});return responseFactory();},
 URL:{createObjectURL:file=>{files.push(file);return 'blob:synthetic-download-'+files.length;},revokeObjectURL:url=>revoked.push(url)},
 document:{body:{appendChild:link=>calls.push(['append',link.href])},createElement:tag=>{assert.equal(tag,'a');return {href:'',download:'',click(){downloads.push({href:this.href,filename:this.download});},remove(){calls.push('remove');}};}},
 setTimeout:(callback,delay)=>{timers.push({callback,delay});return timers.length;},
};
delete bindings.run;
const code=ts.transpileModule(runHandler.getText(ast)+'\n'+handler.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,downloadProduct=new Function(...Object.keys(bindings),code+';return downloadProduct;')(...Object.values(bindings));
const reset=()=>{for(const values of [calls,requests,downloads,files,revoked,timers,errors,busyLabels])values.length=0;busyRef.current=false;};
const payload=new TextEncoder().encode('%PDF-1.7\nSYNTHETIC COMPLETE PRODUCT');
for(const [format,mime,extension] of [['pdf','application/pdf','pdf'],['epub','application/epub+zip','epub'],['html','text/html','html'],['markdown','text/markdown','md']]){
 reset();const before=JSON.stringify(savedWorkspace);responseFactory=()=>new Response(payload,{headers:{'Content-Type':mime,'Content-Disposition':'attachment; filename="server-file.'+extension+'"'}});
 await downloadProduct(format);assert.equal(requests.length,1,'Each generated document makes one GET without a second fetch or HEAD');assert.equal(requests[0].url,'/api/builder/owned-product/export?format='+format);assert.equal(requests[0].options.method,undefined);assert.equal(requests[0].options.credentials,'same-origin');assert.equal(requests[0].options.cache,'no-store');assert.ok(requests[0].options.signal instanceof AbortSignal,'Export preparation has a bounded timeout');
 assert.equal(calls[0],'save');assert.equal(calls.some(item=>Array.isArray(item)&&item[0]==='navigate'),false,'Document download leaves the builder page open');assert.deepEqual(downloads,[{href:'blob:synthetic-download-1',filename:'server-file.'+extension}]);assert.equal(files.length,1);assert.equal(files[0].type,mime);assert.deepEqual(new Uint8Array(await files[0].arrayBuffer()),payload,'The native download receives the actual returned bytes');
 assert.equal(revoked.length,0,'Do not revoke the blob before the browser can start saving it');assert.equal(timers.length,1);assert.ok(timers[0].delay>0&&timers[0].delay<=60000);timers[0].callback();assert.deepEqual(revoked,['blob:synthetic-download-1']);assert.equal(JSON.stringify(savedWorkspace),before,'Export does not mutate content, approval, price or selling');assert.equal(busyRef.current,false);assert.equal(errors.at(-1),'');
}
reset();responseFactory=()=>new Response(payload,{headers:{'Content-Type':'application/pdf','Content-Disposition':"attachment; filename*=UTF-8''a%20useful%20guide.pdf"}});await downloadProduct('pdf');assert.equal(downloads[0].filename,'a useful guide.pdf','Encoded response filenames are decoded safely');
reset();responseFactory=()=>new Response(payload,{headers:{'Content-Type':'text/markdown'}});await downloadProduct('markdown');assert.equal(downloads[0].filename,'useful-guide.md','Missing filename uses the owned product slug and correct file extension');
reset();responseFactory=()=>new Response(payload,{headers:{'Content-Type':'application/pdf','Content-Disposition':"attachment; filename*=UTF-8''..%2F..%2Fguide.pdf"}});await downloadProduct('pdf');assert.equal(downloads[0].filename.includes('/'),false,'A returned filename cannot introduce a path');
reset();const serverError='This PDF could not be rendered. Your saved product is unchanged.';responseFactory=()=>Response.json({error:serverError},{status:500});const beforeFailure=JSON.stringify(savedWorkspace);await downloadProduct('pdf');assert.equal(requests.length,1);assert.deepEqual(calls,['save']);assert.equal(errors.at(-1),serverError,'The existing run() boundary displays the server message inline');assert.equal(downloads.length,0);assert.equal(files.length,0);assert.equal(timers.length,0);assert.equal(JSON.stringify(savedWorkspace),beforeFailure,'A failed PDF leaves all product data in place');assert.equal(busyRef.current,false);
reset();responseFactory=()=>Response.json({error:serverError});await downloadProduct('pdf');assert.equal(errors.at(-1),serverError,'A JSON error cannot be offered as a successful PDF even if an upstream response used status200');assert.equal(downloads.length,0);assert.deepEqual(calls,['save']);
reset();responseFactory=()=>new Response('Unavailable',{status:503,headers:{'Content-Type':'text/plain'}});await downloadProduct('pdf');assert.match(errors.at(-1),/download could not be prepared/);assert.deepEqual(calls,['save']);
reset();responseFactory=()=>new Response(new Uint8Array(),{headers:{'Content-Type':'application/pdf'}});await downloadProduct('pdf');assert.match(errors.at(-1),/file was empty/);assert.equal(downloads.length,0);assert.deepEqual(calls,['save']);
reset();responseFactory=()=>{throw new Error('The connection was interrupted.');};await downloadProduct('pdf');assert.equal(errors.at(-1),'The connection was interrupted.');assert.deepEqual(calls,['save']);
reset();await downloadProduct('zip');assert.deepEqual(calls,['save',['navigate','/api/builder/owned-product/export?format=zip']]);assert.equal(requests.length,0,'ZIP archives keep their streamed download without buffering');
savedWorkspace={product:{id:'owned-product',slug:'original-product'},draft:{studio:{},sections:[],files:[],uploadIds:['original-pdf']},uploads:[{id:'original-pdf',status:'completed',mime:'application/pdf'}]};reset();await downloadProduct('pdf');assert.deepEqual(calls,['save',['navigate','/api/uploads/original-pdf?download=1']]);assert.equal(requests.length,0,'An original PDF is streamed intact, never replaced or double-fetched');
savedWorkspace={...savedWorkspace,draft:{...savedWorkspace.draft,uploadIds:['original-pdf','original-csv']},uploads:[...savedWorkspace.uploads,{id:'original-csv',status:'completed',mime:'text/csv'}]};reset();await downloadProduct('pdf');assert.deepEqual(calls,['save',['navigate','/api/builder/owned-product/export?format=zip']]);assert.equal(requests.length,0,'Multiple finished originals are packaged and streamed intact');
savedWorkspace={product:{id:'owned-product',slug:'design-product'},draft:{studio:{design:{pages:[]}},sections:[],files:[],uploadIds:[]},uploads:[]};reset();responseFactory=()=>new Response(payload,{headers:{'Content-Type':'application/pdf'}});await downloadProduct('pdf');assert.equal(requests[0].url,'/api/builder/owned-product/design/export?format=pdf');assert.equal(calls.some(item=>Array.isArray(item)&&item[0]==='navigate'),false);
assert.equal(events.length,0);
console.log('Download next step passed: private download without forms/publication, optional selling, one authenticated document fetch, real blob bytes and filenames, inline failure without navigation, and intact streamed originals/ZIP. No external network or AI calls.');
