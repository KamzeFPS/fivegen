import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import * as icons from 'lucide-react';
import {loadProductDownloadList} from './product-download-list-fixture.mjs';

function load(path,dependencies={},names){
 let source=readFileSync(path,'utf8');
 if(names){const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);source=parsed.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>names.includes(item.name.getText(parsed)))).map(node=>node.getText(parsed)).join('\n');}
 else source=source.replace(/^import[\s\S]*?;\r?\n/gm,'');
 const exports={},compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 new Function('exports',...Object.keys(dependencies),compiled+(names?names.map(name=>`\nif(typeof ${name}!=='undefined')exports.${name}=${name};`).join(''):''))(exports,...Object.values(dependencies));return exports;
}
function nodes(value){return Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(value.props.children)]:[];}
const contract=load('lib/builder-contract.ts',{},['builderTypeDetails','builderFamily','defaultBuilderDraft']);
const offer=load('lib/offer-view.ts');
const servicePresentation=load('lib/builder-publication-contract.ts',{},['builderServicePresentation','builderDeliveredStudio']);
const {simulateBuyerJourney}=load('lib/buyer-simulation.ts',{...contract,...offer,...servicePresentation});
const presentation=load('app/customer/presentation.ts');
const effects={network:0,clicks:[],blobs:[],appended:[],removed:0,timers:[],revoked:[]};
const ProductDownloadList=loadProductDownloadList({
 URL:{createObjectURL(blob){effects.blobs.push(blob);return 'blob:saved-file-'+effects.blobs.length;},revokeObjectURL(url){effects.revoked.push(url);}},
 document:{body:{appendChild(link){effects.appended.push(link);}},createElement(tag){assert.equal(tag,'a');return {click(){effects.clicks.push({href:this.href,download:this.download});},remove(){effects.removed++;}};}},
 setTimeout(callback,delay){effects.timers.push({callback,delay});},fetch(){effects.network++;throw new Error('Preview downloads must remain local.');},
});
const iconDependencies=Object.fromEntries(Object.entries(icons).filter(([name])=>/^[A-Z]/.test(name)));
let receivedBookProps,receivedGuideProps,receivedPlaybookProps,receivedMiniProps,receivedFullProps,receivedTemplateProps,receivedChallengeProps,receivedConsultingProps,receivedCommunityProps;
const dependencies={CommunityReader:props=>{receivedCommunityProps=props;return React.createElement('section',{'aria-label':'Community reader'},props.content.title);},React,...iconDependencies,ProductDownloadList,BookReader:props=>{receivedBookProps=props;return React.createElement('section',{'aria-label':'Book reader'},props.content.title);},GuideReader:props=>{receivedGuideProps=props;return React.createElement('section',{'aria-label':'Guide reader'},props.content.title);},PlaybookReader:props=>{receivedPlaybookProps=props;return React.createElement('section',{'aria-label':'Playbook reader'},props.content.title);},MiniCourseReader:props=>{receivedMiniProps=props;return React.createElement('section',{'aria-label':'Mini course reader'},props.content.title);},FullCourseReader:props=>{receivedFullProps=props;return React.createElement('section',{'aria-label':'Full course reader'},props.content.title);},TemplateKitReader:props=>{receivedTemplateProps=props;return React.createElement('section',{'aria-label':'Template kit reader'},props.content.title);},ChallengeReader:props=>{receivedChallengeProps=props;return React.createElement('section',{'aria-label':'Challenge reader'},props.content.title);},ConsultingReader:props=>{receivedConsultingProps=props;return React.createElement('section',{'aria-label':'Consulting reader'},props.content.title);},WrittenContent:()=>React.createElement('article',null,'Saved playbook reading'),PurchasedProductResources:()=>null};
const {BuyerPreviewPanel}=load('app/buyer-journey-test.tsx',dependencies,['BuyerPreviewPanel']);
const originals=['Human-Like_AI_Video_in_10_Minutes.pdf','Seedance Prompter skill.zip','Seedance Prompter.md','CINEIMAGE skill.zip','Lesson-3-Final-Assets.zip','Lesson3-ugc-video-creator.md'].map((name,index)=>({id:'original-'+index,name,mime:name.endsWith('.pdf')?'application/pdf':name.endsWith('.zip')?'application/zip':'text/markdown',size:2048+index,status:'completed'}));
const draft=contract.defaultBuilderDraft('playbook');
Object.assign(draft,{title:'Human-like video playbook',uploadIds:[...originals.map(file=>file.id),'incomplete-upload'],sections:[{id:'first-step',title:'Make a useful first video',body:'Saved practical teaching.'}],files:[{name:'ai_video_brief_worksheet.md',description:'Fill in your next video brief.',content:'# Exact saved worksheet\n\nAudience: readers → creators.\n'},{name:'location_prompt_helper.html',description:'Use the saved location prompts.',content:'<!doctype html><html><body>Exact saved prompts – Улаанбаатар</body></html>'}]});
const originalDraft=structuredClone(draft);
const result=structuredClone(simulateBuyerJourney({productId:'owned-product',slug:'human-like-video',draft,published:false,selling:false,mode:'test',accountReady:false,platformReady:false,emailReady:false,checks:[],automationCount:0,uploads:[...originals,{id:'unattached-upload',name:'private-unattached.pdf',mime:'application/pdf',size:1024,status:'completed'},{id:'incomplete-upload',name:'unfinished.zip',mime:'application/zip',size:1024,status:'uploading'}]}));
assert.deepEqual(draft,originalDraft,'Preparing the preview never edits the draft');
assert.deepEqual(result.preview.downloads.map(file=>file.name),originals.map(file=>file.name),'Only completed originals selected for this draft are shown');
const bookResult={...result,preview:{...result.preview,builderType:'book'}};
renderToStaticMarkup(React.createElement(BuyerPreviewPanel,{result:bookResult,compact:true}));
assert.equal(receivedBookProps.content,bookResult.preview,'Books use the dedicated reader with the exact saved snapshot');assert.equal(receivedBookProps.preview,true);assert.equal(receivedBookProps.exportBase,'/api/builder/owned-product/export');assert.deepEqual(receivedBookProps.content.downloads.map(file=>file.name),originals.map(file=>file.name));assert.deepEqual(receivedBookProps.content.files,draft.files);
const guideResult={...result,preview:{...result.preview,builderType:'guide'}},returnToEditor=()=>{};
const guideHtml=renderToStaticMarkup(React.createElement(BuyerPreviewPanel,{result:guideResult,compact:true,onBack:returnToEditor}));
assert.match(guideHtml,/aria-label="Guide reader"/);assert.equal(receivedGuideProps.content,guideResult.preview,'Guides use the dedicated step reader with the exact saved snapshot');assert.equal(receivedGuideProps.preview,true);assert.equal(receivedGuideProps.exportBase,'/api/builder/owned-product/export');assert.equal(receivedGuideProps.onBack,returnToEditor);assert.deepEqual(receivedGuideProps.content.downloads.map(file=>file.name),originals.map(file=>file.name));assert.deepEqual(receivedGuideProps.content.files,draft.files);assert.doesNotMatch(guideHtml,/Saved playbook reading|Download your files/,'The dedicated Guide reader owns its download placement without a duplicate generic reader');
const decisionGraph={startId:'inspect',nodes:[{id:'inspect',label:'Is the brief usable?',kind:'decision',choices:[{label:'Yes',to:'ready'},{label:'Needs work',to:'revise'}]},{id:'revise',label:'Revise the brief',kind:'action',choices:[{label:'Brief revised',to:'ready'}]},{id:'ready',label:'Brief ready for review',kind:'end',choices:[]}]};
const playbookResult={...result,preview:{...result.preview,builderType:'playbook',sections:result.preview.sections.map(section=>({...section,studio:{decisionGraph,playbookNodeDetails:{inspect:{body:'EXACT_SAVED_NODE_INSTRUCTIONS',uploadIds:[originals[0].id],fileNames:[draft.files[0].name]}}}}))}};
const playbookSnapshot=structuredClone(playbookResult.preview);
for(const compact of [true,false]){
 const html=renderToStaticMarkup(React.createElement(BuyerPreviewPanel,{result:playbookResult,compact,onBack:returnToEditor}));
 assert.match(html,/aria-label="Playbook reader"/);assert.equal(receivedPlaybookProps.content,playbookResult.preview,'Playbooks use the dedicated decision reader with the exact saved snapshot');assert.equal(receivedPlaybookProps.preview,true);assert.equal(receivedPlaybookProps.exportBase,'/api/builder/owned-product/export');assert.equal(receivedPlaybookProps.onBack,returnToEditor);assert.deepEqual(receivedPlaybookProps.content.sections[0].studio.decisionGraph,decisionGraph);assert.equal(receivedPlaybookProps.content.sections[0].studio.playbookNodeDetails.inspect.body,'EXACT_SAVED_NODE_INSTRUCTIONS');assert.deepEqual(receivedPlaybookProps.content.downloads.map(file=>file.name),originals.map(file=>file.name));assert.deepEqual(receivedPlaybookProps.content.files,originalDraft.files);assert.doesNotMatch(html,/Saved playbook reading|Download your files|BUYER CONTENT VIEW/,'The Playbook reader owns its focused content, path and resource placement');
}
assert.deepEqual(playbookResult.preview,playbookSnapshot,'Routing to the Playbook reader cannot edit graph nodes, file assignments or original content');
for(const type of ['mini-course','video-course']){
 const courseResult={...result,family:'course',preview:{...result.preview,builderType:type,sections:result.preview.sections.map(section=>({...section,studio:{quiz:[{question:'What is the useful result?',options:['One practical outcome','Every future feature'],correctIndex:0}],assignment:{prompt:'Submit your own reviewed first version.',required:true},courseUploadIds:[originals[0].id],courseFileNames:[originalDraft.files[0].name]}}))}},snapshot=structuredClone(courseResult.preview);
 const html=renderToStaticMarkup(React.createElement(BuyerPreviewPanel,{result:courseResult,compact:true,onBack:returnToEditor})),received=type==='mini-course'?receivedMiniProps:receivedFullProps;assert.equal(received.content,courseResult.preview,'Dedicated course readers receive the exact saved curriculum and resources');assert.equal(received.preview,true);assert.equal(received.onBack,returnToEditor);assert.equal(received.exportBase,undefined,'Course previews do not invent a PDF route or customer access');assert.deepEqual(received.content.sections,snapshot.sections);assert.deepEqual(received.content.downloads,snapshot.downloads);assert.deepEqual(received.content.files,snapshot.files);assert.doesNotMatch(html,/Saved playbook reading|Download your files|BUYER CONTENT VIEW/);assert.deepEqual(courseResult.preview,snapshot);
}
// Legacy document families retain the generic all-files-before-reading path.
for(const type of ['consulting','coaching']){
 const serviceResult={...result,family:'service',preview:{...result.preview,builderType:type,fields:{serviceScope:'FROZEN_SERVICE_SCOPE',preparation:'FROZEN_SERVICE_PREPARATION',intakePrompt:'FROZEN_BOOKING_PROMPT'},studio:{service:{sessionCount:type==='coaching'?1:3,durationMinutes:90,timezone:'Asia/Ulaanbaatar',agreement:'FROZEN_SERVICE_TERMS'}},sections:result.preview.sections}},html=renderToStaticMarkup(React.createElement(BuyerPreviewPanel,{result:serviceResult,compact:true,onBack:returnToEditor}));assert.equal(receivedConsultingProps.content,serviceResult.preview);assert.equal(receivedConsultingProps.preview,true);assert.equal(receivedConsultingProps.onBack,returnToEditor);assert.equal(receivedConsultingProps.content.studio.service.durationMinutes,90);assert.deepEqual(receivedConsultingProps.content.files,originalDraft.files);assert.deepEqual(receivedConsultingProps.content.downloads,serviceResult.preview.downloads);assert.doesNotMatch(html,/Saved playbook reading|Download your files|BUYER CONTENT VIEW/,'Consulting and Coaching use one focused client workspace without a fake sample session');
}
for(const type of ['template-kit','challenge']){
 const specialized={...result,family:type==='template-kit'?'templates':'challenge',preview:{...result.preview,builderType:type,studio:type==='template-kit'?{templates:{items:[{id:'saved-template',name:'An original template',blankFileName:originalDraft.files[0].name,exampleUploadId:originals[0].id,steps:['Use the original supplied file.']}]}}:{challenge:{allowSubmissions:true}},sections:result.preview.sections.map(section=>({...section,studio:{challengeExample:'ORIGINAL_DAY_EXAMPLE',challengeChecklist:[{id:'real-task',text:'Try the actual activity.'}],reflection:'Share what you actually tried.'}}))}},html=renderToStaticMarkup(React.createElement(BuyerPreviewPanel,{result:specialized,compact:true,onBack:returnToEditor})),received=type==='template-kit'?receivedTemplateProps:receivedChallengeProps;assert.equal(received.content,specialized.preview);assert.equal(received.preview,true);assert.equal(received.onBack,returnToEditor);assert.deepEqual(received.content.files,originalDraft.files);assert.deepEqual(received.content.downloads,specialized.preview.downloads);assert.doesNotMatch(html,/Saved playbook reading|Download your files|BUYER CONTENT VIEW/,'Dedicated kits/challenges own their clear content and resource placement');
}
{
 const communityResult={...result,family:'community',preview:{...result.preview,builderType:'community',fields:{welcome:'EXACT_SAVED_MEMBER_WELCOME',rules:'EXACT_SAVED_MEMBER_RULES'},studio:{community:{enabled:true,channels:['Introductions'],requireAgreement:true,onboarding:{introPrompt:'EXACT_SAVED_INTRO_PROMPT',introductionChannel:'Introductions',steps:[]}}}}},saved=structuredClone(communityResult.preview);
 const html=renderToStaticMarkup(React.createElement(BuyerPreviewPanel,{result:communityResult,compact:true,onBack:returnToEditor}));assert.equal(receivedCommunityProps.content,communityResult.preview,'The community home receives the exact saved onboarding and resource snapshot');assert.equal(receivedCommunityProps.preview,true);assert.equal(receivedCommunityProps.onBack,returnToEditor);assert.equal(receivedCommunityProps.exportBase,undefined);assert.equal(receivedCommunityProps.content.fields.welcome,'EXACT_SAVED_MEMBER_WELCOME');assert.equal(receivedCommunityProps.content.studio.community.onboarding.introductionChannel,'Introductions');assert.deepEqual(receivedCommunityProps.content.files,originalDraft.files);assert.deepEqual(receivedCommunityProps.content.downloads,communityResult.preview.downloads);assert.deepEqual(communityResult.preview,saved);assert.doesNotMatch(html,/Saved playbook reading|Download your files|BUYER CONTENT VIEW/,'The dedicated Community home owns member content placement');
}
for(const type of [undefined]){
 const sample={...result,family:'document',preview:{...result.preview,builderType:type}};
 const html=renderToStaticMarkup(React.createElement(BuyerPreviewPanel,{result:sample,compact:true}));
 for(const file of [...originals,...draft.files])assert.ok(html.includes(file.name),`${type} preview includes ${file.name}`);
 assert.match(html,/8 files/);assert.match(html,/Download your files/);assert.match(html,/PDF · 2 KB · Original file/);assert.match(html,/ZIP · 3 KB · Original file/);assert.match(html,/MD · 1 KB · Editable resource/);assert.match(html,/HTML · 1 KB · Editable resource/);
 assert.equal((html.match(/Download your file /g)||[]).length,6);assert.equal((html.match(/Download resource /g)||[]).length,2);
 assert.ok(html.indexOf('Download your files')<html.indexOf('Saved playbook reading'),'Downloads are visible before a long written reader');
 assert.doesNotMatch(html,/private-unattached|unfinished\.zip|\/api\/commerce\/customer/,'Owner preview cannot produce fake buyer links or leak unattached originals');
 for(const original of originals)assert.ok(html.includes(`/api/uploads/${original.id}?download=1`),'Original preview links use the authenticated owner route');
}
assert.deepEqual(result.effects,{charges:0,orders:0,contacts:0,bookings:0,emails:0,memberships:0,webhooks:0});
assert.equal(effects.network,0);assert.equal(effects.blobs.length,0,'Rendering never triggers an automatic download');

