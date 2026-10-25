import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import ts from 'typescript';

// Exercise the production component's effects and handlers with local deferred
// responses. No service, provider, payment, or real product is contacted.
const source=readFileSync('app/product-delete-dialog.tsx','utf8').replace(/^import[^\n]*\n/gm,'');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const all=value=>Array.isArray(value)?value.flatMap(all):React.isValidElement(value)?[value,...all(value.props.children)]:[];
const text=value=>Array.isArray(value)?value.map(text).join(''):React.isValidElement(value)?text(value.props.children):typeof value==='string'||typeof value==='number'?String(value):'';
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
const dialogs=Object.fromEntries(['Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'].map(name=>[name,name]));
const product={id:'deletion-ui-fixture',title:'A creator’s original course',updatedAt:17};
const eligibility={product,canDelete:true,blockers:[],revision:'a'.repeat(64)};
class FocusTarget{
 constructor(name){this.name=name;this.isConnected=true;this.focusCalls=0;}
 focus(){this.focusCalls++;}
 getAttribute(name){return name==='aria-label'?this.label:null;}
}

function harness(exportName='ProductDeleteDialog',initialProps={}){
 let cursor=0,dirty=true,tree,props={product,open:true,...initialProps},disposed=false,lateUpdates=0;
 const slots=[],effects=[],requests=[],opened=[],deleted=[],removed=[],navigations=[],focusTargets=[];
 const document={activeElement:new FocusTarget('original trigger'),querySelectorAll:()=>focusTargets};
 const scope={React,...dialogs,Loader2:()=>null,Trash2:()=>null,AbortController,HTMLElement:FocusTarget,document,
  sessionStorage:{removeItem:key=>removed.push(['session',key])},localStorage:{removeItem:key=>removed.push(['local',key])},location:{assign:path=>navigations.push(path)},
  useState(initial){const index=cursor++;slots[index]||={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{if(disposed)lateUpdates++;const next=typeof value==='function'?value(slots[index].value):value;if(!Object.is(next,slots[index].value)){slots[index].value=next;dirty=true;}}];},
  useRef(initial){const index=cursor++;return slots[index]||={current:initial};},
  useId(){const index=cursor++;return (slots[index]||={value:'deletion-ui-input-'+index}).value;},
  useEffect(effect,deps){const index=cursor++;if(!same(slots[index]?.deps,deps)){const old=slots[index];slots[index]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[index].cleanup?.();slots[index].cleanup=effect();});}},
  fetch(url,options={}){let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});requests.push({url,options,resolve,reject});return promise;},
 };
 const module={};new Function('exports',...Object.keys(scope),code)(module,...Object.values(scope));
 props={...props,onOpenChange:props.onOpenChange||((value)=>opened.push(value)),onDeleted:props.onDeleted||(()=>deleted.push(product.id))};
 function render(){for(let count=0;dirty&&count<20;count++){dirty=false;cursor=0;tree=module[exportName](props);for(const effect of effects.splice(0))effect();}assert.equal(dirty,false,'Deletion effects settle');return tree;}
 async function settle(){for(let count=0;count<8;count++){render();await new Promise(done=>setImmediate(done));}return tree;}
 render();
 return {get tree(){return tree;},get label(){return text(tree);},module,document,focusTargets,requests,opened,deleted,removed,navigations,get lateUpdates(){return lateUpdates;},
  find:predicate=>all(tree).find(predicate),buttons:()=>all(tree).filter(node=>node.type==='button'),
  button(label){const button=all(tree).find(node=>node.type==='button'&&text(node).trim()===label);assert.ok(button,'Button available: '+label);return button;},
  async type(value){const input=all(tree).find(node=>node.type==='input');assert.ok(input,'Confirmation input exists');input.props.onChange({target:{value}});await settle();},
  async click(label){this.button(label).props.onClick();await settle();},
  async respond(index,data,status=200){assert.ok(requests[index],'Expected a pending request');requests[index].resolve(Response.json(data,{status}));await settle();},
  async reject(index,message){requests[index].reject(new Error(message));await settle();},
  async update(next){props={...props,...next};dirty=true;await settle();},settle,
  dispose(){disposed=true;for(const slot of slots)slot?.cleanup?.();},
 };
}

