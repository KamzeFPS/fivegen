import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Execute the shipped click handlers with fake storage/provider boundaries.
// One approval must never drain the remaining product generation job.
function handler(path,parent,name,scope){
 const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let component,found;
 function findParent(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===parent)component=node;ts.forEachChild(node,findParent);}findParent(source);
 assert.ok(component,`${parent} exists`);
 function find(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,find);}find(component);
 assert.ok(found,`${parent}.${name} exists`);
 const body=ts.transpileModule(found.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function(...Object.keys(scope),`${body}; return ${name};`)(...Object.values(scope));
}
function builderFixture({mode=null,remaining=3,unlimited=false,done=false,fail=false}={}){
 const state={generation:mode?{job:{stage:0,status:'queued'},mode,allowance:{remaining}}:null,ai:{textCost:30,credits:{unlimited,products:{remaining}}},dialog:true,notice:'',posts:[],gets:0,saves:0,busy:false};
 const scope=()=>({generation:state.generation,ai:state.ai,generationUsesCredits:!unlimited&&(mode==='credits'||(mode!=='included'&&remaining===0)),stopRef:{current:false},setGenerationDialog:value=>state.dialog=value,setGeneration:value=>state.generation=value,setAI:value=>state.ai=typeof value==='function'?value(state.ai):value,setNotice:value=>state.notice=value,run:async(_label,work)=>{if(state.busy)return;state.busy=true;try{await work();}finally{state.busy=false;}},saveDraft:async()=>{state.saves++;return {product:{id:'product'},version:7};},api:async(url,payload)=>{if(!payload){state.gets++;return {job:{stage:done?5:1,status:done?'completed':'queued'},mode:mode||'included',nextStep:done?null:{label:'Write the next section'},allowance:{remaining:mode?remaining:remaining-1}};}state.posts.push({url,payload});await Promise.resolve();if(fail)throw Error('Provider unavailable');return {done,stage:done?5:1,total:5,mode:mode||'included',allowance:{remaining:mode?remaining:remaining-1}};}});
 return {state,click:()=>handler('app/product-builder.tsx','ProductBuilderWorkspace','generateProduct',scope())()};
}
for(const options of [{},{mode:'included',remaining:0},{mode:'credits',remaining:0},{mode:'credits',remaining:0,unlimited:true}]){
 const f=builderFixture(options);await f.click();assert.equal(f.state.posts.length,1,'One builder approval performs one provider-backed step');
 assert.equal(f.state.posts[0].payload.maxStepCredits,options.mode==='credits'&&!options.unlimited?30:0);
 assert.equal(f.state.posts[0].payload.action,options.mode?'step':'start');assert.equal(f.state.posts[0].payload.expectedVersion,7);
 assert.equal(f.state.dialog,true,'A saved step returns to review the next approval');assert.match(f.state.notice,/no further credits are used automatically/);
 assert.equal(f.state.gets,1,'Refresh status without advancing the job');
}
{
 const f=builderFixture({mode:'credits',remaining:0});await Promise.all([f.click(),f.click()]);assert.equal(f.state.posts.length,1,'Rapid duplicate approval cannot run a second step');
}
{
 const f=builderFixture({fail:true});await assert.rejects(f.click(),/Provider unavailable/);assert.equal(f.state.posts.length,1);assert.equal(f.state.gets,1,'Failure refreshes the recoverable job without retrying a model call');
}
{
 const f=builderFixture({done:true});await f.click();assert.equal(f.state.posts.length,1);assert.match(f.state.notice,/ready.*Review and apply/);assert.equal(f.state.generation.job.status,'completed');
}
function progressFixture({mode=null,remaining=3,unlimited=false,fail=false,done=false}={}){
 const state={cost:10,dialog:false,posts:[],prices:0,completed:0,products:[],job:null,error:'',setups:0,running:false,stepLabel:'',before:0};
 const inProgress={current:false},stop={current:false},mounted={current:true};
 function run(approved=false){
  const scope={product:{id:'product'},aiReady:true,inProgress,stop,mounted,confirmedCost:state.cost,onSetup:()=>state.setups++,setAllowance(){},setPaymentMode(){},setNextStepLabel:value=>state.stepLabel=value,setConfirmedCost:value=>state.cost=value,setCreditConfirm:value=>state.dialog=value,onBeforeGenerate:async()=>{state.before++;return true;},setRunning:value=>state.running=value,setError:value=>state.error=value,setJob:value=>state.job=typeof value==='function'?value(state.job):value,onProduct:value=>state.products.push(value),onAllowance(){},onComplete:()=>state.completed++,toast:{success(){}},request:async(url,method='GET',payload)=>{if(url==='/api/credits'){state.prices++;return {costs:{text:30}};}if(method==='GET')return {mode,allowance:{remaining,unlimited},nextStep:{label:'Write section 2: Practical exercise'}};state.posts.push({url,payload});await Promise.resolve();if(fail)throw Error('Model failed');return {done,stage:2,total:5,product:{id:'product'},mode:mode||'included',allowance:{remaining,unlimited}};}};
  return handler('app/ai-components.tsx','GenerationProgress','run',scope)(approved);
 }
 return {state,run};
}
for(const options of [{},{mode:'included',remaining:0},{mode:'credits',remaining:0},{mode:'credits',remaining:0,unlimited:true}]){
 const f=progressFixture(options);await f.run();assert.equal(f.state.posts.length,0,'Preparing the quote never generates');assert.equal(f.state.before,0,'No save hook runs before approval');assert.equal(f.state.dialog,true);assert.equal(f.state.stepLabel,'Write section 2: Practical exercise');
 const paid=options.mode==='credits'&&!options.unlimited;assert.equal(f.state.cost,paid?30:0,'Included and unlimited steps explicitly quote zero');
 await f.run(true);assert.equal(f.state.posts.length,1,'One legacy product approval performs one step');assert.equal(f.state.posts[0].payload.maxStepCredits,paid?30:0);assert.equal(f.state.job.status,'queued');assert.equal(f.state.completed,0);
 await f.run();assert.equal(f.state.posts.length,1,'The next step requires fresh approval');assert.equal(f.state.dialog,true);
}
{
 const f=progressFixture({mode:'credits',remaining:0});await f.run();await Promise.all([f.run(true),f.run(true)]);assert.equal(f.state.posts.length,1,'Duplicate legacy permission is guarded');
}
{
 const f=progressFixture({fail:true});await f.run();await f.run(true);assert.equal(f.state.posts.length,1);assert.equal(f.state.error,'Model failed');assert.equal(f.state.running,false);
}
{
 const f=progressFixture({done:true});await f.run();await f.run(true);assert.equal(f.state.posts.length,1);assert.equal(f.state.completed,1);assert.equal(f.state.job.status,'completed');
}
console.log('Generation step consent tests passed: one model call per approval, explicit zero-credit quotes, safe duplicates and failure recovery.');
