import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';

const source=readFileSync('lib/use-mascot-sales.ts','utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const sameDeps=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const sale=(id,paidAt)=>({id,paidAt,amount:1900,currency:'usd'});
const report=(latestSale,extra={})=>({ownerKey:'opaque-owner-a',mode:'test',configured:true,paidSales:latestSale?1:0,latestSale,...extra});
function browserGroup(){
  const values=new Map(),tabs=new Set(),locks=new Map();
  return {values,tabs,navigator:{locks:{request(name,work){const current=(locks.get(name)||Promise.resolve()).then(work);locks.set(name,current.catch(()=>{}));return current;}}}};
}
async function harness({group=browserGroup(),visible=true,blockedStorage=false,enabled=true}={}){
  const hooks=[],effects=[],requests=[],events=[],listeners=new Map(),documentListeners=new Map(),timers=new Map();let hook=0,dirty=true,disposed=false,updatesAfterDispose=0,clock=0,timerId=0,result;
  let props={enabled,onSale:event=>events.push(event)};
  const listen=(map,name,callback)=>{if(!map.has(name))map.set(name,new Set());map.get(name).add(callback);},remove=(map,name,callback)=>map.get(name)?.delete(callback),dispatch=(map,name,event={})=>{for(const callback of map.get(name)||[])callback(event);};
  const tab={storage:event=>dispatch(listeners,'storage',event)};group.tabs.add(tab);
  const localStorage={getItem:key=>{if(blockedStorage)throw new Error('Storage blocked');return group.values.get(key)||null;},setItem(key,value){if(blockedStorage)throw new Error('Storage blocked');group.values.set(key,value);for(const other of group.tabs)if(other!==tab)other.storage({key,newValue:value});}};
  const document={visibilityState:visible?'visible':'hidden',addEventListener:(...args)=>listen(documentListeners,...args),removeEventListener:(...args)=>remove(documentListeners,...args)},window={localStorage,addEventListener:(...args)=>listen(listeners,...args),removeEventListener:(...args)=>remove(listeners,...args)};
  const useRef=initial=>hooks[hook++]||=( {current:initial});
  const useState=initial=>{const index=hook++;hooks[index]||=({value:initial});return [hooks[index].value,next=>{if(disposed)updatesAfterDispose++;const value=typeof next==='function'?next(hooks[index].value):next;if(!Object.is(value,hooks[index].value)){hooks[index].value=value;dirty=true;}}];};
  const useEffect=(callback,deps)=>{const index=hook++,previous=hooks[index];if(!previous||!sameDeps(previous.deps,deps)){hooks[index]={deps,cleanup:previous?.cleanup};effects.push(()=>{hooks[index].cleanup?.();hooks[index].cleanup=callback();});}};
  const dependencies={useRef,useState,useEffect,window,document,navigator:group.navigator,AbortController,
    fetch:(url,options)=>{const value={url,options,...deferred()};requests.push(value);return value.promise;},
    setTimeout:(callback,delay)=>{const id=++timerId;timers.set(id,{callback,due:clock+delay});return id;},clearTimeout:id=>timers.delete(id),
  };
  const key='mascotHook'+randomUUID().replaceAll('-','');globalThis[key]=dependencies;let runHook;
  try{({useMascotSales:runHook}=await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n`+compiled).toString('base64')));}finally{delete globalThis[key];}
  function render(){for(let turn=0;dirty&&turn<20;turn++){dirty=false;hook=0;result=runHook(props);for(const effect of effects.splice(0))effect();}assert.equal(dirty,false,'Hook effects settle');}
  async function settle(){for(let tick=0;tick<30;tick++){await Promise.resolve();render();}}
  render();await settle();
  return {requests,events,timers,group,get state(){return result;},get updatesAfterDispose(){return updatesAfterDispose;},settle,
    async respond(index,body,status=200){assert.ok(requests[index],'A request exists to respond to');requests[index].resolve(Response.json(body,{status}));await settle();},
    async focus(){dispatch(listeners,'focus');await settle();},
    async visibility(value){document.visibilityState=value?'visible':'hidden';dispatch(documentListeners,'visibilitychange');await settle();},
    async advance(ms){clock+=ms;for(const [id,timer] of [...timers])if(timer.due<=clock){timers.delete(id);timer.callback();}await settle();},
    async update(next){props={...props,...next};dirty=true;render();await settle();},
    dispose(){for(const item of hooks)item?.cleanup?.();disposed=true;group.tabs.delete(tab);},
  };
}

{
  const app=await harness();assert.equal(app.requests.length,1);const request=app.requests[0];assert.equal(request.url,'/api/mascot/status');assert.equal(request.options.method,'GET');assert.equal(request.options.cache,'no-store');assert.equal(request.options.credentials,'same-origin');assert.ok(request.options.signal instanceof AbortSignal);
  await app.respond(0,report(sale('sale-a',1000),{paidSales:25}));assert.equal(app.events.length,0,'The initial latest sale is a baseline');assert.deepEqual(app.state,{mode:'test',configured:true,paidSales:25});await app.advance(49_999);assert.equal(app.requests.length,1);await app.advance(1);assert.equal(app.requests.length,2);await app.respond(1,report(sale('sale-a',1000),{paidSales:26}));assert.equal(app.events.length,0,'A count change alone never celebrates reconciliation');
  await app.focus();await app.respond(2,report(sale('sale-b',2000),{paidSales:27}));assert.deepEqual(app.events,[{...sale('sale-b',2000),mode:'test'}]);await app.focus();await app.respond(3,report(sale('sale-b',2000),{paidSales:27}));assert.equal(app.events.length,1,'The same sale emits once');
  await app.focus();await app.respond(4,report(sale('sale-a',1000),{paidSales:26}));await app.focus();await app.respond(5,report(sale('sale-b',2000),{paidSales:27}));assert.equal(app.events.length,1,'Refund regression and later reconciliation do not replay a sale');
  const latest=[];await app.update({onSale:value=>latest.push(value)});await app.focus();await app.respond(6,report(sale('sale-c',2000)));assert.deepEqual(latest,[{...sale('sale-c',2000),mode:'test'}],'A stable tie-break and current callback handle sales paid in the same millisecond');
  await app.focus();await app.respond(7,report(sale('sale-z',9000),{mode:'live'}));assert.equal(latest.length,1,'Switching payment mode establishes a fresh baseline');await app.focus();await app.respond(8,report(sale('other-z',10_000),{mode:'live',ownerKey:'opaque-owner-b'}));assert.equal(latest.length,1,'Switching owner establishes a separate baseline');app.dispose();assert.equal(app.timers.size,0);
}
{
  const group=browserGroup(),first=await harness({group});await first.respond(0,report(sale('sale-a',1000)));first.dispose();const returning=await harness({group});await returning.respond(0,report(sale('sale-b',2000)));assert.equal(returning.events.length,0,'Remounts do not celebrate purchases made while away');returning.dispose();
  const blocked=await harness({blockedStorage:true});await blocked.respond(0,report(null));await blocked.focus();await blocked.respond(1,report(sale('new-sale',3000)));await blocked.focus();await blocked.respond(2,report(sale('new-sale',3000)));assert.equal(blocked.events.length,1,'Storage privacy settings retain in-memory deduplication');blocked.dispose();
}
{
  const app=await harness({visible:false});assert.equal(app.requests.length,0);assert.equal(app.timers.size,0);await app.focus();assert.equal(app.requests.length,0);await app.visibility(true);await app.respond(0,report(sale('baseline',1000)));await app.focus();const pending=app.requests[1];await app.visibility(false);assert.equal(pending.options.signal.aborted,true);await app.respond(1,report(sale('stale-hidden-sale',2000)));assert.equal(app.events.length,0);assert.equal(app.timers.size,0);await app.advance(100_000);assert.equal(app.requests.length,2);await app.visibility(true);await app.respond(2,report(sale('visible-sale',3000)));assert.equal(app.events.length,1,'A visible mounted page catches a genuine new latest sale');await app.focus();const unmounted=app.requests[3];app.dispose();assert.equal(unmounted.options.signal.aborted,true);await app.respond(3,report(sale('late-sale',4000)));assert.equal(app.events.length,1);assert.equal(app.updatesAfterDispose,0,'Late responses cannot update an unmounted hook');
}
{
  const unauthorized=await harness();await unauthorized.respond(0,{error:'Sign in' },401);assert.equal(unauthorized.timers.size,0);await unauthorized.focus();await unauthorized.advance(100_000);assert.equal(unauthorized.requests.length,1,'Unauthorized polling stops without a redirect');unauthorized.dispose();
  const transient=await harness();await transient.respond(0,{error:'Unavailable'},503);await transient.advance(50_000);await transient.respond(1,report(sale('baseline',1000)));assert.equal(transient.events.length,0);await transient.focus();await transient.respond(2,{ownerKey:'invalid',mode:'test',configured:true,paidSales:2,latestSale:{id:'bad',paidAt:2000,amount:1900,currency:'<script>'}});assert.equal(transient.events.length,0,'Malformed status cannot trigger a celebration');transient.dispose();
  const disabled=await harness({enabled:false});assert.equal(disabled.requests.length,0);disabled.dispose();
}
{
  const group=browserGroup(),a=await harness({group}),b=await harness({group});await a.respond(0,report(sale('baseline',1000)));await b.respond(0,report(sale('baseline',1000)));await a.focus();await b.focus();a.requests[1].resolve(Response.json(report(sale('shared-sale',2000))));b.requests[1].resolve(Response.json(report(sale('shared-sale',2000))));await Promise.all([a.settle(),b.settle()]);assert.equal(a.events.length+b.events.length,1,'Simultaneous tabs share a sale cursor and browser lock');a.dispose();b.dispose();
}
{
  const group=browserGroup(),open=await harness({group});await open.respond(0,report(sale('baseline',1000)));const returning=await harness({group});await returning.respond(0,report(sale('new-sale',2000)));assert.equal(returning.events.length,0);await open.focus();await open.respond(1,report(sale('new-sale',2000)));assert.equal(open.events.length,1,'A newly opened tab does not consume the existing tab’s genuine sale notification');open.dispose();returning.dispose();
}
{
  const group=browserGroup(),open=await harness({group});await open.respond(0,report(null));assert.equal(group.values.size,0);
  const returning=await harness({group});await returning.respond(0,report(sale('first-ever-sale',1000)));assert.equal(returning.events.length,0,'A new tab treats the first sale as its historical baseline');
  assert.equal(group.values.size,0,'A baseline does not claim a sale on behalf of an already-open tab');
  await open.focus();await open.respond(1,report(sale('first-ever-sale',1000)));assert.deepEqual(open.events,[{...sale('first-ever-sale',1000),mode:'test'}],'The existing empty-baseline tab celebrates its genuine first sale');
  await returning.focus();await returning.respond(1,report(sale('first-ever-sale',1000)));assert.equal(returning.events.length,0,'The historical baseline stays quiet after another tab celebrates');
  open.dispose();returning.dispose();
}
{
  const group=browserGroup();group.navigator={};const a=await harness({group}),b=await harness({group});await a.respond(0,report(sale('baseline',1000)));await b.respond(0,report(sale('baseline',1000)));await a.focus();await a.respond(1,report(sale('shared-sale',2000)));await b.focus();await b.respond(1,report(sale('shared-sale',2000)));assert.equal(a.events.length+b.events.length,1,'Storage events deduplicate ordinary cross-tab delivery without Web Locks');a.dispose();b.dispose();
}
console.log('Mascot sales hook passed: mount baselines, owner/mode isolation, exact sale deduplication, refund/count reconciliation, visible polling/focus, abort/unmount safety, unauthorized stop, callback updates and cross-tab locking.');
