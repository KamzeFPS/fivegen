import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('lib/workspace-product-ready.ts','utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),exports={};
new Function('exports',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(exports);
const {completedWorkspaceProduct}=exports;
assert.equal(typeof completedWorkspaceProduct,'function');
const productId='aa041f25-4e7d-4a3f-9b04-e002b635ac7d',otherId='fa43fe01-38bd-497e-a010-09cf1a6c22d8';
const approval={conversationId:'conversation',planId:'plan',stepId:'product'};
const step={id:'product',title:'Create a useful guide',status:'completed',action:{type:'create_product',title:'A useful product draft'},result:{label:'Open product draft',href:'/build/'+productId,resourceId:productId,productId,summary:'Saved your draft.'}};
const conversation={id:'conversation',messages:[],workflow:{id:'plan',steps:[step]},productId:otherId};
const copy=()=>structuredClone(conversation),input=structuredClone(conversation),ready=completedWorkspaceProduct(conversation,approval);
assert.ok(ready);assert.equal(ready.conversationId,approval.conversationId);assert.equal(ready.title,step.action.title);assert.equal(ready.href,'/build/'+productId);assert.ok(ready.key);
assert.deepEqual(conversation,input,'Matching a confirmed result does not change saved product or conversation data');
assert.deepEqual(completedWorkspaceProduct(conversation,approval),ready,'Matching is deterministic for a single saved step');
for(const field of ['conversationId','planId','stepId'])assert.equal(completedWorkspaceProduct(conversation,{...approval,[field]:'different'}),null,'An approval is scoped to its exact '+field);
for(const status of ['pending','skipped']){const changed=copy();changed.workflow.steps[0].status=status;assert.equal(completedWorkspaceProduct(changed,approval),null,'Only a completed save can produce a success event');}
for(const type of ['manual','create_campaign','create_calendar_event']){const changed=copy();changed.workflow.steps[0].action.type=type;assert.equal(completedWorkspaceProduct(changed,approval),null,'A non-product step cannot create a product completion');}
for(const href of ['https://example.test/build/'+productId,'//example.test/build/'+productId,'javascript:alert(1)','/build/new','/build/'+productId+'?redirect=elsewhere','/build/'+otherId]){
 const changed=copy();changed.workflow.steps[0].result.href=href;assert.equal(completedWorkspaceProduct(changed,approval),null,'Only the confirmed canonical builder URL is actionable');
}
for(const field of ['productId','resourceId']){const changed=copy();changed.workflow.steps[0].result[field]=otherId;assert.equal(completedWorkspaceProduct(changed,approval),null,'Conflicting saved resource identities cannot direct the creator to another product');}
const missing=copy();delete missing.workflow.steps[0].result;assert.equal(completedWorkspaceProduct(missing,approval),null,'A completion without a saved result stays in chat');

console.log('Product-ready matching passed: exact approval scope, completed product-only saves, correct product title and canonical route, conflicting/missing result rejection, deterministic non-mutating matching. No external calls.');
