import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

function load(path,dependencies={},names){
 let source=readFileSync(path,'utf8');
 if(names){
  const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  source=file.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>names.includes(item.name.getText(file)))).map(node=>node.getText(file)).join('\n');
 }else source=source.replace(/^import[\s\S]*?;\r?\n/gm,'');
 const exports={},code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 new Function('exports',...Object.keys(dependencies),code)(exports,...Object.values(dependencies));return exports;
}
const {briefSchema}=load('lib/product.ts',{z});
const {builderBrief,defaultBuilderDraft}=load('lib/builder-contract.ts',{},['builderTypeDetails','builderFamily','defaultBuilderDraft','builderBrief']);
const draft=defaultBuilderDraft('mini-course');
Object.assign(draft,{title:'A useful client proposal',description:'Prepare one scoped proposal for a first freelance design project.',audience:'First-time freelance designers'});
Object.assign(draft.fields,{outcome:'Complete a proposal with a clear scope and next step',problem:'An older problem statement',prerequisites:'An older tool requirement',instructions:'Preserve my original scope: include two real proposal examples.',meetingUrl:'https://private.example.test/session',communityUrl:'https://private.example.test/invite'});
draft.studio={basics:{problem:'Clients keep asking what is included before accepting a proposal.',prerequisites:'Bring one genuine inquiry and a plain text editor.'},service:{meetingUrl:'https://private.example.test/configuration'},custom:{postPurchaseMessage:'PRIVATE DELIVERY MESSAGE'}};
const original=structuredClone(draft),brief=briefSchema.parse(builderBrief(draft));
assert.match(brief.instructions,/Clients keep asking what is included/,'The problem saved in Product details reaches generation');
assert.match(brief.instructions,/Bring one genuine inquiry and a plain text editor/,'Visible prerequisites reach generation');
assert.match(brief.instructions,/Preserve my original scope: include two real proposal examples/,'Other creator instructions remain intact');
assert.doesNotMatch(brief.instructions,/An older problem statement|An older tool requirement/,'Canonical details replace conflicting legacy context');
assert.doesNotMatch(brief.instructions,/private\.example|PRIVATE DELIVERY MESSAGE/,'Generation does not serialize unrelated private configuration');
assert.deepEqual(draft,original,'Preparing the brief does not change the saved product');

const legacy=structuredClone(draft);delete legacy.studio.basics;
assert.match(builderBrief(legacy).instructions,/An older problem statement/);
assert.match(builderBrief(legacy).instructions,/An older tool requirement/,'Older drafts retain their AI prerequisite input');
const partial=structuredClone(draft);delete partial.studio.basics.prerequisites;
assert.match(builderBrief(partial).instructions,/An older tool requirement/,'A missing canonical field uses the legacy value');
const cleared=structuredClone(draft);cleared.studio.basics={problem:'',prerequisites:''};
assert.doesNotMatch(builderBrief(cleared).instructions,/An older problem statement|An older tool requirement/,'An intentional clear never resurrects legacy text');
const long=structuredClone(draft),source='An exact original preparation instruction. '.repeat(80)+'SOURCE_END';long.studio.basics.prerequisites=source;
assert.ok(briefSchema.parse(builderBrief(long)).instructions.includes(source),'A valid longer creator input is preserved without truncation');
long.studio.basics.prerequisites=source.repeat(4);
assert.ok(builderBrief(long).instructions.includes(source.repeat(4)),'Oversized input is not silently rewritten');
assert.equal(briefSchema.safeParse(builderBrief(long)).success,false,'The existing generation schema rejects an oversized brief explicitly');

const iconNames=['ArrowRight','BookOpen','CalendarDays','ChevronDown','FileText','GraduationCap','Layers3','Sparkles','Upload','Users'];
const states=[],choices=[];let hook=0,externalCalls=0;
const useState=initial=>{const index=hook++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return[states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];};
const {CreatorIntentPicker}=load('app/creator-intent.tsx',{React,useState,...Object.fromEntries(iconNames.map(name=>[name,()=>React.createElement('svg',{'aria-hidden':true})]))});
const allFormats=React.createElement('div',null,'Full video course and other formats');
const render=()=>{hook=0;return CreatorIntentPicker({onChoose:choice=>choices.push(choice),allFormats});};
function nodes(element){if(!element||typeof element!=='object')return[];return[element,...React.Children.toArray(element.props?.children).flatMap(nodes)];}
const text=element=>typeof element==='string'?element:element&&typeof element==='object'?React.Children.toArray(element.props?.children).map(text).join(''):'';
const fetchBefore=globalThis.fetch;globalThis.fetch=async()=>{externalCalls++;throw new Error('Selection must remain local.');};
try{
 const start=render(),teach=nodes(start).find(node=>node.type==='button'&&text(node).includes('I want to teach'));
 assert.ok(teach);teach.props.onClick();
 assert.deepEqual(choices,[{intent:'teach',type:'mini-course',source:'manual'}],'Teaching starts a focused manual mini course without generation');
 const html=renderToStaticMarkup(render());
 assert.match(html,/Recommended: Mini course/);assert.match(html,/one useful lesson from your own expertise/);
 assert.match(html,/Full video course and other formats/,'All formats stay available');
 assert.equal(externalCalls,0,'Choosing a starting point makes no external call');
}finally{globalThis.fetch=fetchBefore;}
console.log('Product foundation passed: saved problem/prerequisites reach generation, legacy fallback and intentional clears, original context retention, private configuration exclusion, bounded schema validation, focused local teaching selection and all-format access.');
