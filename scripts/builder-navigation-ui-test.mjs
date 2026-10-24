import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ArrowUpRight,CheckCircle2,ChevronDown,ClipboardCheck,Info,TriangleAlert} from 'lucide-react';

const source=readFileSync('app/builder-navigation.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {builderNavigationForLocation,builderPublicationStatus,initialBuilderPanel}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const empty={source:'manual',sections:[],files:[],uploadIds:[]};
assert.equal(initialBuilderPanel(empty),'details','A new manual product starts with its brief');
assert.equal(initialBuilderPanel({...empty,source:'ai'}),'details','A new AI product starts with its brief');
assert.equal(initialBuilderPanel({...empty,source:'upload'}),'resources','Choosing existing content opens the upload surface immediately');
for(const content of [{sections:[{title:'A chapter',body:'Existing work'}]}]){
 assert.equal(initialBuilderPanel({...empty,...content}),'content','Opening an existing authored product goes directly to the work');
}
assert.equal(initialBuilderPanel({...empty,files:[{name:'worksheet.md',content:'An editable download'}]}),'resources','Editable downloads open in Files instead of an empty chapter editor');
assert.equal(initialBuilderPanel({...empty,type:'template-kit',sections:[{body:'Instructions'}],files:[{name:'template.csv',content:'A,B'}]}),'resources','Template kits open the actual files even when instructions exist');
assert.equal(initialBuilderPanel({...empty,uploadIds:['original-pdf']}),'resources','An original-file-only product opens its Files panel without an empty manuscript');
for(const [location,family,stage,panel,field] of [
 [{step:'details',field:'title'},'document',1,'details','title'],
 [{step:'details',field:'subtitle'},'document',1,'details','subtitle'],
 [{step:'content',sectionIndex:13},'challenge',1,'content',undefined],
 [{step:'content',fileIndex:2},'templates',1,'resources',undefined],
 [{step:'content'},'templates',1,'resources',undefined],
 [{step:'content',uploadId:'original-pdf'},'document',1,'resources',undefined],
 [{step:'review',field:'coverUploadId'},'document',1,'appearance','coverUploadId'],
 [{step:'review'},'service',1,'details','meetingUrl'],
 [{step:'review'},'community',1,'details','communityUrl'],
 [{step:'review'},'document',2,'content',undefined],
]){
 const before=structuredClone(location),next=builderNavigationForLocation(location,family);
 assert.equal(next.stage,stage,`${JSON.stringify(location)} opens the right creation step`);
 assert.equal(next.panel,panel,`${JSON.stringify(location)} opens the work panel that contains the fix`);
 assert.equal(next.focus.field,field);
 assert.equal(next.focus.sectionIndex,location.sectionIndex,'Precise section targets survive navigation');
 assert.equal(next.focus.fileIndex,location.fileIndex,'Precise editable-file targets survive navigation');
 assert.deepEqual(location,before,'Navigation never mutates the readiness report');
}
console.log('Builder navigation: existing-content entry, upload entry and all readiness destinations passed.');

// Execute the shipped component handlers with navigation boundaries stubbed so
// product-family routing is checked without duplicating the handler logic.
function componentHandler(path,name,bindings){
 const text=readFileSync(path,'utf8'),file=ts.createSourceFile(path,text,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);let declaration;
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)declaration=node;ts.forEachChild(node,visit);}
 visit(file);assert.ok(declaration,`${name} remains available for the routing regression check`);
 const code=ts.transpileModule(declaration.getText(file),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(bindings),code+`;return ${name};`)(...Object.values(bindings));
}
const toolCalls=[],openTool=componentHandler('app/product-builder.tsx','openTool',{
 workspace:{product:{id:'builder-course'}},openPage:()=>toolCalls.push(['page']),openBuilderPanel:(...args)=>toolCalls.push(['editor',...args]),leave:path=>toolCalls.push(['leave',path]),
});
openTool('media');assert.deepEqual(toolCalls.pop(),['editor','appearance'],'Creative assets opens the builder’s actual Design & cover panel without redirecting to a product home');
openTool('files');assert.deepEqual(toolCalls.pop(),['editor','resources'],'Resources retains its native builder panel');
openTool('commerce');assert.deepEqual(toolCalls.pop(),['editor','details',2],'Checkout retains the native publishing and selling stage');
openTool('vsl');assert.deepEqual(toolCalls.pop(),['leave','/?project=builder-course&area=vsl'],'Marketing still opens the selected product’s installed-tool workspace');
const tabCalls=[],switchTab=componentHandler('app/generator-studio.tsx','switchTab',{
 product:{id:'legacy-file-sale'},workspace:{builders:[]},isFileSale:()=>true,marketingTabs:['dashboard','voice','vsl','funnel','campaigns','automations','offer'],
 openPage:(...args)=>tabCalls.push(['profile',...args]),leaveWorkspace:path=>tabCalls.push(['leave',path]),navigate:action=>action(),setEditorTab:tab=>tabCalls.push(['tab',tab]),setView:()=>{},replaceRoute:()=>{},
});
switchTab('page');assert.deepEqual(tabCalls.pop(),['profile','creator'],'Product home for a legacy file sale opens its branded profile rather than the file editor');
switchTab('content');assert.deepEqual(tabCalls.pop(),['leave','/sell/legacy-file-sale'],'File-sale editing still opens its native editor');
switchTab('commerce');assert.deepEqual(tabCalls.pop(),['leave','/sell/legacy-file-sale?stage=1'],'File-sale checkout opens its pricing stage instead of returning to content editing');
switchTab('dashboard');assert.deepEqual(tabCalls.pop(),['tab','dashboard'],'File-sale marketing remains in the selected product’s marketing workspace');
const fileProduct={id:'legacy-file-sale'},openProduct=componentHandler('app/generator-studio.tsx','openProduct',{
 navigate:action=>action(),workspace:{builders:[],fileSales:[{productId:fileProduct.id}]},workspaceProductDestination:()=>'/sell/'+fileProduct.id,isFileSale:()=>true,
 marketingTabs:['dashboard','voice','vsl','funnel','campaigns','automations','offer'],leavingWorkspace:{current:false},location:{assign:path=>tabCalls.push(['leave',path])},
 receiveProduct:()=>{},setEditorTab:()=>{},setPageMode:()=>{},setPageTab:()=>{},setEditingPage:()=>{},setView:()=>{},setError:()=>{},replaceRoute:()=>{},
});
openProduct(fileProduct,'commerce');assert.deepEqual(tabCalls.pop(),['leave','/sell/legacy-file-sale?stage=1'],'Library checkout actions preserve the file-sale pricing destination');
console.log('Shared product navigation: builder assets, resources, checkout and marketing routes; file-sale profile and editor routes passed.');

