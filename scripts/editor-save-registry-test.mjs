import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import * as icons from 'lucide-react';
function load(path,deps={}){const source=readFileSync(path,'utf8').replace(/^import[^\n]*\n/gm,'');const exports={};new Function('exports',...Object.keys(deps),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText)(exports,...Object.values(deps));return exports;}
const {createEditorSaveRegistry}=load('lib/editor-save-registry.ts');
const registry=createEditorSaveRegistry(),calls=[];let revision=1,failed=true;
const unregisterTool=registry.register(Symbol(),()=>({label:'Campaign drafts',dirty:true,busy:false,save:async()=>{calls.push(`campaign:${revision}`);return !failed;},priority:20}));
registry.register(Symbol(),()=>({label:'Reviewed source selection',dirty:true,busy:false,save:async()=>{calls.push('sources');revision=2;return true;},priority:10}));
registry.register(Symbol(),()=>({label:'Product content',dirty:true,busy:false,save:async()=>{calls.push('product');return true;},priority:30}));
let result=await registry.saveAll();assert.equal(result.ok,false);assert.match(result.message,/Campaign drafts|campaign drafts/);assert.deepEqual(calls,['sources','campaign:2'],'A failure retains navigation and never runs following saves; content sees the latest context revision');
failed=false;calls.length=0;assert.equal((await registry.saveAll()).ok,true);assert.deepEqual(calls,['sources','campaign:2','product']);unregisterTool();assert.equal(registry.snapshot().length,2,'Unmounted product handlers cannot save after changing products');
const busy=createEditorSaveRegistry();busy.register(Symbol(),()=>({label:'Upload',dirty:true,busy:true,save:async()=>{throw Error('Busy operation must not save');}}));assert.equal((await busy.saveAll()).ok,false);
let release;const inFlight=createEditorSaveRegistry();inFlight.register(Symbol(),()=>({label:'VSL',dirty:true,busy:false,save:()=>new Promise(done=>{release=done;})}));const first=inFlight.saveAll();assert.equal(inFlight.isBusy(),true);assert.equal((await inFlight.saveAll()).ok,false,'Duplicate Save & continue clicks cannot issue overlapping mutations');release(true);assert.equal((await first).ok,true);assert.equal(inFlight.isBusy(),false);
const throwing=createEditorSaveRegistry();throwing.register(Symbol(),()=>({label:'Voice source',dirty:true,busy:false,save:async()=>{throw Error('This source changed in another tab.');}}));assert.deepEqual(await throwing.saveAll(),{ok:false,label:'Voice source',message:'This source changed in another tab.'});

// Exercise the actual provider dialog: no navigation before successful save,
// Keep editing retains drafts, and a conflict leaves the same action pending.
const uiRegistry=createEditorSaveRegistry();let saveOk=false,edited=true,navigated=0;
uiRegistry.register(Symbol(),()=>({label:'Campaign drafts',dirty:edited,busy:false,save:async()=>{if(saveOk)edited=false;return saveOk;}}));
let state=[uiRegistry,null,false,''],index=0;
const ui=load('app/editor-save-registry.tsx',{React,Loader2:icons.Loader2,createEditorSaveRegistry,createContext:React.createContext,useContext:()=>null,useLayoutEffect(){},useCallback:fn=>fn,useRef:value=>({current:value}),useState:initial=>{const i=index++;return[state[i]??initial,value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},...Object.fromEntries(['Dialog','DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle'].map(name=>[name,name]))});
function all(node){return Array.isArray(node)?node.flatMap(all):React.isValidElement(node)?[node,...all(node.props.children)]:[];}
function text(node){return Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):typeof node==='string'?node:'';}
function provider(){index=0;return ui.EditorSaveProvider({children:'workspace'});}
let view=provider();view.props.value.requestNavigation(()=>navigated++);view=provider();assert.equal(navigated,0);assert.equal(all(view).find(node=>node.type==='Dialog').props.open,true);
assert.equal(all(view).some(node=>node.type==='button'&&/Discard/.test(text(node))),false);
all(view).find(node=>node.type==='button'&&text(node)==='Keep editing').props.onClick();assert.equal(edited,true);assert.equal(navigated,0);assert.equal(state[1],null);
view=provider();view.props.value.requestNavigation(()=>navigated++);view=provider();all(view).find(node=>node.type==='button'&&text(node)==='Save & continue').props.onClick();await new Promise(done=>setImmediate(done));view=provider();assert.equal(navigated,0);assert.equal(edited,true);assert.match(text(view),/Couldn’t save campaign drafts/);assert.equal(all(view).find(node=>node.type==='Dialog').props.open,true);
saveOk=true;all(view).find(node=>node.type==='button'&&text(node)==='Save & continue').props.onClick();await new Promise(done=>setImmediate(done));assert.equal(navigated,1);assert.equal(edited,false);assert.equal(state[1],null);

