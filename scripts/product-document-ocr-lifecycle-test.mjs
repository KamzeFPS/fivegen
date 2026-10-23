import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Delay worker startup and termination deliberately. The actual OCR pixel
// roundtrip is covered separately by product-document-test.mjs.
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};},tick=()=>new Promise(done=>setImmediate(done));
class ProductDocumentError extends Error{constructor(message,status=400){super(message);this.status=status;}}
let startup,termination,terminateCalls=0;
const worker={setParameters:async()=>{},terminate:()=>{terminateCalls++;return termination.promise;}};
const scope={ProductDocumentError,createRequire:()=>name=>name==='tesseract.js'?{createWorker:()=>startup.promise}:name==='@napi-rs/canvas'?{}:{langPath:'local',gzip:true}};
const source=readFileSync('lib/product-document-ocr.ts','utf8').replace(/^import[^\n]*\n/gm,'').replace('import.meta.url',"'file:///synthetic/ocr.mjs'"),fixtureModule={};
new Function('exports',...Object.keys(scope),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(fixtureModule,...Object.values(scope));
startup=deferred();termination=deferred();const creating=fixtureModule.createDocumentOcr('eng');await tick();startup.resolve(worker);const ready=await creating;assert.equal(fixtureModule.documentOcrBusy(),true);const closing=ready.close();await tick();assert.equal(terminateCalls,1);assert.equal(fixtureModule.documentOcrBusy(),true,'The OCR slot remains reserved while its worker is terminating');await assert.rejects(fixtureModule.createDocumentOcr('mon'),error=>error.status===429);assert.equal(ready.close(),closing,'Repeated close calls share the same cleanup');termination.resolve();await closing;assert.equal(fixtureModule.documentOcrBusy(),false);
startup=deferred();termination=deferred();const abort=new AbortController(),cancelled=fixtureModule.createDocumentOcr('eng',abort.signal);await tick();abort.abort();await assert.rejects(cancelled,error=>error.status===499);assert.equal(fixtureModule.documentOcrBusy(),true,'Cancelled startup retains its slot until the delayed worker can be stopped');await assert.rejects(fixtureModule.createDocumentOcr('rus'),error=>error.status===429);startup.resolve(worker);await tick();assert.equal(terminateCalls,2);assert.equal(fixtureModule.documentOcrBusy(),true);termination.resolve();await tick();assert.equal(fixtureModule.documentOcrBusy(),false,'The slot is released after initialization and termination both settle');
console.log('OCR lifecycle passed: one worker slot survives delayed startup, cancellation, delayed termination, and idempotent close.');
