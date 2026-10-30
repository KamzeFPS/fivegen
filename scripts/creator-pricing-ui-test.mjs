import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';
import {z} from 'zod';
import {creditPolicy} from '../lib/credit-policy.ts';
import {creatorSubscriptionPlans} from '../lib/subscriptions.ts';

async function load(path,deps){
  const source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),key='creatorPricing'+randomUUID().replaceAll('-','');
  globalThis[key]=deps;
  const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
  try{return await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}finally{delete globalThis[key];}
}
const selectedIcons=Object.fromEntries('ArrowLeft ArrowRight ArrowUpRight Check CreditCard Loader2 LockKeyhole LogOut ReceiptText RefreshCw Sparkles Wallet Zap'.split(' ').map(name=>[name,icons[name]]));
const dependencies={React,Link:({children,...props})=>React.createElement('a',props,children),creditPolicy,...selectedIcons,useState:React.useState,useEffect:React.useEffect,Brand:()=>React.createElement('span',null,'FiveGen'),AppearanceControl:()=>null,Button:({children,...props})=>React.createElement('button',props,children),clearWorkspaceDrafts(){}};
dependencies.designImageCreditCosts=(await load('lib/design-image.ts',{z})).designImageCreditCosts;
dependencies.AccountNavigation=(await load('app/account/account-navigation.tsx',dependencies)).AccountNavigation;
const free={id:'free',name:'Free',commissionBps:500,commissionPercent:5,subscriptionId:null,paidThrough:null,source:'free'};
const future=Date.UTC(2027,0,1),pro={id:'pro',name:'Creator Pro',commissionBps:300,commissionPercent:3,subscriptionId:'sub_pro',paidThrough:future,source:'stripe'},scale={...pro,id:'scale',name:'Scale',commissionBps:0,commissionPercent:0,subscriptionId:'sub_scale'};
const offers=[...creatorSubscriptionPlans.map(plan=>({id:`subscription:${plan.id}:month`,name:plan.name,description:plan.description,price:`$${(plan.monthlyCents/100).toFixed(2)}`,cents:plan.monthlyCents,credits:plan.credits,interval:'month',commissionBps:plan.commissionBps,featured:'featured' in plan&&plan.featured,features:[...plan.features]})),{id:'subscription:studio:year',name:'Retired annual Studio',price:'$690.00',cents:69000,credits:6000,interval:'year',commissionBps:300,features:[]},{id:'pack:starter',name:'1,000 credits',description:'One-time top-up.',price:'$15.00',cents:1500,credits:1000,features:['Purchased credits never expire']}];
const config={environment:'production',enabled:true,publishableKey:'pk_live_fixture'};
const {Pricing}=await load('app/pricing/pricing.tsx',dependencies);
const renderPricing=props=>renderToStaticMarkup(React.createElement(Pricing,{offers,config,...props}));
const html=renderPricing({currentPlan:free,email:'creator@example.test'});
assert.equal((html.match(/<article/g)||[]).length,3,'Free plus exactly two new monthly paid plans are offered');
for(const text of ['Free','Creator Pro','Scale','$0','$29','$99','5%','3%','0%'])assert.ok(html.includes(text),`Creator pricing includes ${text}`);
assert.match(html,/60 AI credits each month/);for(const amount of ['60','2,000','6,000'])assert.ok(html.includes(`<strong>${amount}</strong><span>AI credits / month`),`Monthly allowance ${amount} stays visible`);for(const count of ['5','166','500'])assert.ok(html.includes(`<strong>${count}</strong> medium images`),`Default Medium image estimate ${count}`);assert.match(html,/Image estimate quality/);assert.equal((html.match(/class="fp-quality"/g)||[]).length,1,'One shared estimate control replaces nine nested quality boxes');assert.doesNotMatch(html.match(/<section class="fp-plan-grid"[\s\S]*?<\/section>/)[0],/\$29\.00|\$99\.00|pricing-credit-allowance|<dl>/,'Plan cards use clean prices and one estimate per card');assert.match(html,/shared balance/);assert.match(html,/3 AI-generated products each month/);assert.match(html,/20 AI planning messages each month/);
assert.match(html,/Unlimited manual products/);assert.match(html,/Stripe processing is additional/);
assert.match(html,/href="\/build\/new">Start creating/,'The Free plan opens product creation instead of returning to the account dashboard');
assert.match(html,/href="\/checkout\?offer=subscription%3Apro%3Amonth"/);assert.match(html,/href="\/checkout\?offer=subscription%3Ascale%3Amonth"/);
assert.doesNotMatch(html,/Retired annual Studio|\$690|>Yearly<|>Monthly<|interval=year/,'New buyers are never offered retired annual pricing');
assert.match(html,/Top-ups never upgrade your plan or change your selling fee/);
const paidHtml=renderPricing({currentPlan:pro,email:'creator@example.test'});
assert.match(paidHtml,/You’re on <strong>Creator Pro/);assert.match(paidHtml,/3% FiveGen selling fee/);
assert.doesNotMatch(paidHtml,/href="\/checkout\?offer=subscription/,'Existing paid subscribers manage their current subscription instead of opening a duplicate');
assert.match(paidHtml,/before starting a different plan after the paid period ends/);
const {Pricing:Packs}=await load('app/pricing/pricing.tsx',{...dependencies,useState:initial=>[initial==='plans'?'packs':initial,()=>{}],useEffect(){}});
const packs=renderToStaticMarkup(React.createElement(Packs,{offers,config,currentPlan:scale}));
assert.equal((packs.match(/<article/g)||[]).length,1);assert.match(packs,/1,000 credits/);assert.match(packs,/Top-ups never change your plan or selling fee/);assert.match(packs,/href="\/checkout\?offer=pack%3Astarter"/);
for(const [quality,counts] of [['low',['15','500','1,500']],['high',['1','50','150']]]){const {Pricing:Estimate}=await load('app/pricing/pricing.tsx',{...dependencies,useState:initial=>[initial==='medium'?quality:initial,()=>{}],useEffect(){}});const estimate=renderToStaticMarkup(React.createElement(Estimate,{offers,config,currentPlan:free}));for(const count of counts)assert.ok(estimate.includes(`<strong>${count}</strong> ${quality} ${count==='1'?'image':'images'}`),`${quality} count ${count} uses the actual shared credit policy`);assert.match(estimate,/2,000<\/strong>/,'Changing an estimate never changes plan allowances');}
const disabled=renderPricing({config:{...config,enabled:false}});assert.match(disabled,/Payments temporarily unavailable/);assert.doesNotMatch(disabled,/href="\/checkout/);assert.match(disabled,/Start creating/);assert.match(disabled,/Checkout unavailable/);assert.equal((disabled.match(/<button type="button" class="fp-plan-action" disabled/g)||[]).length,2,'Unavailable billing never becomes an actionable checkout link');

const {WalletBillingAccount}=await load('app/account/billing/wallet-billing-account.tsx',dependencies);
const account={environment:'production',hasCustomer:true,creatorPlan:pro,subscriptionCredits:2500,creditsResetAt:future,testCredits:null,subscriptions:[{subscription_id:'sub_pro',status:'active',cancel_at:future,period_end:future}],payments:[]};
const renderBilling=next=>renderToStaticMarkup(React.createElement(WalletBillingAccount,{email:'creator@example.test',account:next,previous:null}));
const billing=renderBilling(account);assert.match(billing,/Current plan/);assert.match(billing,/Creator Pro/);assert.match(billing,/Verified paid benefits/);assert.match(billing,/3%/);assert.match(billing,/Renewal canceled. Your paid benefits continue through/);assert.match(billing,/New checkouts use the Free rate after your paid period ends/);
const pastDue=renderBilling({...account,creatorPlan:free,subscriptionCredits:0,subscriptions:[{...account.subscriptions[0],status:'past_due',cancel_at:null}]});assert.match(pastDue,/No subscription required/);assert.match(pastDue,/5%/);assert.doesNotMatch(pastDue,/Verified paid benefits|paid benefits verified/,'A past-due billing record must not claim active paid benefits');
const unverified=renderBilling({...account,creatorPlan:free,subscriptions:[{...account.subscriptions[0],cancel_at:null}]});assert.match(unverified,/Billing active · paid benefits not currently verified/);assert.doesNotMatch(unverified,/Verified paid benefits|paid benefits verified/,'An active subscription without a verified paid period does not grant its plan in the UI');
const scaleBilling=renderBilling({...account,creatorPlan:scale,subscriptions:[{...account.subscriptions[0],subscription_id:'sub_scale',cancel_at:null}]});assert.match(scaleBilling,/Scale/);assert.match(scaleBilling,/0%/);assert.match(scaleBilling,/Stripe processing additional/);
console.log('Creator pricing UI passed: shared quality estimates and unchanged allowances, compact clean prices, honest unavailable gates, Free/Pro/Scale monthly prices and rates, no retired annual offers, top-up separation, duplicate-subscription navigation, cancellation period and verified billing benefits.');