const product={id:'product-one',title:'Original course',description:'My real teaching',audience:'Creators',slug:'course'};
const growth={updatedAt:7,brief:{icp:'My audience'},assets:{vsl:'Original words',followUp:'Hi',landing:{headline:'Title',subheadline:'',body:'Body',benefits:[],ctaLabel:'Join',thankYou:'Thanks'}}};
const campaign={id:'product-one',destination:null,createdAt:1,isDefault:true,updatedAt:8,title:'Launch',goal:'Teach',items:[],sourceIds:[],sourceRevisions:[]};
const source={id:'source-one',productId:product.id,title:'My story',kind:'story',transcript:'My own words',evidence:'',uploadId:null,uploadAvailable:false,permission:true,approved:false,updatedAt:9};
const draft={senderName:'My studio',replyTo:'me@example.com',postalAddress:'My business address',steps:[{id:'step-one',kind:'nurture',delayHours:24,subject:'Hello',body:'Original email'}]};
const workspace={destinations:[],origin:'https://fivegen.test',manualTemplate:{subject:'',body:'',revision:0,legacy:false},sequences:[{trigger:'lead',revision:3,draft,status:'draft',approvedRevision:null}],logs:[],counts:{},readiness:{ready:false,message:'Provider setup needed'}};
const context={profile:{enabled:true,approved:true},sources:[],selection:{useProfile:false,sourceIds:[],updatedAt:10}};
const offer={problem:'Problem',question:'Question',a:{title:'A',audience:'Creators',outcome:'Learn',includes:'Guide',price:10,currency:'usd'},b:{title:'B',audience:'Creators',outcome:'Learn',includes:'Guide',price:20,currency:'usd'}};
const lab={draft:offer,revision:4,status:'draft',responses:[],responseCount:0,totalResponses:0,visitors:0,publishedRevision:0,preferenceCounts:{a:0,b:0,neither:0}};
const fixtures=[
 ['app/growth-vsl.tsx','GrowthVSL',[growth,'original','','','',false,false,false,0],'/api/products/product-one/growth','PATCH','VSL brief and script',growth],
 ['app/campaign-studio.tsx','CampaignStudio',['',[],[],'',campaign,[],'original','','','',0,'drafts',null,false,false,false,'append'],'/api/products/product-one/campaigns','PATCH','Campaign drafts',{campaign,sources:[]}],
 ['app/creator-voice-library.tsx','CreatorVoiceLibrary',[[source],source,'original','','','',false,0,false,false,'append'],'/api/voice/source-one','PATCH','Creator voice source',{source,sources:[source]}],
 ['app/automation-studio.tsx','AutomationStudio',['sequence',false,false,'','','',workspace,'lead',draft,'original','','','',0,0,null,false,''],'/api/automations?productId=product-one','POST','Email sequence draft',workspace],
 ['app/creator-context-picker.tsx','CreatorContextPicker',[context,{...context.selection,useProfile:true},false,'','',0],'/api/builder/product-one/context','PUT','Reviewed source selection',{...context,selection:{useProfile:true,sourceIds:[],updatedAt:11}}],
 ['app/offer-lab.tsx','OfferLab',[lab,{...offer,problem:'Edited problem'},'','','',null],'/api/products/product-one/offer-lab','PATCH','Offer research draft',{lab}],
];
// Funnel saves both copy and the separate private video draft, never its live snapshot.
let funnelCursor=0;const funnelSaves=[],funnelMutations=[],funnelValues=[growth,'original',null,[],'my-private-video','',0,false,false,false,false,'',''];
const funnelModule=load('app/growth-funnel-panel.tsx',{React,...Object.fromEntries(['ArrowUpRight','Check','Copy','Eye','Film','Globe','Loader2','Save','Upload'].map(name=>[name,icons[name]])),useState:initial=>{const i=funnelCursor++;return[funnelValues[i]??initial,()=>{}];},useEffect(){},useRegisterEditorSave:entry=>funnelSaves.push(entry)});
const funnelTree=funnelModule.GrowthFunnelPanel({product});funnelTree.type(funnelTree.props);assert.equal(funnelSaves[0].label,'Funnel copy and video draft');
const previousFetch=globalThis.fetch,previousWindow=globalThis.window;
try{
 globalThis.window={dispatchEvent(){}};
 globalThis.fetch=async(path,options)=>{funnelMutations.push({path,method:options.method,body:JSON.parse(options.body)});return Response.json(path.endsWith('/growth')?{growth}:{videoDraft:{creatorVslUploadId:'my-private-video',updatedAt:12}});};
 assert.equal(await funnelSaves[0].save(),true);assert.deepEqual(funnelMutations.map(item=>item.method),['PATCH','PATCH']);assert.equal(funnelMutations[1].body.creatorVslUploadId,'my-private-video');assert.ok(funnelMutations.every(item=>item.method!=='POST'),'Funnel navigation cannot publish its draft selection');

 for(const [path,name,values,url,method,label,response] of fixtures){
  let cursor=0;const saves=[],mutations=[];const dependencies={React,...Object.fromEntries(['ArrowRight','Check','Clipboard','Loader2','Mic','Save','Sparkles','CalendarDays','Download','Plus','Trash2','FileText','Upload','ArrowDown','ArrowUp','Mail','Pause','Play','RefreshCw','FlaskConical','ArrowUpRight','Copy'].map(name=>[name,icons[name]])),useState:initial=>{const i=cursor++;return[i<values.length?values[i]:typeof initial==='function'?initial():initial,()=>{}];},useEffect(){},useLayoutEffect(){},useRef:initial=>({current:initial}),useEditorSaveRegistry:()=>null,useRegisterEditorSave:entry=>saves.push(entry),SalesRecordingPicker:()=>null,PageExperimentStudio:()=>null,CreatorContextPicker:()=>null,MarketingVersionHistory:()=>null,TrackedShareLinks:()=>null,CampaignEmailHandoff:()=>null,growthQuestions:[],missingGrowthAnswers:()=>[],campaignChannels:[],campaignStatusLabels:{},channelLabels:{},voiceKinds:[],voiceLabels:{story:'Story'},voiceSourceHealth:()=>({label:'Draft'}),automationKinds:[],automationBlueprints:[],relativeWait:()=>'',renderAutomationText:text=>text,offerEvidenceSummary:()=>({state:'Early feedback',threshold:30,limitation:'Directional'}),offerPrice:()=>'$10',offerReadiness:{},initialOfferStudy:()=>offer};
  const module=load(path,dependencies),wrapped=module[name](name==='CreatorContextPicker'?{productId:product.id}:{product,aiReady:false,cost:10,unlimited:false});if(name!=='CreatorContextPicker')wrapped.type(wrapped.props);
  const save=saves.find(entry=>entry.label===label);assert.ok(save,path+' exposes its real draft handler');assert.equal(save.dirty,true,name+' edited draft is dirty');assert.equal(save.busy,false,name+' is idle');
  globalThis.fetch=async(path,options)=>{mutations.push({path,options,body:JSON.parse(options.body)});return Response.json(name==='GrowthVSL'?{growth:response}:response);};
  assert.equal(await save.save(),true,path+' acknowledges only a successful real save');assert.equal(mutations.length,1);assert.equal(mutations[0].path,url);assert.equal(mutations[0].options.method,method);
  if(name==='AutomationStudio')assert.equal(mutations[0].body.action,'save','Save & continue never activates or sends an email');
  if(name==='OfferLab')assert.equal(mutations[0].body.action,'save','Save & continue never publishes a survey');
  assert.ok(!/generate|publish|checkout|transcribe/.test(mutations[0].path),'Navigation never starts an AI, publication or payment mutation');
  globalThis.fetch=async()=>Response.json({error:'Changed in another tab. Keep your draft.'},{status:409});assert.equal(await save.save(),false,path+' rejects conflicts without pretending the draft was saved');
  if(name==='CreatorContextPicker'){cursor=0;values[3]='Conflict: selection changed';const retryTree=module[name]({productId:product.id}),retries=[];globalThis.fetch=async(path,options)=>{retries.push(options.method);return Response.json({error:'Still stale'},{status:409});};all(retryTree).find(node=>node.type==='button'&&text(node)==='Retry save').props.onClick();await new Promise(done=>setImmediate(done));assert.deepEqual(retries,['PUT'],'Retrying a failed context save preserves the local selection instead of reloading over it');}

 }
}finally{globalThis.fetch=previousFetch;globalThis.window=previousWindow;}
console.log('Editor save registry passed: sequenced real context/tool draft saves, latest revisions, failure/conflict retention, busy and duplicate protection, product unregistration, and no publication/send/AI/payment effects.');
