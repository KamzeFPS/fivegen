import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ArrowUpRight,CheckCircle2,ChevronDown,ClipboardCheck,Info,TriangleAlert} from 'lucide-react';

const source=readFileSync('app/builder-navigation.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {builderNavigationForLocation,initialBuilderPanel}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const empty={source:'manual',sections:[],files:[],uploadIds:[]};
assert.equal(initialBuilderPanel(empty),'details','A new manual product starts with its brief');
assert.equal(initialBuilderPanel({...empty,source:'ai'}),'details','A new AI product starts with its brief');
assert.equal(initialBuilderPanel({...empty,source:'upload'}),'resources','Choosing existing content opens the upload surface immediately');
for(const content of [{sections:[{title:'A chapter',body:'Existing work'}]},{files:[{name:'resource.md',content:'Existing file'}]}]){
 assert.equal(initialBuilderPanel({...empty,...content}),'content','Opening an existing authored product goes directly to the work');
}
assert.equal(initialBuilderPanel({...empty,uploadIds:['original-pdf']}),'resources','An original-file-only product opens its Files panel without an empty manuscript');
for(const [location,family,stage,panel,field] of [
 [{step:'details',field:'title'},'document',1,'details','title'],
 [{step:'details',field:'subtitle'},'document',1,'details','subtitle'],
 [{step:'content',sectionIndex:13},'challenge',1,'content',undefined],
 [{step:'content',fileIndex:2},'templates',1,'content',undefined],
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

const viewSource=readFileSync('app/product-readiness.tsx','utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');
const viewKey='builderReadinessViewTest';globalThis[viewKey]={React,useState:React.useState,ArrowUpRight,CheckCircle2,ChevronDown,ClipboardCheck,Info,TriangleAlert};
const viewCompiled='const {React,useState,ArrowUpRight,CheckCircle2,ChevronDown,ClipboardCheck,Info,TriangleAlert}=globalThis.'+viewKey+';\n'+ts.transpileModule(viewSource,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const {ProductReadiness}=await import('data:text/javascript;base64,'+Buffer.from(viewCompiled).toString('base64'));
const checks=[{key:'required',status:'blocker',title:'Required content',message:'Finish this chapter',location:{step:'content',sectionIndex:0}},{key:'advice',status:'advisory',title:'Optional cover advice',message:'Consider a cover',location:{step:'review',field:'coverUploadId'}}];
const rendered=renderToStaticMarkup(React.createElement(ProductReadiness,{report:{ready:false,blockers:1,advisories:1,checks,originalFileOnly:false},onFix(){}}));
const optionalStart=rendered.indexOf('<details class="product-readiness-optionals"');assert.ok(optionalStart>0,'Optional improvements are grouped into a native disclosure');assert.doesNotMatch(rendered,/<details[^>]*\bopen(?:[=> ]|$)/,'Optional improvements start collapsed');assert.ok(rendered.indexOf('Required content')<optionalStart,'Blocking items remain outside the collapsed advice');assert.ok(rendered.indexOf('Optional cover advice')>optionalStart,'Optional checks and their original fix actions remain available inside the disclosure');delete globalThis[viewKey];
console.log('Readiness UI: blocking issues visible; optional advice collapsed and retained.');
