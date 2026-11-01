import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import ts from 'typescript';

const raw=readFileSync('app/builder-agent.tsx','utf8'),source=ts.createSourceFile('app/builder-agent.tsx',raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function handlers(names,scope){const found=[];function visit(node){if(ts.isFunctionDeclaration(node)&&names.includes(node.name?.text))found.push(node.getText(source));ts.forEachChild(node,visit);}visit(source);assert.equal(found.length,names.length);runInContext(ts.transpileModule(found.join('\n'),{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText,createContext(scope));return scope;}
function fixture(){const calls={send:[],apply:[],consent:[]},scope={Error,interactionBlocked:{current:false},sendingRef:{current:false},state:{aiReady:true},canSend:true,consentSignature:'exact-product-context',charge:10,creditConsent:null,pending:null,answers:{},error:'',applying:'',applied:[],messages:[{id:'proposal',target:'details',refinement:undefined}],setCreditConsent(value){scope.creditConsent=value;calls.consent.push(value);},setError(value){scope.error=value;},setAnswers(value){scope.answers=typeof value==='function'?value(scope.answers):value;},setApplying(value){scope.applying=value;},setApplied(value){scope.applied=typeof value==='function'?value(scope.applied):value;},send:async request=>{calls.send.push(request);},onApply:async(...args)=>{calls.apply.push(args);return true;}};handlers(['requestSend','approveSend','apply','deferAnswer'],scope);return{scope,calls};}

// Live guard refs protect stale composer/retry/approval handlers during any
// product operation, before consent or a provider request can be started.
{
 const {scope,calls}=fixture();scope.interactionBlocked.current=true;scope.requestSend();scope.requestSend({requestId:'saved-retry',maxCredits:10});assert.equal(calls.consent.length,0);scope.creditConsent={signature:scope.consentSignature,cost:10};scope.approveSend();assert.equal(calls.send.length,0);assert.equal(scope.creditConsent,null);assert.match(scope.error,/current operation/);assert.doesNotMatch(scope.error,/book image/);await scope.apply('proposal',{summary:'A reviewed edit.'});assert.equal(calls.apply.length,0);scope.deferAnswer('What should members do?','unsure');assert.deepEqual(scope.answers,{});
 for(const type of ['book','guide','playbook','mini-course','video-course','template-kit','challenge','consulting','coaching','community','custom']){const blocked={interactionBlocked:{current:true},setError:value=>{blocked.error=value;},context:{type},fetch(){throw new Error('A blocked product must never send');}};handlers(['send'],blocked);await blocked.send();assert.match(blocked.error,/current operation/);assert.doesNotMatch(blocked.error,/book image/);}
}
// Opening consent still performs no request. Changed context/cost revokes it,
// and a retry carries only its own reviewed ceiling through the same dialog.
{
 const {scope,calls}=fixture();scope.requestSend();assert.equal(calls.send.length,0);assert.equal(scope.creditConsent.cost,10);scope.consentSignature='changed-context';scope.approveSend();assert.equal(calls.send.length,0);assert.match(scope.error,/changed/);scope.requestSend();scope.charge=20;scope.approveSend();assert.equal(calls.send.length,0);scope.requestSend();scope.approveSend();assert.equal(calls.send.length,1);const retry={requestId:'same-reviewed-request',maxCredits:7};scope.requestSend(retry);assert.equal(calls.send.length,1);assert.equal(scope.creditConsent.cost,7);scope.approveSend();assert.equal(calls.send.length,2);assert.equal(calls.send[1],retry);
}
// Review/apply is mutually exclusive with a pending assistant request and is
// synchronously locked against a second click before React can rerender.
{
 const {scope,calls}=fixture();scope.pending={requestId:'pending-request'};await scope.apply('proposal',{summary:'Keep this proposal separate.'});assert.equal(calls.apply.length,0);scope.pending=null;let finish;scope.onApply=(...args)=>{calls.apply.push(args);return new Promise(resolve=>{finish=resolve;});};const first=scope.apply('proposal',{summary:'A useful reviewed suggestion.'});await scope.apply('proposal',{summary:'A duplicate click.'});assert.equal(calls.apply.length,1);assert.equal(scope.sendingRef.current,true);scope.requestSend();assert.equal(calls.consent.length,0);finish(true);await first;assert.equal(scope.sendingRef.current,false);assert.equal(scope.applying,'');assert.deepEqual([...scope.applied],['proposal']);assert.equal(calls.apply[0][1],'details');assert.equal(calls.apply[0][3],'proposal');
}
// Deferral remains editable text in the current answer draft. It neither sends
// a request nor misrepresents uncertainty as factual expertise.
{
 const {scope,calls}=fixture();scope.deferAnswer('Who is this for?','unsure');assert.match(scope.answers['Who is this for?'],/not sure.*already shared/i);scope.deferAnswer('Supporting files?','skip');assert.match(scope.answers['Supporting files?'],/skipping.*assumptions/i);assert.equal(calls.send.length,0);assert.equal(calls.consent.length,0);scope.pending={requestId:'still-working'};const before={...scope.answers};scope.deferAnswer('Who is this for?','skip');assert.deepEqual({...scope.answers},before);
}
console.log('BuilderAgent UI guards passed: all11 neutral busy boundaries, no consent or send while blocked, fresh per-step approval, reviewed retry ceilings, synchronous apply lock and editable uncertainty without provider calls.');
