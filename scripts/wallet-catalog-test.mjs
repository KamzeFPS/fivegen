import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {creditPacks} from '../lib/credit-policy.ts';
import {creatorSubscriptionPlans,subscriptionPlans} from '../lib/subscriptions.ts';

const dependencyKey='catalogQA'+randomUUID().replaceAll('-','');
globalThis[dependencyKey]={creditPacks,creatorSubscriptionPlans,subscriptionPlans};
const source=fs.readFileSync('lib/wallet-catalog.ts','utf8').replace(/^import[^\n]*\r?\n/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {walletCatalog,historicalWalletCatalog}=await import('data:text/javascript;base64,'+Buffer.from(`const {creditPacks,creatorSubscriptionPlans,subscriptionPlans}=globalThis.${dependencyKey};\n${compiled}`).toString('base64'));
delete globalThis[dependencyKey];

const catalog=walletCatalog(),subscriptions=catalog.filter(offer=>offer.interval);
assert.deepEqual(subscriptions.map(({id,name,cents,credits,commissionBps,interval})=>({id,name,cents,credits,commissionBps,interval})),[
  {id:'subscription:pro:month',name:'Creator Pro',cents:2900,credits:2500,commissionBps:300,interval:'month'},
  {id:'subscription:scale:month',name:'Scale',cents:9900,credits:6000,commissionBps:0,interval:'month'},
]);
assert.equal(new Set(catalog.map(offer=>offer.id)).size,catalog.length,'Every published offer has one unambiguous server-owned ID');
assert.deepEqual(catalog.filter(offer=>!offer.interval).map(({id,cents,credits})=>({id,cents,credits})),[
  {id:'pack:starter',cents:1500,credits:1000},
  {id:'pack:studio',cents:3500,credits:2500},
  {id:'pack:scale',cents:7500,credits:6000},
],'Credit packs retain their existing price and credit amounts');
assert.ok(catalog.filter(offer=>!offer.interval).every(offer=>offer.commissionBps===undefined),'One-time credits never grant a lower selling commission');
const history=historicalWalletCatalog();
assert.equal(new Set(history.map(offer=>offer.id)).size,history.length,'A shared current/legacy ID is never duplicated');
for(const [id,cents,credits] of [['subscription:pro:year',29000,2500],['subscription:studio:month',6900,6000],['subscription:studio:year',69000,6000]]){
  const legacy=history.find(offer=>offer.id===id);
  assert.ok(legacy,`Keep the permanent ${id} recognition`);assert.equal(legacy.cents,cents);assert.equal(legacy.credits,credits);
  assert.equal(catalog.some(offer=>offer.id===id),false,'Retired offers are not sold again');
}
assert.deepEqual(subscriptionPlans.map(({id,monthlyCents,annualCents,credits})=>({id,monthlyCents,annualCents,credits})),[
  {id:'pro',monthlyCents:2900,annualCents:29000,credits:2500},
  {id:'studio',monthlyCents:6900,annualCents:69000,credits:6000},
],'Legacy Paddle recognition and existing entitlements must not be repriced');
console.log('Passed: monthly launch plan amounts, allowances and fee rates; unchanged one-time packs; no inferred annual pricing; permanent legacy catalog recognition.');