{
 const app=harness();assert.equal(app.requests.length,1);assert.equal(app.requests[0].url,'/api/products/'+product.id+'/deletion');assert.equal(app.requests[0].options.method,undefined);assert.equal(app.requests[0].options.cache,'no-store');assert.ok(app.requests[0].options.signal);assert.equal(app.button('Delete product').props.disabled,true,'Opening the dialog only checks activity and never deletes');
 await app.respond(0,eligibility);assert.equal(app.button('Delete product').props.disabled,true);assert.ok(app.find(node=>node.type==='label'&&node.props.htmlFor===app.find(node=>node.type==='input').props.id),'The confirmation input has an associated label');
 for(const mismatch of ['',product.title.toUpperCase(),product.title+' ',product.title.slice(1)]){await app.type(mismatch);assert.equal(app.button('Delete product').props.disabled,true,'Confirmation requires the exact saved product name');}
 await app.type(product.title);assert.equal(app.button('Delete product').props.disabled,false);const submit=app.button('Delete product');submit.props.onClick();submit.props.onClick();await app.settle();assert.equal(app.requests.length,2,'Repeated activation cannot issue a duplicate DELETE');
 assert.equal(app.requests[1].options.method,'DELETE');assert.equal(app.requests[1].url,'/api/products/'+product.id);assert.equal(app.requests[1].options.headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(app.requests[1].options.body),{title:product.title,expectedUpdatedAt:17,revision:eligibility.revision},'Deletion binds confirmation to the checked saved product and dependency revision');
 assert.equal(app.button('Deleting…').props.disabled,true);assert.equal(app.button('Keep product').props.disabled,true);assert.equal(app.find(node=>node.type==='DialogContent').props.showCloseButton,false);app.find(node=>node.type==='Dialog').props.onOpenChange(false);assert.deepEqual(app.opened,[],'Escape and outside dismissal cannot interrupt a pending deletion');
 await app.respond(1,{deleted:true});assert.deepEqual(app.deleted,[product.id]);assert.deepEqual(app.removed,[['session','fivegen:builder-draft:'+product.id],['local','fivegen:builder-agent:'+product.id]]);assert.deepEqual(app.navigations,[],'The owning workspace handles the successful deletion without an extra navigation');app.dispose();
}
{
 const app=harness();await app.respond(0,{...eligibility,canDelete:false,blockers:['An existing customer needs continued access.','A payment record must be retained.']});assert.equal(app.button('Delete product').props.disabled,true);assert.equal(app.find(node=>node.type==='input'),undefined);assert.match(app.label,/existing customer/);assert.match(app.label,/payment record/);app.button('Delete product').props.onClick();await app.settle();assert.equal(app.requests.length,1,'Even a directly invoked blocked handler cannot delete');assert.equal(app.find(node=>node.type==='a').props.href,'/?project='+product.id+'&area=commerce');await app.click('Close');assert.deepEqual(app.opened,[false]);app.dispose();
}
{
 const app=harness();await app.respond(0,eligibility);await app.type(product.title);await app.click('Delete product');await app.respond(1,{error:'Product activity changed. Recheck before deleting.'},409);assert.equal(app.deleted.length,0);assert.equal(app.button('Delete product').props.disabled,true);assert.equal(app.find(node=>node.type==='input'),undefined);assert.match(text(app.find(node=>node.props.role==='alert')),/activity changed/);assert.equal(app.requests.length,2,'A failed delete never retries in the background');
 await app.click('Recheck product');assert.equal(app.requests.length,3);assert.equal(app.requests[2].options.method,undefined);await app.respond(2,{...eligibility,product:{...product,updatedAt:20},revision:'b'.repeat(64)});assert.equal(app.find(node=>node.type==='input').props.value,'','Rechecking requires fresh typed confirmation');assert.equal(app.button('Delete product').props.disabled,true);await app.type(product.title);await app.click('Delete product');assert.deepEqual(JSON.parse(app.requests[3].options.body),{title:product.title,expectedUpdatedAt:20,revision:'b'.repeat(64)});app.dispose();
}
{
 const app=harness();await app.reject(0,'Eligibility connection failed');assert.equal(app.button('Delete product').props.disabled,true);assert.match(app.label,/Eligibility connection failed/);await app.click('Recheck product');await app.respond(1,eligibility);await app.type(product.title);await app.update({disabled:true});assert.equal(app.button('Delete product').props.disabled,true);app.button('Delete product').props.onClick();await app.settle();assert.equal(app.requests.length,2,'A parent editor with unsaved or pending work cannot be bypassed');app.dispose();
}
{
 const app=harness('ProductDeleteDialog',{open:false});assert.equal(app.requests.length,0);await app.update({open:true});assert.equal(app.requests.length,1);const pending=app.requests[0];await app.update({open:false});assert.equal(pending.options.signal.aborted,true,'Closing the dialog cancels its eligibility request');await app.respond(0,eligibility);assert.equal(app.requests.length,1);assert.equal(app.deleted.length,0);app.dispose();
 const disposed=harness();disposed.dispose();await disposed.respond(0,eligibility);assert.equal(disposed.lateUpdates,0,'A late check cannot mutate an unmounted dialog');
}
{
 const app=harness(),content=app.find(node=>node.type==='DialogContent'),cancel=app.button('Keep product'),cancelTarget=new FocusTarget('cancel'),original=app.document.activeElement;cancel.props.ref.current=cancelTarget;
 let prevented=0;content.props.onOpenAutoFocus({preventDefault(){prevented++;}});assert.equal(cancelTarget.focusCalls,1,'Opening focuses the safe cancel action');assert.equal(prevented,1);await app.click('Keep product');assert.deepEqual(app.opened,[false]);content.props.onCloseAutoFocus({preventDefault(){prevented++;}});assert.equal(original.focusCalls,1,'Cancel restores focus to the original trigger');
 original.isConnected=false;const fallback=new FocusTarget('library trigger');fallback.label='Actions for '+product.title;app.focusTargets.push(fallback);content.props.onCloseAutoFocus({preventDefault(){prevented++;}});assert.equal(fallback.focusCalls,1,'If a menu unmounts its item, focus returns to the surviving product action trigger');app.dispose();
}
{
 const app=harness('ProductDeletePanel'),dialog=()=>app.find(node=>node.type===app.module.ProductDeleteDialog);assert.equal(dialog().props.open,false);assert.equal(app.requests.length,0,'Settings do not issue a delete or activity check until confirmation opens');await app.click('Delete product…');assert.equal(dialog().props.open,true);assert.equal(dialog().props.product.id,product.id);dialog().props.onOpenChange(false);await app.settle();assert.equal(dialog().props.open,false);await app.update({disabled:true});assert.equal(app.button('Delete product…').props.disabled,true);assert.equal(dialog().props.disabled,true);app.dispose();
}

