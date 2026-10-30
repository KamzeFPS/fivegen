import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {randomUUID} from 'node:crypto';

const source=readFileSync('app/ai-components.tsx','utf8'),parsed=ts.createSourceFile('fixture.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),scope={React};
for(const statement of parsed.statements)if(ts.isImportDeclaration(statement)&&statement.importClause&&!statement.importClause.isTypeOnly){const binding=statement.importClause.namedBindings;if(binding&&ts.isNamedImports(binding))for(const element of binding.elements)if(!element.isTypeOnly)scope[element.name.text]=element.name.text;}
let active,networkMode='normal',openai=true,fal=false,postCount=0,failCampaignAt=0;
const sent=[],messages=[],storage=new Map();
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
scope.useState=initial=>{const slot=active.cursor++,instance=active;if(!(slot in instance.slots))instance.slots[slot]=typeof initial==='function'?initial():initial;return[instance.slots[slot],value=>{instance.slots[slot]=typeof value==='function'?value(instance.slots[slot]):value;}];};
scope.useRef=value=>{const slot=active.cursor++;return active.slots[slot]??(active.slots[slot]={current:value});};
scope.useCallback=(fn,deps)=>{const slot=active.cursor++,old=active.slots[slot];if(!old||!same(old.deps,deps))active.slots[slot]={deps,fn};return active.slots[slot].fn;};
scope.useEffect=(fn,deps)=>{const slot=active.cursor++,old=active.slots[slot];if(!old||!same(old.deps,deps)){active.slots[slot]={deps};active.effects.push(fn);}};
scope.useImageQuality=()=>scope.useState('medium');
scope.designImageCredits=quality=>({low:4,medium:12,high:40})[quality];
scope.toast={success:message=>messages.push(message)};
scope.sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
scope.fetch=async(url,options)=>{
 if(url==='/api/providers')return Response.json({connected:{openai,fal},config:{textProvider:'anthropic',paused:false},credits:{media:1000,unlimited:false}});
 if(url==='/api/credits')return Response.json({balance:{media:1000,unlimited:false}});
 if(options.method==='GET'&&url.endsWith('/assets'))return Response.json({assets:[]});
 assert.ok(url.endsWith('/assets')&&options.method==='POST','Only explicit asset submission can create network work');
 const body=JSON.parse(options.body);sent.push(body);postCount++;
 if(networkMode==='lost'){networkMode='normal';throw new TypeError('A synthetic response was lost');}
 if(failCampaignAt&&postCount===failCampaignAt){failCampaignAt=0;return Response.json({error:'Confirmed provider failure',status:'failed'},{status:503});}
 return Response.json({id:body.requestId,status:body.kind==='image'?'completed':'queued'});
};
const ui={};new Function('exports',...Object.keys(scope),ts.transpileModule(source.replace(/^import[\s\S]*?;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText)(ui,...Object.values(scope));
const product={id:randomUUID(),title:'A real product',description:'A practical guide with source material.',audience:'Creators',color:'orange',content:{imagePrompt:'Create an original warm botanical visual for this guide.',videoPrompt:'Create a polished five second promotional guide video.'}};
function instance(){const fixture={slots:[],cursor:0,effects:[],cleanups:[]};fixture.render=()=>{active=fixture;fixture.cursor=0;return ui.MediaStudio({product,onSetup:()=>{}});};fixture.mount=async()=>{fixture.render();while(fixture.effects.length)fixture.cleanups.push(fixture.effects.shift()());await settle();};fixture.close=()=>fixture.cleanups.forEach(cleanup=>cleanup?.());return fixture;}
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):React.isValidElement(node)?[node,...nodes(node.props.children)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(' '):React.isValidElement(node)?text(node.props.children):typeof node==='string'?node:'';
const button=(fixture,label)=>nodes(fixture.render()).find(node=>node.type==='button'&&text(node).replace(/\s+/g,' ').includes(label));
async function settle(){for(let n=0;n<6;n++)await new Promise(done=>setImmediate(done));}
const first=instance();await first.mount();assert.equal(postCount,0,'Mounting and changing controls never submits a paid request');assert.equal(button(first,'Generate image').props.disabled,false,'OpenAI readiness enables images independently of the text or video provider');
let qualityControl=nodes(first.render()).find(node=>node.type==='ImageQualityControl');assert.equal(qualityControl.props.value,'medium');qualityControl.props.onChange('high');assert.match(text(first.render()),/40 credits per image/);assert.match(text(first.render()),/280 credits/);assert.equal(postCount,0);
networkMode='lost';button(first,'Generate image').props.onClick();button(first,'Generate image').props.onClick();await settle();assert.equal(sent.length,1,'The synchronous busy guard blocks duplicate clicks');assert.equal(sent[0].quality,'high');const lostId=sent[0].requestId;assert.match(lostId,/^[a-f0-9-]{36}$/);assert.ok([...storage.keys()].some(key=>key.endsWith(':single')),'An uncertain result retains its request ID across a refresh');first.close();
const restored=instance();await restored.mount();qualityControl=nodes(restored.render()).find(node=>node.type==='ImageQualityControl');qualityControl.props.onChange('high');button(restored,'Generate image').props.onClick();await settle();assert.equal(sent[1].requestId,lostId,'An explicit retry after refresh reuses the same request ID');assert.equal(messages.at(-1),'Your image is saved in the asset library.');assert.equal([...storage.keys()].some(key=>key.endsWith(':single')),false,'A confirmed completed image releases the retry slot');
const kindTabs=nodes(restored.render()).find(node=>node.type==='Tabs'&&node.props.value==='image');kindTabs.props.onValueChange('video');assert.equal(button(restored,'Generate video').props.disabled,true,'Missing FAL blocks video without disabling OpenAI images');restored.close();
fal=true;const campaign=instance();await campaign.mount();failCampaignAt=postCount+2;const start=sent.length;button(campaign,'Generate campaign').props.onClick();await settle();assert.equal(sent.length,start+2);const firstCampaignId=sent[start].requestId,failedCampaignId=sent[start+1].requestId;assert.ok([...storage.keys()].some(key=>key.endsWith(':campaign')));campaign.close();
const resumed=instance();await resumed.mount();button(resumed,'Generate campaign').props.onClick();await settle();assert.equal(sent.length,start+5,'A partial campaign retry skips the image already completed before failure');assert.equal(sent.filter(input=>input.requestId===firstCampaignId).length,1);assert.notEqual(sent[start+2].requestId,failedCampaignId,'Only a confirmed failed asset gets a fresh request ID on the next explicit retry');assert.equal(sent.at(-1).kind,'video');assert.ok(!('quality' in sent.at(-1)),'Image quality is never passed to FAL video');assert.equal([...storage.keys()].some(key=>key.endsWith(':campaign')),false);resumed.close();
openai=false;const unavailable=instance();await unavailable.mount();assert.equal(button(unavailable,'Generate image').props.disabled,true);const videoTab=nodes(unavailable.render()).find(node=>node.type==='Tabs'&&node.props.value==='image');videoTab.props.onValueChange('video');assert.equal(button(unavailable,'Generate video').props.disabled,false,'FAL video works while OpenAI is unavailable');unavailable.close();
console.log('Marketing image UI passed: actual MediaStudio handlers, Medium default, selected quality and dynamic costs, independent OpenAI/FAL readiness, no paid work on mount/selection, duplicate-click guard, session-restored exact retry ID after a lost response, and partial campaign resume without regenerating completed assets. All network intercepted.');