// Clicking an authored resource uses precisely the snapshot shown, even after a
// different editor state exists. HTML is downloaded rather than opened/executed.
draft.files[0].content='A different newer edit';
const previewTree=ProductDownloadList({content:result.preview,previewProductId:result.productId,family:'document'});
const buttons=nodes(previewTree).filter(node=>node.type==='button');assert.equal(buttons.length,2);
buttons[0].props.onClick();buttons[1].props.onClick();
assert.equal(await effects.blobs[0].text(),originalDraft.files[0].content);
assert.equal(await effects.blobs[1].text(),originalDraft.files[1].content);
assert.match(effects.blobs[0].type,/^text\/markdown/);assert.match(effects.blobs[1].type,/^text\/html/);
assert.deepEqual(effects.clicks.map(click=>click.download),originalDraft.files.map(file=>file.name));
assert.equal(effects.removed,2);assert.deepEqual(effects.timers.map(timer=>timer.delay),[1000,1000]);
assert.equal(effects.revoked.length,0,'Blob URLs stay available while the browser starts downloading');
effects.timers.forEach(timer=>timer.callback());assert.deepEqual(effects.revoked,['blob:saved-file-1','blob:saved-file-2']);
assert.equal(effects.network,0,'Authored preview downloads never call a purchase or mutation endpoint');
const unsafe=ProductDownloadList({content:{id:'preview-owned-product',files:[{name:'../../unsafe"\n.md',content:'safe saved content'}]},previewProductId:'owned-product'});
nodes(unsafe).find(node=>node.type==='button').props.onClick();assert.equal(effects.clicks.at(-1).download,'unsafe__.md','Saved content downloads use a safe base filename');

