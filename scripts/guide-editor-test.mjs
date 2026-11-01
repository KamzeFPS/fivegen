import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import React from 'react';
import ts from 'typescript';
import * as icons from 'lucide-react';

function load(path,deps={}){const exports={},source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');new Function('exports',...Object.keys(deps),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText)(exports,...Object.values(deps));return exports;}
const {guideStep}=load('lib/guide-content.ts'),iconDeps=Object.fromEntries(Object.entries(icons).filter(([name])=>/^[A-Z]/.test(name)&&name!=='Map'));
function nodes(value){return Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(value.props.children)]:[];}
function text(value){return Array.isArray(value)?value.map(text).join(''):React.isValidElement(value)?text(value.props.children):value===null||value===undefined||typeof value==='boolean'?'':String(value);}
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
function fixture(){const uploadId=randomUUID(),draft={type:'guide',source:'manual',title:'Your first freelance client',description:'A useful original guide.',audience:'New freelancers',language:'English',fields:{outcome:'Send one relevant pitch.',deliveryMode:'both',exportFormat:'pdf',privateExisting:'preserve me'},sections:[{id:randomUUID(),title:'Choose one useful offer',body:'Original useful instructions.',objective:'Choose one service.',studio:{actionStep:'- Write one sentence.\n- Test your offer.',guideExample:'A labelled illustrative example.',privateExisting:{a:'preserve me'}}},{id:randomUUID(),title:'Find good-fit prospects',body:'Original prospect instructions.',studio:{privateExisting:'keep second'}},{id:randomUUID(),title:'Write your first message',body:'Original message instructions.'}],files:[{name:'message-template.md',content:'# ORIGINAL TEMPLATE',description:'Original file.'}],uploadIds:[uploadId],priceCents:1900,currency:'usd',studio:{writing:{font:'sans'},privateExisting:'keep guide'}};return {product:{id:randomUUID(),title:draft.title},draft,version:8,uploads:[{id:uploadId,name:'source-document.pdf',mime:'application/pdf',size:1200,status:'completed'},{id:randomUUID(),name:'private-unattached.txt',mime:'text/plain',size:12,status:'completed'}],readiness:{},publication:null,payments:{},selling:false};}
function harness(workspace=fixture()){
 const hooks=[],effects=[],calls={changes:[],steps:[],navigate:[],asks:[],exports:[],saves:0};let cursor=0,dirty=true,tree;
 const props={workspace,draft:structuredClone(workspace.draft),activeStep:0,busy:false,saving:false,onStep(index){props.activeStep=index;calls.steps.push(index);dirty=true;},onChange(next){props.draft=next;calls.changes.push(structuredClone(next));dirty=true;},async onSave(){calls.saves++;return props.workspace;},onPreview(){calls.navigate.push('preview');},async onExport(format){calls.exports.push(format);},onNavigate(area){calls.navigate.push(area);},onAskAI(...args){calls.asks.push(args);},onGenerateDraft(){calls.asks.push(['generate']);}};
 const useState=initial=>{const index=cursor++;if(!hooks[index])hooks[index]={value:typeof initial==='function'?initial():initial};return[hooks[index].value,value=>{const next=typeof value==='function'?value(hooks[index].value):value;if(!Object.is(next,hooks[index].value)){hooks[index].value=next;dirty=true;}}];};
 const useRef=initial=>hooks[cursor++]||={current:initial};const useEffect=(callback,deps)=>{const index=cursor++;if(!hooks[index]||!same(hooks[index].deps,deps)){hooks[index]={deps};effects.push(callback);}};
 const primitives=Object.fromEntries(['Field','FieldGroup','FieldLabel','AlertDialogContent','AlertDialogDescription','AlertDialogFooter','AlertDialogHeader','AlertDialogTitle'].map(name=>[name,name.toLowerCase()]));
 const {GuideEditor}=load('app/guide-editor.tsx',{React,useState,useRef,useEffect,guideStep,...iconDeps,...primitives,Button:'button',Input:'input',Textarea:'textarea',AlertDialog:'alertdialog',AlertDialogAction:'confirmremove',AlertDialogCancel:'cancelremove',Brand:()=>React.createElement('span',null,'FiveGen'),ProductDeliveryChoice:'deliverychoice',crypto:{randomUUID}});
 function render(){for(let tick=0;dirty&&tick<30;tick++){dirty=false;cursor=0;tree=GuideEditor(props);for(const effect of effects.splice(0))effect();}assert.equal(dirty,false,'Guide editor settles');return tree;}
 render();return {props,calls,get tree(){return tree;},get text(){return text(tree);},nodes(){return nodes(tree);},find(type,label){const node=nodes(tree).find(node=>node.type===type&&(node.props['aria-label']===label||text(node)===label));assert.ok(node,`Exists ${type}: ${label}`);return node;},button(label){return this.find('button',label);},click(label){const button=this.button(label);assert.ok(!button.props.disabled,'Enabled: '+label);button.props.onClick?.();render();},input(label,value){const input=this.find('input',label);input.props.onChange({target:{value}});render();},confirmRemove(){this.find('confirmremove','Remove step').props.onClick();render();},cancelRemove(){const dialog=nodes(tree).find(node=>node.type==='alertdialog');dialog.props.onOpenChange(false);render();},rerender(){dirty=true;render();},render};
}

