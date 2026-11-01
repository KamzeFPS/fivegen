import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import React from 'react';
import ts from 'typescript';
import * as icons from 'lucide-react';
import {loadStudioMarkdownFixture} from './product-studio-fixture-deps.mjs';
import {loadProductDownloadList} from './product-download-list-fixture.mjs';
const ProductDownloadList=loadProductDownloadList();
const {renderStudioMarkdown}=await loadStudioMarkdownFixture();
const writtenKey='writtenFixture'+randomUUID().replaceAll('-','');
globalThis[writtenKey]={React,renderStudioMarkdown,...Object.fromEntries(['ArrowRight','BookOpen','Check','ChevronDown','Clock3','ListChecks'].map(name=>[name,icons[name]]))};
const writtenSource=readFileSync('app/customer/written-content.tsx','utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');
const {WrittenContent}=await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(globalThis[writtenKey]).join(',')}}=globalThis.${writtenKey};\n`+ts.transpileModule(writtenSource,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText).toString('base64'));
delete globalThis[writtenKey];

const presentationCode=ts.transpileModule(readFileSync('app/customer/presentation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const presentation=await import('data:text/javascript;base64,'+Buffer.from(presentationCode).toString('base64'));

process.on('uncaughtException',error=>{console.error(String(error.stack||error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'[fixture module]'));process.exitCode=1;});
// Run the shipped component's effects and event callbacks with a deterministic
// hook/fetch harness. These fixtures never touch Stripe, identities or a database.
const source = readFileSync('app/customer/portal.tsx', 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
const componentCode = ts.transpileModule(source, { compilerOptions:{ module:ts.ModuleKind.ES2022, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.React } }).outputText;
const sameDeps = (before, after) => before && after && before.length === after.length && before.every((value,index) => Object.is(value, after[index]));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function nodes(value) { return Array.isArray(value) ? value.flatMap(nodes) : React.isValidElement(value) ? [value, ...nodes(value.props.children)] : []; }
function text(value) { return Array.isArray(value) ? value.map(text).join(' ') : React.isValidElement(value) ? value.props.dangerouslySetInnerHTML?.__html?.replace(/<[^>]*>/g,' ')||text(value.props.children) : value == null || typeof value === 'boolean' ? '' : String(value); }

async function harness(search = '') {
  const browserLocation={search,href:'https://www.fivegen.ai/customer'+search};
  const hooks = [], pendingEffects = [], requests = [];
  let cursor = 0, dirty = true, tree, Component, disposed = false, updatesAfterDispose = 0;
  const useState = initial => {
    const index = cursor++;
    if (!hooks[index]) hooks[index] = { value:typeof initial === 'function' ? initial() : initial };
    return [hooks[index].value, next => {
      if (disposed) updatesAfterDispose++;
      const value = typeof next === 'function' ? next(hooks[index].value) : next;
      if (!Object.is(value, hooks[index].value)) { hooks[index].value = value; dirty = true; }
    }];
  };
  const useRef = initial => { const index = cursor++; return (hooks[index] ||= { current:initial }); };
  const useCallback = (callback, deps) => { const index = cursor++, previous = hooks[index]; if (!previous || !sameDeps(previous.deps,deps)) hooks[index] = { value:callback, deps }; return hooks[index].value; };
  const useEffect = (callback, deps) => {
    const index = cursor++, previous = hooks[index];
    if (!previous || !sameDeps(previous.deps,deps)) {
      hooks[index] = { deps, cleanup:previous?.cleanup };
      pendingEffects.push(() => { hooks[index].cleanup?.(); hooks[index].cleanup = callback(); });
    }
  };
  const dependencies = {
    ...Object.fromEntries(['ArrowDownToLine','ArrowLeft','ArrowRight','BookOpen','CalendarDays','CheckCircle2','ChevronDown','Clock3','FileText','GraduationCap','Layers','LockKeyhole','Play','Users'].map(name=>[name,icons[name]])),...presentation,renderStudioMarkdown,CustomerLearning:()=>null,CustomerCommunity:'customer-community',CustomerService:'customer-service',PurchasedProductResources:()=>null,ProductReminders:'product-reminders',ProductPushReminders:'product-push-reminders',ProductFulfillment:()=>null,ProductUpdateNotice:'product-update-notice',TeamContent:'team-content',WrittenContent,BuyerSubscription:()=>null,
    BookReader:({content})=>React.createElement('section',{'aria-label':'Book reader'},content.title),GuideReader:'guide-reader',PlaybookReader:'playbook-reader',MiniCourseReader:'mini-course-reader',FullCourseReader:'full-course-reader',TemplateKitReader:'template-kit-reader',ChallengeReader:'challenge-reader',ConsultingReader:'consulting-reader',CommunityReader:'community-reader',ProductDownloadList,WorkspaceExample:'workspace-example',PurchaseRecovery:'purchase-recovery',PurchaseHelp:'purchase-help',Dialog:()=>null,DialogContent:()=>null,DialogHeader:()=>null,DialogTitle:()=>null,DialogDescription:()=>null,DialogFooter:()=>null,
    React, useState, useRef, useCallback, useEffect, Link:'a', AppearanceControl:()=>null,Brand:()=>React.createElement('span',null,'FiveGen'), location:browserLocation,
    window:{location:browserLocation,history:{replaceState(_state,_title,url){browserLocation.href=String(url);browserLocation.search=new URL(String(url)).search;}}},
    commerceMoney:amount => `$${(amount / 100).toFixed(2)}`,
    isConsulting:format => format === 'Coaching session',
    commerceResponse:async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; },
    fetch:(url,options) => { const request = { url, options, ...deferred() }; requests.push(request); return request.promise; },
  };
  const key = `customerPortalQa${randomUUID().replaceAll('-','')}`;
  globalThis[key] = dependencies;
  const loaded = await import('data:text/javascript;base64,' + Buffer.from(`const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n${componentCode}`).toString('base64'));
  delete globalThis[key]; Component = loaded.CustomerPortal;
  function expandWritten(value){if(Array.isArray(value))return value.map(expandWritten);if(!React.isValidElement(value))return value;if(value.type===WrittenContent||value.type===ProductDownloadList)return expandWritten(value.type(value.props));return value.props.children===undefined?value:React.cloneElement(value,{children:expandWritten(value.props.children)});}
  function render() {
    for (let attempt = 0; dirty && attempt < 30; attempt++) {
      dirty = false; cursor = 0; tree = expandWritten(Component());
      for (const effect of pendingEffects.splice(0)) effect();
    }
    assert.equal(dirty,false,'Component rendering settles');
  }
  async function settle() { for (let tick = 0; tick < 12; tick++) { await Promise.resolve(); render(); } }
  render();
  return {
    requests,
    get tree() { return tree; },
    get text() { return text(tree); },
    button(label) { const found = nodes(tree).find(node => node.type === 'button' && text(node).includes(label)); assert.ok(found,`Button exists: ${label}`); return found; },
    find(type) { return nodes(tree).filter(node => node.type === type); },
    async click(label) { this.button(label).props.onClick(); render(); await settle(); },
    async respond(index,data,status=200) { requests[index].resolve(Response.json(data,{status})); await settle(); },
    render, settle,
    dispose() { for (const hook of hooks) hook?.cleanup?.(); disposed = true; },
    get updatesAfterDispose() { return updatesAfterDispose; },
  };
}

const paidA = { id:'paid-a', title:'My purchased book', status:'paid', amount:100, currency:'usd', mode:'live' };
const paidB = { ...paidA, id:'paid-b', title:'My purchased course' };
const pending = { ...paidA, id:'pending-order', status:'pending', amount:1200 };
const content = (id = 'paid-a', extra = {}) => ({
  id, title:id === 'paid-a' ? 'My purchased book' : 'My purchased course', format:'Book / Ebook',
  sections:[{ id:'chapter-1', title:'Day 1', body:`Private purchased content for ${id}` }],
  files:[{ name:'workbook.md', description:'An editable workbook' }],
  downloads:[{ id:'original-upload', name:'original.pdf', mime:'application/pdf', size:1200 }],
  intakePrompt:'', meetingUrl:'', booking:null, slots:[], ...extra,
});

// An empty buyer library keeps purchase recovery primary. The reversible
// shared illustration does not manufacture a paid order or resource request.
{
 const app=await harness();await app.respond(0,{orders:[]});
 const recovery=app.find('a').find(link=>text(link).includes('Find my purchases'));
 assert.ok(recovery);assert.equal(recovery.props.className,'buyer-button primary');assert.match(recovery.props.href,/signin-with-chatgpt/);
 const sample=app.find('workspace-example');assert.equal(sample.length,1);assert.equal(sample[0].props.kind,'library');
 assert.equal(app.requests.length,1,'No sample purchase or content is fetched for the empty library');
 assert.match(app.text,/Your library is waiting/);app.dispose();
 const failed=await harness();await failed.respond(0,{error:'Purchases could not load.'},503);
 assert.equal(failed.find('workspace-example').length,0,'A loading failure is not misrepresented as an empty library');failed.dispose();
}

// The exact report: a paid book plus an abandoned pending attempt. Both the
// plain library URL and a pending checkout return must open the existing book.
for (const search of ['', '?order=pending-order']) {
  const app = await harness(search);
  await app.respond(0,{orders:[paidA,pending], paymentStatusError:search ? 'Still checking your latest payment.' : undefined});
  assert.equal(app.requests[1].url,'/api/commerce/customer/paid-a');
  assert.match(app.text,/Opening your product/);assert.equal(app.find('workspace-example').length,0,'The sample never replaces a real purchase');
  assert.doesNotMatch(app.text,/Select a paid product/);
  await app.respond(1,content());
  assert.match(app.text,/Private purchased content for paid-a/);
  assert.equal(app.find('a').find(link => text(link).includes('original.pdf')).props.href,'/api/commerce/customer/paid-a/uploads/original-upload');
  assert.equal(app.find('a').find(link => text(link).includes('workbook.md')).props.href,'/api/commerce/customer/paid-a/files/workbook.md');
  assert.match(app.text,/Download your files/);assert.match(app.text,/Contents/,'Purchased original files and online reading are both available');
  const otherOrders=app.find('details').find(node=>node.props.className==='customer-other-orders');
  assert.equal(otherOrders.props.open,false,'Unpaid orders do not crowd the paid library');
  assert.ok(app.find('section').some(node=>node.props['aria-label']==='Online reader'),'Purchased chapters are immediately readable');
  assert.equal(app.button('Viewing product').props['aria-pressed'],true);
  await app.click('Viewing product');
  assert.match(app.text,/Private purchased content for paid-a/,'Clicking the already open purchase never clears it');
  assert.equal(app.requests.length,2);
  await app.click('Check payment status');
  assert.equal(app.requests[2].url,'/api/commerce/customer?order=pending-order','Payment checks target the pending order, never the currently open paid product');
  assert.match(app.text,/Private purchased content for paid-a/,'Payment refresh keeps the paid content visible');
  await app.respond(2,{error:'Stripe is temporarily unavailable.'},503);
  assert.match(app.text,/Stripe is temporarily unavailable/);
  assert.match(app.text,/Private purchased content for paid-a/,'An unrelated pending payment failure cannot hide the book');
  app.dispose();
}

// Paid checkout return selects the exact purchase. A slower previous response
// can never replace another purchase chosen while its content is loading.
{
  const app = await harness('?order=paid-b');
  await app.respond(0,{orders:[paidA,paidB,pending]});
  assert.equal(app.requests[1].url,'/api/commerce/customer/paid-b');
  await app.click('My purchased book');
  assert.equal(app.requests[2].url,'/api/commerce/customer/paid-a');
  await app.respond(2,content());
  await app.respond(1,content('paid-b'));
  assert.match(app.text,/Private purchased content for paid-a/);
  assert.doesNotMatch(app.text,/Private purchased content for paid-b/);
  await app.click('Check payment status');
  assert.equal(app.requests[3].url,'/api/commerce/customer?order=pending-order','Switching products does not redirect reconciliation to an unrelated paid purchase');
  await app.respond(3,{orders:[paidA,paidB,pending]});
  assert.equal(app.button('Viewing product').props.children[0].props.children,paidA.title,'Refreshing preserves the customer’s current selection');
  assert.equal(app.requests.length,4);
  app.dispose();
}

// A Guide is handed to its dedicated reader as the exact authorized purchase.
// Returning to the library clears only the selection, not the purchased access.
{
 const purchasedGuide=content('paid-a',{title:'My purchased guide',format:'Guide',builderType:'guide',studio:{basics:{subtitle:'The saved Guide subtitle.'}},sections:[{id:'guide-step-one',title:'A useful step',body:'ORIGINAL_GUIDE_INSTRUCTIONS',studio:{guideExample:'ORIGINAL_GUIDE_EXAMPLE',guideChecklist:[{id:'guide-action',text:'One saved action.'}]}}]}),app=await harness('?order=paid-a');
 await app.respond(0,{orders:[{...paidA,title:purchasedGuide.title}]});await app.respond(1,purchasedGuide);
 const reader=app.find('guide-reader');assert.equal(reader.length,1);assert.deepEqual(reader[0].props.content,{...purchasedGuide,page:undefined},'The portal forwards the purchased Guide snapshot without replacing content or metadata');assert.equal(reader[0].props.preview,undefined,'A paid Guide never uses owner preview mode');assert.equal(reader[0].props.exportBase,undefined,'Buyer Guide exports use order authorization rather than creator routes');assert.equal(typeof reader[0].props.onBack,'function');assert.equal(app.find('purchase-help')[0].props.orderId,'paid-a','The focused Guide reader retains purchaser support');
 assert.equal(app.find('section').filter(node=>node.props['aria-label']==='Online reader').length,0,'The generic document reader does not duplicate a Guide');assert.equal(app.requests.length,2,'Opening the Guide itself creates no mutation or extra provider request');
 reader[0].props.onBack();app.render();await app.settle();assert.equal(app.find('guide-reader').length,0);assert.match(app.text,/Choose a product from your library/);assert.equal(app.requests.length,2,'Returning to the library does not create another order/content request');
 await app.click('My purchased guide');assert.equal(app.requests[2].url,'/api/commerce/customer/paid-a');await app.respond(2,purchasedGuide);assert.equal(app.find('guide-reader').length,1,'A paid Guide can be reopened from the library');app.dispose();
}

// A paid Playbook receives its frozen procedure/branch metadata and its granted
// resources, while the reader owns its content placement and library return.
{
 const decisionGraph={startId:'inspect',nodes:[{id:'inspect',label:'Inspect the supplied brief',kind:'action',choices:[{label:'Review complete',to:'ready'}]},{id:'ready',label:'Brief ready for review',kind:'end',choices:[]}]},purchasedPlaybook=content('paid-a',{title:'My purchased playbook',format:'Playbook',builderType:'playbook',studio:{playbook:{teamLicense:'personal'}},sections:[{id:'saved-procedure',title:'Review the original brief',body:'ORIGINAL_PLAYBOOK_INSTRUCTIONS',studio:{decisionGraph,playbookNodeDetails:{inspect:{body:'ORIGINAL_NODE_INSTRUCTIONS',uploadIds:['original-upload'],fileNames:['workbook.md']}}}}]}),app=await harness('?order=paid-a');
 await app.respond(0,{orders:[{...paidA,title:purchasedPlaybook.title}]});await app.respond(1,purchasedPlaybook);
 const reader=app.find('playbook-reader');assert.equal(reader.length,1);assert.deepEqual(reader[0].props.content,{...purchasedPlaybook,page:undefined},'The Playbook reader receives the exact authorized snapshot, including graph, node details and frozen file assignments');assert.equal(reader[0].props.preview,undefined);assert.equal(reader[0].props.exportBase,undefined,'Paid Playbooks never receive an owner-export override');assert.equal(typeof reader[0].props.onBack,'function');assert.equal(app.find('purchase-help')[0].props.orderId,'paid-a','The Playbook reader retains purchaser support');assert.equal(app.tree.props.className,'customer-portal buyer-library is-playbook-reading');assert.equal(app.find('section').filter(node=>node.props['aria-label']==='Online reader').length,0,'The generic document reader is not repeated below a Playbook');assert.equal(app.find('guide-reader').length,0);assert.equal(app.requests.length,2,'Opening a Playbook creates no provider or mutation request');
 reader[0].props.onBack();app.render();await app.settle();assert.equal(app.find('playbook-reader').length,0);assert.match(app.text,/Choose a product from your library/);assert.equal(app.requests.length,2);await app.click('My purchased playbook');assert.equal(app.requests[2].url,'/api/commerce/customer/paid-a');await app.respond(2,purchasedPlaybook);assert.equal(app.find('playbook-reader').length,1,'A paid Playbook can be reopened from its library');app.dispose();
}

// Focused Playbook reading retains the existing team-license surface without
// allowing a seat member to manage other seats or invitations.
for(const accessRole of [undefined,'team']){
 const app=await harness('?order=paid-a'),teamPlaybook=content('paid-a',{title:'The team playbook',format:'Playbook',builderType:'playbook',accessRole,studio:{playbook:{teamLicense:'team',seats:5}}});
 await app.respond(0,{orders:[{...paidA,title:teamPlaybook.title}]});assert.equal(app.find('team-content').length,0,'Team management waits for the authorized purchased snapshot');await app.respond(1,teamPlaybook);
 assert.equal(app.find('playbook-reader').length,1);const team=app.find('team-content');assert.equal(team.length,1,'A dedicated Playbook keeps its team access/invite surface exactly once');assert.equal(team[0].props.orderId,'paid-a');assert.equal(team[0].props.canManage,accessRole!=='team','Only the purchasing account can manage team seats; invited members retain read-only team access');if(accessRole==='team')assert.equal(app.find('purchase-help').length,0,'Invited seat members do not gain the purchaser’s billing/receipt support surface');else assert.equal(app.find('purchase-help')[0].props.orderId,'paid-a');assert.equal(app.requests.length,2,'Rendering team access does not itself create a seat or send an invitation');
 app.find('playbook-reader')[0].props.onBack();app.render();await app.settle();assert.equal(app.find('team-content').length,0,'Returning to the library removes the selected purchase’s team surface');assert.equal(app.find('playbook-reader').length,0);app.dispose();
}

// Dedicated Mini/Full classrooms retain the purchased curriculum, real learning
// engine entry point and optional reminder/community/service capabilities.
for(const type of ['mini-course','video-course']){
 const app=await harness('?order=paid-a'),paidCourse=content('paid-a',{title:'My purchased classroom',format:type==='mini-course'?'Mini course':'Video course',builderType:type,service:true,serviceScope:'One review with the instructor.',preparation:'Bring your actual outline.',studio:{course:{modules:[{id:'saved-module',title:'Original module',description:'Saved teaching.',lessonIds:['saved-lesson']}]},community:{enabled:true},service:{sessionCount:1}},sections:[{id:'saved-lesson',title:'Original lesson',body:'ORIGINAL_FROZEN_COURSE_BODY',studio:{quiz:[{question:'What should a first version solve?',options:['One useful problem','Every future problem']}],assignment:{prompt:'Submit your own work for review.',required:true},captionsVtt:'WEBVTT',courseFileNames:['workbook.md']}}]});
 await app.respond(0,{orders:[{...paidA,title:paidCourse.title}]});assert.equal(app.find('product-reminders').length,0);await app.respond(1,paidCourse);const reader=app.find(type==='mini-course'?'mini-course-reader':'full-course-reader');assert.equal(reader.length,1);assert.deepEqual(reader[0].props.content,{...paidCourse,page:undefined},'The paid classroom receives exact frozen module, quiz, assignment, captions and attachment metadata');assert.equal(reader[0].props.preview,undefined);assert.equal(reader[0].props.exportBase,undefined);assert.equal(typeof reader[0].props.onBack,'function');assert.equal(app.find('product-reminders').length,1);assert.equal(app.find('product-push-reminders').length,1);assert.equal(app.find('customer-community').length,1,'Bundled community stays available outside the dedicated reader branch');assert.equal(app.find('customer-service').length,1,'Bundled instructor sessions stay available outside the dedicated reader branch');for(const name of ['product-reminders','product-push-reminders','customer-community','customer-service'])assert.equal(app.find(name)[0].props.orderId,'paid-a');assert.equal(app.find('customer-service')[0].props.scope,paidCourse.serviceScope);assert.equal(app.find('purchase-help')[0].props.orderId,'paid-a');assert.equal(app.requests.length,2,'The portal does not grade, complete, submit or book anything while opening a classroom');reader[0].props.onBack();app.render();await app.settle();assert.equal(app.find('product-reminders').length,0);assert.equal(app.find('customer-community').length,0);app.dispose();
}

// Refunded/past-due access must not hide billing cancellation, receipt or help.
for(const type of ['consulting','coaching']){
 const app=await harness('?order=paid-a'),purchased=content('paid-a',{title:'My client workspace',format:type==='consulting'?'Consulting / Mentorship':'Coaching session',builderType:type,service:true,serviceScope:'ORIGINAL_PURCHASED_SCOPE',preparation:'ORIGINAL_PURCHASED_PREPARATION',intakePrompt:'ORIGINAL_PURCHASED_BOOKING_PROMPT',studio:{service:{sessionCount:type==='coaching'?1:3,durationMinutes:90,timezone:'Asia/Ulaanbaatar',agreement:'ORIGINAL_SERVICE_AGREEMENT',asyncMessaging:true},community:{enabled:true}},sections:[{id:'client-preparation',title:'Your preparation',body:'ORIGINAL_PREPARATION_TEXT'}]});await app.respond(0,{orders:[{...paidA,title:purchased.title}]});await app.respond(1,purchased);const reader=app.find('consulting-reader');assert.equal(reader.length,1);assert.deepEqual(reader[0].props.content,{...purchased,page:undefined},'Both service types receive the exact frozen package, intake, preparation and resources');assert.equal(reader[0].props.preview,undefined);assert.equal(typeof reader[0].props.onBack,'function');assert.equal(app.find('customer-service').length,0,'The shared service panel is suppressed because the dedicated reader owns the single authoritative CustomerService instance');assert.equal(app.find('product-reminders').length,1);assert.equal(app.find('product-push-reminders').length,1);assert.equal(app.find('customer-community').length,1);assert.equal(app.find('purchase-help')[0].props.orderId,'paid-a');assert.equal(app.requests.length,2,'Opening a client workspace never accepts terms, books, sends a message or fabricates client activity');reader[0].props.onBack();app.render();await app.settle();assert.equal(app.find('consulting-reader').length,0);assert.equal(app.find('product-reminders').length,0);app.dispose();
}
{
 const app=await harness('?order=paid-a'),purchased=content('paid-a',{title:'My real community',format:'Community',builderType:'community',description:'ORIGINAL_MEMBER_PROMISE',studio:{community:{enabled:true,channels:['Introductions'],membership:{id:'frozen-plan',name:'Purchased membership',billing:'free',priceCents:0}}},sections:[{id:'member-welcome',title:'Your included guide',body:'ORIGINAL_GRANTED_MEMBER_GUIDE'}]});await app.respond(0,{orders:[{...paidA,title:purchased.title}]});await app.respond(1,purchased);const reader=app.find('community-reader');assert.equal(reader.length,1);assert.deepEqual(reader[0].props.content,{...purchased,page:undefined},'The Community home receives exactly the purchased plan-filtered snapshot');assert.equal(reader[0].props.preview,undefined);assert.equal(reader[0].props.exportBase,undefined);assert.equal(typeof reader[0].props.onBack,'function');assert.equal(app.find('customer-community').length,0,'Only the dedicated Community reader mounts its authoritative engine; no duplicate shared community');assert.equal(app.find('product-reminders').length,0,'Community access does not invent course/session reminder controls');assert.equal(app.find('product-push-reminders').length,0);assert.equal(app.find('purchase-help')[0].props.orderId,'paid-a');assert.equal(app.requests.length,2,'Opening the portal never invents a profile, posts an intro or completes onboarding');reader[0].props.onBack();app.render();await app.settle();assert.equal(app.find('community-reader').length,0);assert.equal(app.find('product-reminders').length,0);app.dispose();
}
for(const type of ['template-kit','challenge']){
 const app=await harness('?order=paid-a'),purchased=content('paid-a',{title:'My specialized purchase',format:type==='template-kit'?'Template kit':'Challenge',builderType:type,studio:type==='template-kit'?{templates:{items:[{id:'template',name:'Original template',blankFileName:'workbook.md',steps:['Use your own project.']}],version:'1.2'}}:{challenge:{allowSubmissions:true,groupFeed:true}},sections:[{id:'day-or-instructions',title:'Original saved work',body:'FROZEN_ORIGINAL_WORK',studio:{reflection:'What did you actually try?',challengeChecklist:[{id:'try',text:'Try one real activity.'}]}}]});await app.respond(0,{orders:[{...paidA,title:purchased.title}]});await app.respond(1,purchased);const reader=app.find(type==='template-kit'?'template-kit-reader':'challenge-reader');assert.equal(reader.length,1);assert.deepEqual(reader[0].props.content,{...purchased,page:undefined});assert.equal(reader[0].props.preview,undefined);assert.equal(reader[0].props.exportBase,undefined);assert.equal(typeof reader[0].props.onBack,'function');assert.equal(app.find('purchase-help')[0].props.orderId,'paid-a');if(type==='template-kit'){assert.equal(app.find('product-update-notice').length,1,'A focused Template kit keeps its real update-adoption notice');assert.equal(app.find('product-update-notice')[0].props.orderId,'paid-a');}else{assert.equal(app.find('product-reminders').length,1);assert.equal(app.find('product-push-reminders').length,1);assert.equal(app.find('customer-community').length,1,'An enabled Challenge group feed remains available');}assert.equal(app.requests.length,2,'Opening the specialized reader does not fabricate a submission, file download or update adoption');reader[0].props.onBack();app.render();await app.settle();assert.equal(app.find(type==='template-kit'?'template-kit-reader':'challenge-reader').length,0);assert.equal(app.find('product-update-notice').length,0);app.dispose();
}
{
 const app=await harness('?order=revoked-order');await app.respond(0,{orders:[{...paidA,id:'revoked-order',status:'revoked',subscription:true}]});const recover=app.find('purchase-recovery')[0];assert.equal(recover.props.orderId,'revoked-order');assert.equal(recover.props.subscription,true);assert.equal(app.requests.length,1,'Billing recovery does not request revoked paid content');app.dispose();
}

// Content errors have their own working retry, rather than an empty selection
// message or a library refresh that never reruns the content effect.
{
  const app = await harness();
  await app.respond(0,{orders:[paidA]});
  await app.respond(1,{error:'Unable to read the purchased file right now.'},503);
  assert.match(app.text,/We couldn’t open your product/);assert.equal(app.find('purchase-help')[0].props.orderId,'paid-a','Missing content retains purchaser support and receipt recovery');
  await app.click('Try opening again');
  assert.equal(app.requests[2].url,'/api/commerce/customer/paid-a');
  await app.respond(2,content());
  assert.match(app.text,/Private purchased content for paid-a/);
  app.dispose();
}

// Pending purchases never become content requests. A later authoritative paid
// response opens them, while a revoked purchase stops rendering immediately.
{
  const app = await harness('?order=pending-order');
  await app.respond(0,{orders:[pending]});
  assert.match(app.text,/waiting for confirmation/);
  assert.equal(app.requests.length,1);
  await app.click('Check payment status');
  await app.respond(1,{orders:[{...pending,status:'paid'}]});
  assert.equal(app.requests[2].url,'/api/commerce/customer/pending-order');
  await app.respond(2,content('pending-order'));
  assert.match(app.text,/Private purchased content for pending-order/);
  app.dispose();
}
{
  const app = await harness();
  await app.respond(0,{orders:[paidA,pending]});
  await app.respond(1,content());
  await app.click('Check payment status');
  await app.respond(2,{orders:[{...paidA,status:'refunded'},pending]});
  assert.doesNotMatch(app.text,/Private purchased content/);
  assert.equal(app.requests.length,3,'No content request is made for refunded or pending orders');
  app.dispose();
}

// The same callbacks still reserve/cancel sessions, and preserve private video
// and resource endpoints. No real booking or financial action is performed.
{
  const app = await harness(), service = content('paid-a',{service:true,sections:[{id:'lesson',title:'Your preparation',body:'A lesson',videoId:'private-video'}],slots:[{id:'slot-a',starts_at:1900000000000,ends_at:1900001800000}]});
  await app.respond(0,{orders:[paidA]});
  await app.respond(1,service);
  assert.equal(app.find('video')[0].props.src,'/api/commerce/customer/paid-a/video/private-video');
  app.find('select').find(node=>node.props.id!=='customer-product-select').props.onChange({target:{value:'slot-a'}});
  app.find('textarea')[0].props.onChange({target:{value:'My preparation notes'}});
  app.render();
  let prevented = false;
  void app.find('form')[0].props.onSubmit({preventDefault(){prevented=true;}});
  app.render();
  assert.equal(prevented,true);
  assert.equal(app.requests[2].options.method,'POST');
  assert.deepEqual(JSON.parse(app.requests[2].options.body),{slotId:'slot-a',intake:'My preparation notes'});
  assert.equal(app.button('Viewing product').props.disabled,true,'Selection cannot change during a booking');
  await app.respond(2,{...service,booking:{starts_at:1900000000000,ends_at:1900001800000,intake:'My preparation notes'}});
  assert.match(app.text,/Your session is confirmed/);
  await app.click('Cancel booking');
  assert.equal(app.requests.length,3,'Opening cancellation first asks for confirmation');
  await app.click('Keep my session');
  assert.equal(app.requests.length,3,'Keeping a session never releases it');
  await app.click('Cancel booking');
  await app.click('Confirm cancellation');
  assert.equal(app.requests[3].options.method,'DELETE');
  await app.respond(3,service);
  assert.match(app.text,/Book your session/);
  app.dispose();
}

for (const stage of ['orders','content']) {
  const app = await harness();
  if (stage === 'content') await app.respond(0,{orders:[paidA]});
  app.dispose();
  app.requests.at(-1).resolve(Response.json(stage === 'orders' ? {orders:[paidA]} : content()));
  await app.settle();
  assert.equal(app.updatesAfterDispose,0,`Late ${stage} responses do not update an unmounted portal`);
}

console.log('Customer portal selection, paid access UX, retry, race safety, downloads and booking callbacks passed.');