// Real buyers keep protected order-scoped routes and receive metadata, never
// creator-side file bodies through this shared component.
const purchased={...result.preview,id:'paid-order',files:result.preview.files.map(({name,description})=>({name,description}))};
const buyerTree=ProductDownloadList({content:purchased,family:'document'}),buyerLinks=nodes(buyerTree).filter(node=>node.type==='a');
assert.equal(buyerLinks.length,8);assert.equal(nodes(buyerTree).filter(node=>node.type==='button').length,0);
for(const original of originals)assert.ok(buyerLinks.some(link=>link.props.href===`/api/commerce/customer/paid-order/uploads/${original.id}`));
for(const file of purchased.files)assert.ok(buyerLinks.some(link=>link.props.href===`/api/commerce/customer/paid-order/files/${encodeURIComponent(file.name)}`));
assert.doesNotMatch(renderToStaticMarkup(buyerTree),/\/api\/uploads\/|Exact saved worksheet|Exact saved prompts|preview-owned-product/);
assert.equal(ProductDownloadList({content:{id:'empty',files:[]}}),null);

const {ProductHero}=load('app/customer/portal.tsx',{React,...iconDependencies,...presentation,ProductCover:()=>null,commerceMoney:amount=>'$'+(amount/100).toFixed(2)},['ProductHero']);
const heroContent={...purchased,title:result.title,format:'Playbook',builderType:'playbook',intakePrompt:'',meetingUrl:'',booking:null,slots:[]};
const hero=renderToStaticMarkup(React.createElement(ProductHero,{content:heroContent}));
assert.match(hero,/<a class="buyer-button secondary" href="#customer-downloads">[^]*?View all 8 files<\/a>/,'The buyer can discover every file from the product hero');
const singleHero=renderToStaticMarkup(React.createElement(ProductHero,{content:{...heroContent,files:[],downloads:[originals[0]]}}));assert.doesNotMatch(singleHero,/View all/);
const templatesHero=renderToStaticMarkup(React.createElement(ProductHero,{content:{...heroContent,builderType:'template-kit',format:'Template kit'}}));assert.match(templatesHero,/Get your templates/);assert.doesNotMatch(templatesHero,/View all/,'A primary jump to the file list does not need a duplicate action');
console.log('Buyer download preview passed: all six attached originals and two authored resources, exact snapshot bytes, type/size labels, safe local downloads and URL cleanup, owner and purchased link boundaries, no automatic work, and visible all-files navigation.');