// Existing data and every unrelated field survive step selection and renaming.
{
 const app=harness(),before=structuredClone(app.props.draft);assert.match(app.text,/Reader action/);assert.match(app.text,/Review credits before generating/);assert.doesNotMatch(app.text,/Image quality|Low|Med|High/);
 app.click('Open step 2: Find good-fit prospects');assert.equal(app.props.activeStep,1);assert.deepEqual(app.props.draft,before);
 app.click('Rename step 2: Find good-fit prospects');app.input('Rename step 2','Find five suitable prospects');app.click('Save step name');assert.equal(app.props.draft.sections[1].title,'Find five suitable prospects');assert.deepEqual(app.props.draft.sections[0],before.sections[0]);assert.equal(app.props.draft.sections[1].studio.privateExisting,'keep second');assert.deepEqual(app.props.draft.files,before.files);assert.deepEqual(app.props.draft.studio,before.studio);
 app.click('Rename current step');app.input('Rename step 2','Discard this name');app.click('Cancel step rename');assert.equal(app.props.draft.sections[1].title,'Find five suitable prospects');
 app.click('Rename current step');app.input('Rename step 2','Escape this name');app.find('input','Rename step 2').props.onKeyDown({key:'Escape',preventDefault(){}});app.render();assert.equal(app.props.draft.sections[1].title,'Find five suitable prospects');
 app.click('Rename current step');app.input('Rename step 2','   ');app.click('Save step name');assert.match(app.text,/Give this step a name/);assert.equal(app.props.draft.sections[1].title,'Find five suitable prospects');app.click('Cancel step rename');
 app.click('Rename current step');app.input('Rename step 2','A useful saved name');app.find('input','Rename step 2').props.onKeyDown({key:'Enter',preventDefault(){}});app.render();assert.equal(app.props.draft.sections[1].title,'A useful saved name');
}
// Adding creates an actual empty section and stable UUID; removing is explicit
// and keeps the selected survivor, siblings, resource bytes and other metadata.
{
 const app=harness(),before=structuredClone(app.props.draft);app.click('Add step');assert.equal(app.props.activeStep,3);assert.equal(app.props.draft.sections.length,4);assert.equal(app.props.draft.sections[3].body,'');assert.match(app.props.draft.sections[3].id,/^[a-f0-9-]{36}$/);assert.deepEqual(app.props.draft.sections.slice(0,3),before.sections);app.input('Rename step 4','A useful final check');app.click('Save step name');
 app.click('Remove current step');assert.equal(app.props.draft.sections.length,4,'Opening removal does not delete');app.cancelRemove();assert.equal(app.props.draft.sections.length,4,'Cancel keeps step');app.click('Remove current step');app.confirmRemove();assert.equal(app.props.draft.sections.length,3);assert.equal(app.props.activeStep,2);assert.deepEqual(app.props.draft.sections,before.sections);assert.deepEqual(app.props.draft.files,before.files);assert.deepEqual(app.props.draft.uploadIds,before.uploadIds);
 app.click('Move step earlier');assert.equal(app.props.activeStep,1);assert.equal(app.props.draft.sections[1].id,before.sections[2].id);app.click('Move step later');assert.equal(app.props.activeStep,2);assert.deepEqual(app.props.draft.sections,before.sections);
}
// The schema cap and an empty guide both have usable states.
{
 const workspace=fixture();workspace.draft.sections=Array.from({length:30},(_,i)=>({id:randomUUID(),title:'Step '+(i+1),body:'Original '+i}));const app=harness(workspace);assert.ok(app.button('Add step').props.disabled);assert.match(app.text,/30 steps/);
 const empty=fixture();empty.draft.sections=[];const editor=harness(empty);assert.match(editor.text,/Add your first step/);editor.click('Add first step');assert.equal(editor.props.draft.sections.length,1);editor.click('Cancel step rename');editor.click('Remove current step');editor.confirmRemove();assert.equal(editor.props.draft.sections.length,0);assert.match(editor.text,/Add your first step/);
}
// Empty editable checklist rows remain visible until the creator fills them.
// Explicitly clearing all rows never resurrects legacy actionStep content.
{
 const app=harness(),original=structuredClone(app.props.draft.sections[0].studio);app.click('Add action');assert.equal(app.props.draft.sections[0].studio.guideChecklist.length,3);assert.ok(app.find('input','Action 3'));app.input('Action 3','Ask one clear question.');assert.equal(app.props.draft.sections[0].studio.guideChecklist[2].text,'Ask one clear question.');assert.equal(app.props.draft.sections[0].studio.actionStep,original.actionStep);assert.deepEqual(app.props.draft.sections[0].studio.privateExisting,original.privateExisting);
 app.click('Remove action 3');app.click('Remove action 2');app.click('Remove action 1');assert.deepEqual(app.props.draft.sections[0].studio.guideChecklist,[]);assert.ok(!app.nodes().some(node=>node.type==='input'&&node.props['aria-label']==='Action 1'));
 app.click('Add action');assert.ok(app.find('input','Action 1'));app.input('Action 1','An entirely new action.');assert.equal(app.props.draft.sections[0].studio.guideChecklist[0].text,'An entirely new action.');
}
// Assignments select only files that are already included, never private
// unattached uploads. Removing a step assignment leaves original bytes intact.
{
 const app=harness(),original=structuredClone(app.props.draft),uploadId=app.props.workspace.uploads[0].id;app.click('Choose files');assert.doesNotMatch(app.text,/private-unattached/);const labels=app.nodes().filter(node=>node.type==='label'),upload=labels.find(node=>text(node).includes('source-document.pdf')),file=labels.find(node=>text(node).includes('message-template.md'));nodes(upload).find(node=>node.type==='input').props.onChange();app.render();assert.deepEqual(app.props.draft.sections[0].studio.guideUploadIds,[uploadId]);nodes(file).find(node=>node.type==='input').props.onChange();app.render();assert.deepEqual(app.props.draft.sections[0].studio.guideFileNames,['message-template.md']);app.click('Remove source-document.pdf from this step');assert.deepEqual(app.props.draft.sections[0].studio.guideUploadIds,[]);assert.deepEqual(app.props.draft.uploadIds,original.uploadIds);assert.deepEqual(app.props.draft.files,original.files);
}
// AI is a parent consent handoff only. Existing delivery fields are retained.
{
 const app=harness();app.click('Improve with Gen');assert.equal(app.calls.asks.length,1);assert.equal(app.calls.asks[0][1].originalText,'Original useful instructions.');assert.equal(app.calls.asks[0][1].sectionId,app.props.draft.sections[0].id);assert.equal(app.calls.saves,0);
 app.click('Preview guide');app.click('Sources & files');app.click('Cover & appearance');app.click('Guide settings');app.click('Review & publish');assert.deepEqual(app.calls.navigate,['preview','resources','appearance','details','review']);
 const delivery=app.nodes().find(node=>node.type==='deliverychoice');delivery.props.onChange({delivery:'download',exportFormat:'epub'});app.render();assert.equal(app.props.draft.fields.deliveryMode,'download');assert.equal(app.props.draft.fields.exportFormat,'epub');assert.equal(app.props.draft.fields.privateExisting,'preserve me');assert.equal(app.props.draft.studio.privateExisting,'keep guide');
 const tooLong=app.props.draft.sections[0].body='Original unrestricted instructions. '.repeat(100);app.rerender();assert.equal(app.find('textarea','').props?.maxLength,undefined);
 app.click('Improve with Gen');assert.equal(app.calls.asks.length,1,'A too-long implicit refinement is not sent');assert.match(app.text,/Your full step can be as long as needed/);assert.equal(app.props.draft.sections[0].body,tooLong);
}
console.log('Guide editor: step CRUD, stable selection, content preservation, resource assignments and consent handoffs passed.');