// Evaluate the actual JSX expressions used by both product Settings screens so
// test coverage includes their real placement, dirty guards and exit callbacks.
function settingsExpression(path){
 const original=readFileSync(path,'utf8'),ast=ts.createSourceFile(path,original,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const found=[];
 function visit(node){if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='ProductDeletePanel')found.push(node);ts.forEachChild(node,visit);}visit(ast);assert.equal(found.length,1,'Exactly one deletion panel is wired into '+path);let expression=found[0];while(expression.parent&&!ts.isJsxExpression(expression.parent))expression=expression.parent;assert.ok(ts.isJsxExpression(expression.parent));return expression.parent.expression.getText(ast);
}
function evaluate(expression,scope){const compiled=ts.transpileModule('const result=('+expression+');',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;return new Function('React',...Object.keys(scope),compiled+';return result;')(React,...Object.values(scope));}
{
 const Panel=()=>null,departures=[],expression=settingsExpression('app/product-builder.tsx'),base={activePanel:'details',workspace:{product},busy:'',saving:false,dirty:false,ProductDeletePanel:Panel,depart:path=>departures.push(path)};
 let panel=evaluate(expression,base);assert.equal(panel.type,Panel);assert.equal(panel.props.product.id,product.id);assert.equal(panel.props.disabled,false);panel.props.onDeleted();assert.deepEqual(departures,['/?view=library']);
 for(const update of [{dirty:true},{saving:true},{busy:'upload'}])assert.equal(evaluate(expression,{...base,...update}).props.disabled,true,'Builder Settings protect outstanding edits and work');
 assert.equal(evaluate(expression,{...base,activePanel:'content'}),false);assert.equal(evaluate(expression,{...base,workspace:null}),null);
}
{
 const Panel=()=>null,removed=[],expression=settingsExpression('app/generator-studio.tsx'),base={editorTab:'settings',product,dirty:false,busy:'',childDirty:false,childBusy:false,ProductDeletePanel:Panel,removeDeletedProduct:id=>removed.push(id)};
 const panel=evaluate(expression,base);assert.equal(panel.type,Panel);assert.equal(panel.props.disabled,false);panel.props.onDeleted();assert.deepEqual(removed,[product.id]);
 for(const update of [{dirty:true},{busy:'save'},{childDirty:true},{childBusy:true}])assert.equal(evaluate(expression,{...base,...update}).props.disabled,true,'Legacy Settings protect both parent and nested editor work');
 assert.equal(evaluate(expression,{...base,editorTab:'content'}),false);
}

console.log('Product deletion UI passed: check-only opening, exact saved-name confirmation, activity protection, revision-bound requests, duplicate prevention, explicit failure recheck, disabled editor guard, cancellation and focus restoration, stale response safety, and both Settings integrations. Library actions are covered by workspace-library-test.mjs.');
