import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {createStorage} from '../runtime/render/storage.mjs';
import {textCredits} from '../lib/credit-policy.ts';
const root=resolve('outputs/studio-planning-qa',randomUUID()),storage=createStorage(root);
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
let owner='planner-owner',calls=0,fail=false,reserved=0,returned=0,hold=null,lastProviderInput;
const deps={z,zodToJsonSchema,ApiError,database:()=>storage.DB,identity:async()=>({userId:owner}),sameOrigin:()=>{},failure:e=>Response.json({error:e.message},{status:e.status||400}),textCredits,
 providerSettings:async()=>({connected:{openai:true},config:{textProvider:'openai',paused:false}}),
 reserveCredits:async(_owner,_id,_operation,cost)=>{reserved+=cost;},refundCredits:async()=>{returned+=10;},completeCredits:async()=>{},
 textGeneration:async(_owner,_system,input)=>{calls++;if(hold)await hold;if(fail)throw new ApiError('Provider temporarily unavailable',503);lastProviderInput=JSON.parse(input);const prompt=lastProviderInput.message;return {answer:'I suggest a focused, practical product tailored to your intended audience.',questions:['What experience should the reader already have?'],plan:{title:prompt.slice(0,95),description:'A complete, practical product with concrete exercises and reusable resources.',audience:'New independent illustrators',format:'Guide',language:'English',duration:7,deliverables:[{name:'Detailed guide',detail:'Original chapters with useful real examples.'},{name:'Working checklist',detail:'A complete editable checklist in Markdown.'},{name:'Email template',detail:'A fully written editable client email.'}],direction:'A clear, practical handoff system tailored to independent illustrators.',assumptions:['No external integrations required.']}};},
};
async function load(path){const key='qa'+randomUUID().replaceAll('-','');globalThis[key]={...deps};const source=fs.readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;const result=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete globalThis[key];return result;}
Object.assign(deps,await load('lib/generation-access.ts'));
Object.assign(deps,await load('lib/studio-plan.ts'));
const route=await load('app/api/studio/conversations/route.ts');
const post=input=>route.POST(new Request('http://localhost/api/studio/conversations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}));
const input={id:randomUUID(),requestId:randomUUID(),message:'An illustrator client handoff guide',expectedUpdatedAt:0,maxCredits:0};
try{
 let response=await post(input);assert.equal(response.status,200);const first=await response.json();assert.equal(first.remaining,19);assert.equal(first.conversation.messages.length,2);assert.equal(calls,1);assert.equal(reserved,0);
 response=await post(input);assert.equal(response.status,200);assert.equal(calls,1,'Repeated request returns saved response without another AI call');
 assert.equal((await post({...input,message:'Different input'})).status,409,'An idempotency ID cannot be reused with new inputs');
 owner='another-owner';assert.equal((await route.GET(new Request('http://localhost/api/studio/conversations?id='+input.id))).status,404);assert.equal((await post({...input,requestId:randomUUID()})).status,404);owner='planner-owner';
 assert.equal((await post({...input,requestId:randomUUID(),message:'Make it more specific'})).status,409,'Stale revisions cannot replace newer plans');
 const period=new Date().toISOString().slice(0,7);
 for(let i=0;i<19;i++)storage.sqlite.prepare('INSERT INTO studio_plan_turns (id,owner,conversation_id,prompt,period,mode,state,created_at) VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),owner,input.id,'Included turn fixture',period,'included','completed',Date.now());
 const paid={...input,requestId:randomUUID(),message:'Make the handoff checklist suitable for editorial illustration',expectedUpdatedAt:first.conversation.updatedAt};
 assert.equal((await post(paid)).status,402,'Exhausted allowance requires explicit credit ceiling');assert.equal(calls,1);
 response=await post({...paid,requestId:randomUUID(),maxCredits:10});assert.equal(response.status,200);const second=await response.json();assert.equal(second.spent,10);assert.equal(reserved,10);assert.deepEqual(lastProviderInput.conversation[1].questions,first.conversation.messages[1].questions,'Clarification questions remain in provider context for combined and partial answers');
 fail=true;response=await post({...paid,requestId:randomUUID(),expectedUpdatedAt:second.conversation.updatedAt,maxCredits:10});assert.equal(response.status,503);assert.equal(returned,10,'Failed paid planning returns credits');fail=false;
 let release;hold=new Promise(done=>{release=done;});
 const active=post({...paid,requestId:randomUUID(),expectedUpdatedAt:second.conversation.updatedAt,maxCredits:10});
 await new Promise(done=>setTimeout(done,25));
 assert.equal((await post({...paid,requestId:randomUUID(),expectedUpdatedAt:second.conversation.updatedAt,maxCredits:10})).status,409,'Concurrent planning is rejected before a provider call');release();assert.equal((await active).status,200);hold=null;
 storage.sqlite.prepare('INSERT INTO terms_acceptances VALUES (?,?,?,?,?)').run(randomUUID(),owner,'fixture','kamzewac@gmail.com',Date.now());
 const unlimitedRevision=storage.sqlite.prepare('SELECT updated_at FROM studio_conversations WHERE id=?').get(input.id).updated_at;
 const reservedBefore=reserved;
 response=await post({...paid,requestId:randomUUID(),expectedUpdatedAt:unlimitedRevision,maxCredits:0});assert.equal(response.status,200);assert.equal((await response.json()).spent,0,'Owner plans beyond monthly limit with no credits');assert.equal(reserved,reservedBefore);
 const row=storage.sqlite.prepare('SELECT * FROM studio_conversations WHERE id=?').get(input.id);storage.sqlite.prepare('UPDATE studio_conversations SET product_id=? WHERE id=?').run(randomUUID(),input.id);
 assert.equal((await post({...paid,requestId:randomUUID(),expectedUpdatedAt:row.updated_at,maxCredits:10})).status,409,'A completed plan remains linked to its product');
 console.log('Passed: persistent AI planning, ownership, idempotency, conflict handling, monthly quota, paid consent, failure refunds, concurrency and product linkage. AI transport uses fixtures.');
 console.log('QA records retained: '+root);
}finally{storage.close();}
