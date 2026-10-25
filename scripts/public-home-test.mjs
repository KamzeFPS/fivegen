import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';
import ts from 'typescript';

function load(path,deps={}) {
  const file=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  let source=file.text;
  for(const node of [...file.statements].reverse())if(ts.isImportDeclaration(node))source=source.slice(0,node.getFullStart())+source.slice(node.getEnd());
  const exports={};
  new Function('exports','React',...Object.keys(deps),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText)(exports,React,...Object.values(deps));
  return exports;
}

const seo=load('lib/seo.ts');
const iconDeps=Object.fromEntries(['ArrowRight','ArrowUpRight','BookOpen','CalendarDays','Check','ChevronRight','FileText','Globe','Heart','Megaphone','Target'].map(name=>[name,icons[name]]));
const {Brand}=load('app/ui-brand.tsx',iconDeps);
const Link=({children,...props})=>React.createElement('a',props,children);
const {PublicLaunchExample}=load('app/public-launch-example.tsx',{...iconDeps,useState:React.useState});
const AppearanceControl=()=>React.createElement('select',{'aria-label':'Appearance'},React.createElement('option',null,'System'));
const {PublicHome}=load('app/public-home.tsx',{...iconDeps,Brand,Link,AppearanceControl,PublicLaunchExample});
const html=renderToStaticMarkup(React.createElement(PublicHome));
assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1,'One clear public page heading');
assert.ok(html.includes('FiveGen helps you create, publish and sell digital products'));
assert.ok(html.includes('An AI growth workspace for creators'));
assert.match(html,/You know<br\/>your subject/);
for(const phrase of ['Create your product','Your product','Your page','Your audience','Example project','The Confidence Reset'])assert.ok(html.includes(phrase),'Initial public explanation: '+phrase);
assert.ok(html.includes('role="tablist"')&&html.includes('role="tabpanel"'),'A real interactive example is server-rendered before hydration');
assert.ok(html.includes('aria-label="Appearance"'),'Appearance is reachable before signing in');
for(const href of ['/pricing','https://docs.fivegen.ai','/terms','/privacy','/refund'])assert.ok(html.includes('href="'+href+'"'),'Public navigation exposes '+href+' before hydration');
const docs=load('lib/docs.ts');
for(const match of html.matchAll(/href="https:\/\/docs\.fivegen\.ai\/([^"#]+)"/g))assert.ok(docs.docsArticles.some(article=>article.slug===match[1]),'Guide link resolves: '+match[1]);
assert.ok(html.includes('Calendar organizes content plans and reminders'));
assert.ok(html.includes('does not connect its social platform or publish a post'));
assert.ok(html.includes('Payment availability depends on your account and region'));
assert.ok(!/aggregateRating|ratingValue|reviewCount|star-rating|trusted by/i.test(html),'No invented ratings or customer proof');
assert.ok(!/<form|<input|<textarea|\/api\/workspace/.test(html),'Public homepage is useful without workspace hydration or authentication');

let user=null,terms=true,termsCalls=0;
const Studio=()=>null;
const page=load('app/page.tsx',{...seo,PublicHome,Studio,getChatGPTUser:async()=>user,acceptedTerms:async()=>{termsCalls++;return terms;},redirect:destination=>{throw new Error('REDIRECT '+destination);}});
const home=async query=>page.default({searchParams:Promise.resolve(query)});
const metadata=async query=>page.generateMetadata({searchParams:Promise.resolve(query)});
for(const query of [{},{utm_source:'newsletter',utm_campaign:'creator-launch',gclid:'tracking-token'},{utm_source:['one','two'],fbclid:'tracking-token'}]){
  const content=await home(query),rendered=renderToStaticMarkup(content);
  assert.ok(rendered.includes('You know'));
  assert.ok(rendered.includes('application/ld+json'));
  assert.ok(!rendered.includes('tracking-token'),'Tracking data never enters visible content or JSON-LD');
  const meta=await metadata(query);assert.equal(meta.robots.index,true);assert.equal(meta.alternates.canonical,'https://www.fivegen.ai/');
}
assert.equal(termsCalls,0,'Anonymous homepage does not touch private terms records');
for(const query of [{view:'create'},{view:'calendar'},{project:'private-product'},{area:'vsl'},{planning:'1'},{billing:'1'},{connect:'mcp'},{return_to:'/private'},{unknown:'x'}]){
  const content=await home(query);assert.equal(content.type,Studio,'Explicit workspace intent keeps the existing Studio');assert.equal(content.props.user,null);
  assert.equal((await metadata(query)).robots.index,false,'Private/query workspace entry remains noindex');
}
user={userId:'creator-one',displayName:'Original Creator',email:'creator@example.test'};
for(const query of [{},{view:'create'},{view:'calendar'},{project:'original-course',area:'content'},{utm_source:'email'}]){
  const content=await home(query);assert.equal(content.type,Studio);assert.deepEqual(content.props.user,{name:user.displayName,email:user.email});assert.equal((await metadata(query)).robots.index,false);
}
terms=false;
await assert.rejects(home({view:'calendar',calendarDate:'2026-10-27'}),/REDIRECT \/welcome\?return_to=%2F%3Fview%3Dcalendar%26calendarDate%3D2026-10-27/,'Unaccepted terms still preserve the intended workspace destination');
console.log('Public homepage passed: server-rendered product explanation, honest feature and payment/calendar boundaries, valid documentation links, anonymous tracking entry, metadata indexing, unchanged signed-in/query Studio routing and terms redirects. No network calls.');