const viewSource=readFileSync('app/product-readiness.tsx','utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');
const viewKey='builderReadinessViewTest';globalThis[viewKey]={React,useState:React.useState,ArrowUpRight,CheckCircle2,ChevronDown,ClipboardCheck,Info,TriangleAlert};
const viewCompiled='const {React,useState,ArrowUpRight,CheckCircle2,ChevronDown,ClipboardCheck,Info,TriangleAlert}=globalThis.'+viewKey+';\n'+ts.transpileModule(viewSource,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const {ProductReadiness}=await import('data:text/javascript;base64,'+Buffer.from(viewCompiled).toString('base64'));
const checks=[{key:'required',status:'blocker',title:'Required content',message:'Finish this chapter',location:{step:'content',sectionIndex:0}},{key:'advice',status:'advisory',title:'Optional cover advice',message:'Consider a cover',location:{step:'review',field:'coverUploadId'}}];
const rendered=renderToStaticMarkup(React.createElement(ProductReadiness,{report:{ready:false,blockers:1,advisories:1,checks,originalFileOnly:false},onFix(){}}));
const optionalStart=rendered.indexOf('<details class="product-readiness-optionals"');assert.ok(optionalStart>0,'Optional improvements are grouped into a native disclosure');assert.doesNotMatch(rendered,/<details[^>]*\bopen(?:[=> ]|$)/,'Optional improvements start collapsed');assert.ok(rendered.indexOf('Required content')<optionalStart,'Blocking items remain outside the collapsed advice');assert.ok(rendered.indexOf('Optional cover advice')>optionalStart,'Optional checks and their original fix actions remain available inside the disclosure');delete globalThis[viewKey];
console.log('Readiness UI: blocking issues visible; optional advice collapsed and retained.');

const proposalSource=readFileSync('app/builder-proposal-review.tsx','utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');
const proposalKey='builderProposalReviewTest';globalThis[proposalKey]={React};
const proposalCompiled='const {React}=globalThis.'+proposalKey+';\n'+ts.transpileModule(proposalSource,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const {BuilderProposedSections}=await import('data:text/javascript;base64,'+Buffer.from(proposalCompiled).toString('base64'));
const proposalSections=Array.from({length:14},(_,index)=>({title:'Proposed chapter '+(index+1),body:'Complete proposal body '+(index+1)+' '+('Detailed text. '.repeat(120))+'END_OF_PROPOSAL_'+(index+1)}));
proposalSections[0].body+='<script>untrusted()</script>';
const proposalHtml=renderToStaticMarkup(React.createElement(BuilderProposedSections,{sections:proposalSections,unit:'Chapter',plural:'chapters'}));
for(const section of proposalSections){assert.ok(proposalHtml.includes(section.title),'Every proposed title is visible before replacement');assert.ok(proposalHtml.includes(section.body.split('END_OF_PROPOSAL_')[0].slice(0,80)),'Every proposed section body is visible before replacement');}
assert.match(proposalHtml,/END_OF_PROPOSAL_14/,'The review retains the end of a long multi-section proposal');assert.match(proposalHtml,/Review the full text below/);assert.ok(proposalHtml.includes('&lt;script&gt;untrusted()&lt;/script&gt;'),'Proposed content remains escaped text');assert.doesNotMatch(proposalHtml,/<script>/);delete globalThis[proposalKey];
console.log('Proposal review: all titles and full bodies visible, long proposals retained, untrusted HTML escaped.');

for(const [workspace,dirty,label,hasUnpublishedChanges] of [
 [{version:1,selling:false,publication:null},false,'Private draft',false],
 [{version:1,selling:false,publication:null},true,'Private draft',false],
 [{version:4,selling:false,publication:{version:4}},false,'Page published',false],
 [{version:5,selling:false,publication:{version:4}},false,'Unpublished changes',true],
 [{version:4,selling:false,publication:{version:4}},true,'Unpublished changes',true],
 [{version:4,selling:true,publication:{version:4}},false,'Selling',false],
 [{version:4,selling:true,publication:{version:4}},true,'Selling · draft changes',true],
 [{version:5,selling:true,publication:{version:4}},false,'Selling · draft changes',true],
]){const before=structuredClone(workspace);assert.deepEqual(builderPublicationStatus(workspace,dirty),{label,hasUnpublishedChanges},'Publication UI uses exact persisted versions and pending local edits without hiding active sales');assert.deepEqual(workspace,before,'Deriving publication status does not alter sales or publication');}
console.log('Publication status: private drafts, unchanged live pages, saved/unpersisted draft changes and active sales remain distinct.');

const composeSource=readFileSync('app/builder-agent-compose.tsx','utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');const composeKey='builderComposeFrameTest';globalThis[composeKey]={React};const composeCompiled='const {React}=globalThis.'+composeKey+';\n'+ts.transpileModule(composeSource,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;const {BuilderAgentComposerFrame}=await import('data:text/javascript;base64,'+Buffer.from(composeCompiled).toString('base64'));
const composeHtml=renderToStaticMarkup(React.createElement(BuilderAgentComposerFrame,{footer:React.createElement('div',{className:'builder-agent-compose-bottom'},React.createElement('button',{type:'submit'},'Send all answers'))},React.createElement('details',{open:true},React.createElement('summary',null,'Original excerpt'),React.createElement('label',null,'Exact passage',React.createElement('textarea',{defaultValue:'A long exact passage. '.repeat(80)}))),React.createElement('textarea',{'aria-label':'Message',defaultValue:'Please refine this passage.'})));
const composeScrollEnd=composeHtml.indexOf('</div>');assert.ok(composeHtml.indexOf('Original excerpt')<composeScrollEnd,'Expanded refinement controls stay in the bounded scrollable form body');assert.ok(composeHtml.indexOf('Send all answers')>composeScrollEnd,'The submit control stays outside the scrolling refinement content');assert.match(composeHtml,/details open/,'The full excerpt capability remains reachable even when expanded');delete globalThis[composeKey];console.log('Assistant composer: expanded excerpt remains available; Send stays outside the bounded scrolling controls.');
