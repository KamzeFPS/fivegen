import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

function handler(path,parent,name,scope){
 const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let component,found;
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===parent)component=node;ts.forEachChild(node,visit);}visit(source);
 function find(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,find);}find(component);assert.ok(found,`${parent}.${name}`);
 const code=ts.transpileModule(found.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(scope),`${code};return ${name};`)(...Object.values(scope));
}
function fixture(kind,unlimited=false){
 const state={quote:null,error:'',notice:'',posts:[],saves:0,rights:true,mode:'append',cost:10,changed:0,fail:false},running={current:false},mounted={current:true};
 const path={page:'app/page-copy-suggestion.tsx',voice:'app/creator-voice-library.tsx',vsl:'app/growth-vsl.tsx'}[kind],parent={page:'PageCopySuggestion',voice:'VoiceWorkspace',vsl:'GrowthVSLWorkspace'}[kind];
 const stateScope=()=>({unlimited,cost:state.cost,busy:'',running,mounted,aiReady:true,disabled:false,historyBusy:false,recordingUploadBusy:false,contextDirty:false,product:{id:'product'},setError:value=>state.error=value,setNotice:value=>state.notice=value,setBusy(){},onBusyChange(){},setGenerationConsent:value=>state.quote=value,setTranscriptionConsent:value=>state.quote=value,generationConsent:state.quote,transcriptionConsent:state.quote,dirty:false,crypto,missingGrowthAnswers:()=>[],setProposal(){},setApplyMode(){},updatedCallback:{current(){}},callbacks:{current:{onUpdate(){}}},accept:()=>true,
  productId:'product',pageId:'sales-page',pageUpdatedAt:3,current:{headline:'My real offer '+state.changed,heroDescription:'My explanation'},instruction:'Make the headline clear',growth:{brief:{audience:'Creators '+state.changed},assets:null,updatedAt:3},
  draft:{id:'source',title:'My recording '+state.changed,updatedAt:4,permission:state.rights,uploadAvailable:true,uploadId:'upload'},transcriptMode:state.mode,transcriptionReady:true,
  persist:async value=>{state.saves++;return {...value,updatedAt:5};},action:async(_label,work)=>{if(running.current)return;running.current=true;try{await work();}catch(error){state.error=error.message;}finally{running.current=false;}},
  request:async(urlOrInput,options)=>{if(typeof urlOrInput==='object'){state.posts.push(urlOrInput);await Promise.resolve();if(state.fail)throw Error('Provider failed');return {result:{},spent:unlimited?0:state.cost};}if(options?.method==='POST'){state.posts.push(JSON.parse(options.body));await Promise.resolve();if(state.fail)throw Error('Provider failed');}return {source:{id:'source',updatedAt:5}};},
  fetch:async(_url,options)=>{state.posts.push(JSON.parse(options.body));await Promise.resolve();if(state.fail)throw Error('Provider failed');return Response.json({proposal:{id:'proposal'}});}
 });
 return {state,run:approved=>handler(path,parent,kind==='voice'?'transcribe':'generate',stateScope())(approved)};
}
for(const kind of ['page','voice','vsl'])for(const unlimited of [false,true]){
 const f=fixture(kind,unlimited);await f.run(false);assert.equal(f.state.posts.length,0,`${kind}: no AI before approval`);assert.equal(f.state.saves,0,`${kind}: no save before approval`);assert.equal(f.state.quote.cost,unlimited?0:10,`${kind}: exact quote including included access`);
 f.state.quote=null;await f.run(true);assert.equal(f.state.posts.length,0,`${kind}: cancelled permission cannot run`);
 f.state.changed++;await f.run(true);assert.equal(f.state.posts.length,0,`${kind}: changed inputs require a fresh quote`);assert.match(f.state.error,/changed/);
 if(!unlimited&&kind!=='voice'){f.state.cost=30;await f.run(true);assert.equal(f.state.posts.length,0,`${kind}: changed price cannot spend the old quote`);assert.equal(f.state.quote.cost,30);}
 await Promise.all([f.run(true),f.run(true)]);assert.equal(f.state.posts.length,1,`${kind}: one model request per approval despite rapid duplicate clicks`);assert.equal(f.state.posts[0].maxCredits,unlimited?0:kind==='voice'?10:30);assert.equal(f.state.quote,null,`${kind}: permission consumed after this step`);
 await f.run(false);assert.equal(f.state.posts.length,1,`${kind}: repeat generation needs another approval`);
}
{
 const f=fixture('voice');await f.run(false);f.state.mode='replace';await f.run(true);assert.equal(f.state.posts.length,0,'Changing transcription append/replace needs renewed consent');await f.run(true);assert.equal(f.state.posts[0].mode,'replace');
 const denied=fixture('voice');await denied.run(false);denied.state.rights=false;await denied.run(true);assert.equal(denied.state.posts.length,0,'Credit permission never bypasses recording rights');
}
for(const kind of ['page','voice','vsl']){const f=fixture(kind);await f.run(false);f.state.fail=true;await f.run(true);assert.equal(f.state.posts.length,1,`${kind}: errors never trigger another model call`);assert.equal(f.state.error,'Provider failed');assert.equal(f.state.quote,null,'Failed step still consumes its approval; retry needs a fresh decision');}
console.log('Journey AI consent passed: page copy, sales scripts and transcription quote exact cost, cancel without writes, reject stale inputs/prices, guard duplicates and require new approval after failures. No external calls.');
