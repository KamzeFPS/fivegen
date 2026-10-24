import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import React from 'react';
import ts from 'typescript';
import * as icons from 'lucide-react';

// Run real component effects and controls with a deterministic hook transport.
// This suite does not access identities, delivery records, Resend or real APIs.
const source=readFileSync('app/purchase-email-status.tsx','utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
const nodes=value=>Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(value.props.children)]:[];
const text=value=>Array.isArray(value)?value.map(text).join(' '):React.isValidElement(value)?text(value.props.children):value==null||typeof value==='boolean'?'':String(value);
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function harness(){
  const hooks=[],effects=[],requests=[];let cursor=0,dirty=true,tree,disposed=false,lateUpdates=0,props={revision:0};
  const dependencies={React,Loader2:icons.Loader2,RefreshCw:icons.RefreshCw,
    useState(initial){const index=cursor++;hooks[index]||={value:typeof initial==='function'?initial():initial};return [hooks[index].value,next=>{if(disposed)lateUpdates++;const value=typeof next==='function'?next(hooks[index].value):next;if(!Object.is(value,hooks[index].value)){hooks[index].value=value;dirty=true;}}];},
    useRef(initial){return hooks[cursor++]||=( {current:initial});},
    useCallback(value,deps){const index=cursor++,previous=hooks[index];if(!previous||!same(previous.deps,deps))hooks[index]={value,deps};return hooks[index].value;},
    useEffect(callback,deps){const index=cursor++,previous=hooks[index];if(!previous||!same(previous.deps,deps)){hooks[index]={deps,cleanup:previous?.cleanup};effects.push(()=>{hooks[index].cleanup?.();hooks[index].cleanup=callback();});}},
    fetch(url,options){assert.equal(url,'/api/admin/purchase-emails');assert.equal(options.method,'GET','Readiness controls never dispatch or send an email');assert.equal(options.cache,'no-store');assert.equal(options.body,undefined);const request={url,options,...deferred()};requests.push(request);return request.promise;},
  };
  const key='emailStatusUi'+randomUUID().replaceAll('-','');globalThis[key]=dependencies;const module=await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n${code}`).toString('base64'));delete globalThis[key];
  function render(){for(let iteration=0;dirty&&iteration<30;iteration++){dirty=false;cursor=0;tree=module.PurchaseEmailStatus(props);for(const effect of effects.splice(0))effect();}assert.equal(dirty,false,'The status component settles without repeated requests');}
  async function settle(){for(let tick=0;tick<12;tick++){await Promise.resolve();render();}}
  render();return {requests,get tree(){return tree;},get text(){return text(tree);},find(type){return nodes(tree).filter(node=>node.type===type);},
    async respond(index,body,status=200){requests[index].resolve(Response.json(body,{status}));await settle();},
    async refresh(){const button=nodes(tree).find(node=>node.type==='button'&&node.props['aria-label']==='Refresh purchase email status');assert.ok(button);assert.equal(button.props.disabled,false);button.props.onClick();render();await settle();},
    async revise(){props={revision:props.revision+1};dirty=true;render();await settle();},
    dispose(){for(const hook of hooks)hook?.cleanup?.();disposed=true;},get lateUpdates(){return lateUpdates;},
  };
}
const ready={readiness:{ready:true,providerReady:true,workerReady:true,originReady:true,message:'Purchase confirmations will be delivered automatically after verified live payments.'},counts:{pending:2,sending:1,sent:4,failed:1},recent:[{recipient:'PRIVATE_BUYER@example.test',payload:'PRIVATE_EMAIL_BODY'}]};
const blocked={...ready,readiness:{ready:false,providerReady:false,workerReady:false,originReady:false,message:'Connect Resend and a verified sender email in Platform settings to deliver purchase confirmations.'},counts:{}};

let ui=await harness();assert.equal(ui.requests.length,1,'Mount performs one read-only status check');assert.match(ui.text,/Checking saved email configuration/);assert.equal(ui.find('button')[0].props.disabled,true);await ui.respond(0,ready);assert.match(ui.text,/Ready to send/);assert.deepEqual(ui.find('dl').flatMap(list=>nodes(list).filter(node=>node.type==='dt'||node.type==='dd').map(text)),['Queued','3','Sent','4','Failed','1']);assert.match(ui.text,/Sent means accepted by Resend/);assert.match(ui.text,/Sandbox confirmations are suppressed/);assert.match(ui.text,/never emailed retroactively/);assert.ok(!ui.text.includes('PRIVATE_BUYER'));assert.ok(!ui.text.includes('PRIVATE_EMAIL_BODY'));assert.equal(ui.find('button').length,1,'The admin gets a Refresh control, never send or resend controls');assert.equal(ui.find('a').length,0);
await ui.refresh();assert.equal(ui.requests.length,2);assert.match(ui.text,/Checking saved email configuration/);assert.equal(ui.find('dl').length,0,'A fresh check does not keep stale readiness/counts visible');await ui.respond(1,blocked);assert.match(ui.text,/Setup needed/);assert.equal(ui.find('a')[0].props.href,'#platform-key-resend');assert.equal(text(ui.find('a')[0]),'Configure Resend');assert.match(ui.text,/PURCHASE_EMAILS_WORKER_ENABLED=true/);assert.match(ui.text,/credential is generated automatically/);assert.ok(!ui.text.includes('AUTOMATION_DISPATCH_SECRET'));assert.ok(!ui.text.includes('AUTOMATIONS_WORKER_ENABLED=true'),'Purchase email guidance never enables marketing queues');assert.match(ui.text,/APP_ORIGIN/);assert.deepEqual(ui.find('dd').map(text),['0','0','0']);ui.dispose();

ui=await harness();await ui.respond(0,{error:'Only the FiveGen administrator can view delivery status.'},403);assert.match(ui.text,/Check unavailable/);assert.match(text(ui.find('p').find(node=>node.props.role==='alert')),/Only the FiveGen administrator/);assert.equal(ui.find('dl').length,0);await ui.refresh();await ui.respond(1,ready);assert.match(ui.text,/Ready to send/,'The read-only check can recover after an error');ui.dispose();

ui=await harness();await ui.respond(0,{unrelated:'Unexpected response'});assert.match(ui.text,/Purchase email status could not be read/);assert.equal(ui.find('dl').length,0);ui.dispose();

ui=await harness();const initial=ui.requests[0];await ui.revise();assert.equal(ui.requests.length,2,'A successful provider-settings save refreshes delivery readiness');assert.equal(initial.options.signal.aborted,true,'A superseded status request is aborted');await ui.respond(1,ready);await ui.respond(0,blocked);assert.match(ui.text,/Ready to send/,'A late older result cannot overwrite the current saved readiness');ui.dispose();

ui=await harness();const request=ui.requests[0];ui.dispose();assert.equal(request.options.signal.aborted,true);await ui.respond(0,ready);assert.equal(ui.lateUpdates,0,'Unmounted settings never receive asynchronous updates');
console.log('Purchase email status UI passed: GET-only mount/refresh, loading/errors/retry, readiness/env guidance, truthful aggregate counts, no PII/send controls, saved-settings refresh and stale/unmount protection. All requests mocked.');
