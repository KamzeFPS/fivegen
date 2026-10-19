import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';

async function load(path,deps){
  const source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),key='creatorPricing'+randomUUID().replaceAll('-','');
  globalThis[key]=deps;
  const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
  try{return await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}finally{delete globalThis[key];}
}
const selectedIcons=Object.fromEntries('ArrowLeft ArrowRight ArrowUpRight Check CreditCard Loader2 LockKeyhole LogOut ReceiptText RefreshCw Sparkles Zap'.split(' ').map(name=>[name,icons[name]]));
const dependencies={React,...selectedIcons,useState:React.useState,useEffect:React.useEffect,Brand:()=>React.createElement('span',null,'FiveGen'),Button:({children,...props})=>React.createElement('button',props,children),clearWorkspaceDrafts(){}};
const free={id:'free',name:'Free',commissionBps:500,commissionPercent:5,subscriptionId:null,paidThrough:null,source:'free'};
const future=Date.UTC(2027,0,1),pro={id:'pro',name:'Creator Pro',commissionBps:300,commissionPercent:3,subscriptionId:'sub_pro',paidThrough:future,source:'stripe'},scale={...pro,id:'scale',name:'Scale',commissionBps:0,commissionPercent:0,subscriptionId:'sub_scale'};
const offers=[{id:'subscription:pro:month',name:'Creator Pro',description:'For growing creators.',price:'$29.00',cents:2900,credits:2500,interval:'month',commissionBps:300,featured:true,features:['2,500 AI credits each month']},{id:'subscription:scale:month',name:'Scale',description:'For high-volume sellers.',price:'$99.00',cents:9900,credits:6000,interval:'month',commissionBps:0,features:['6,000 AI credits each month']},{id:'subscription:studio:year',name:'Retired annual Studio',price:'$690.00',cents:69000,credits:6000,interval:'year',commissionBps:300,features:[]},{id:'pack:starter',name:'1,000 credits',description:'One-time top-up.',price:'$15.00',cents:1500,credits:1000,features:['Purchased credits never expire']}];
const config={environment:'production',enabled:true,publishableKey:'pk_live_fixture'};
const {Pricing}=await load('app/pricing/pricing.tsx',dependencies);
const renderPricing=props=>renderToStaticMarkup(React.createElement(Pricing,{offers,config,...props}));
const html=renderPricing({currentPlan:free,email:'creator@example.test'});
assert.equal((html.match(/<article/g)||[]).length,3,'Free plus exactly two new monthly paid plans are offered');
for(const text of ['Free','Creator Pro','Scale','$0','$29.00','$99.00','5%','3%','0%'])assert.ok(html.includes(text),`Creator pricing includes ${text}`);
assert.match(html,/3 AI-generated products each month/);assert.match(html,/20 AI planning messages each month/);
assert.match(html,/Unlimited manual products/);assert.match(html,/Stripe processing is additional/);
assert.match(html,/href="\/checkout\?offer=subscription%3Apro%3Amonth"/);assert.match(html,/href="\/checkout\?offer=subscription%3Ascale%3Amonth"/);
assert.doesNotMatch(html,/Retired annual Studio|\$690|>Yearly<|>Monthly<|interval=year/,'New buyers are never offered retired annual pricing');
assert.match(html,/Top-ups never upgrade your plan or change your selling fee/);
const paidHtml=renderPricing({currentPlan:pro,email:'creator@example.test'});
assert.match(paidHtml,/You’re on <strong>Creator Pro/);assert.match(paidHtml,/3% FiveGen selling fee/);
assert.doesNotMatch(paidHtml,/href="\/checkout\?offer=subscription/,'Existing paid subscribers manage their current subscription instead of opening a duplicate');
assert.match(paidHtml,/before starting a different plan after the paid period ends/);
const {Pricing:Packs}=await load('app/pricing/pricing.tsx',{...dependencies,useState:()=>['packs',()=>{}],useEffect(){}});
const packs=renderToStaticMarkup(React.createElement(Packs,{offers,config,currentPlan:scale}));
assert.equal((packs.match(/<article/g)||[]).length,1);assert.match(packs,/1,000 credits/);assert.match(packs,/Your plan and selling fee stay the same/);assert.match(packs,/href="\/checkout\?offer=pack%3Astarter"/);
const disabled=renderPricing({config:{...config,enabled:false}});assert.match(disabled,/Payments temporarily unavailable/);assert.doesNotMatch(disabled,/href="\/checkout/);assert.match(disabled,/Start creating/);

const {WalletBillingAccount}=await load('app/account/billing/wallet-billing-account.tsx',dependencies);
const account={environment:'production',hasCustomer:true,creatorPlan:pro,subscriptionCredits:2500,creditsResetAt:future,testCredits:null,subscriptions:[{subscription_id:'sub_pro',status:'active',cancel_at:future,period_end:future}],payments:[]};
const renderBilling=next=>renderToStaticMarkup(React.createElement(WalletBillingAccount,{email:'creator@example.test',account:next,previous:null}));
const billing=renderBilling(account);assert.match(billing,/YOUR CURRENT PLAN/);assert.match(billing,/Creator Pro/);assert.match(billing,/Verified paid benefits/);assert.match(billing,/3%/);assert.match(billing,/Renewal canceled. Your paid benefits continue through/);assert.match(billing,/New checkouts use the Free rate after your paid period ends/);
const pastDue=renderBilling({...account,creatorPlan:free,subscriptionCredits:0,subscriptions:[{...account.subscriptions[0],status:'past_due',cancel_at:null}]});assert.match(pastDue,/No subscription required/);assert.match(pastDue,/5%/);assert.doesNotMatch(pastDue,/Verified paid benefits|paid benefits verified/,'A past-due billing record must not claim active paid benefits');
const unverified=renderBilling({...account,creatorPlan:free,subscriptions:[{...account.subscriptions[0],cancel_at:null}]});assert.match(unverified,/Billing active · paid benefits not currently verified/);assert.doesNotMatch(unverified,/Verified paid benefits|paid benefits verified/,'An active subscription without a verified paid period does not grant its plan in the UI');
const scaleBilling=renderBilling({...account,creatorPlan:scale,subscriptions:[{...account.subscriptions[0],subscription_id:'sub_scale',cancel_at:null}]});assert.match(scaleBilling,/Scale/);assert.match(scaleBilling,/0%/);assert.match(scaleBilling,/Stripe processing additional/);
console.log('Creator pricing UI passed: Free/Pro/Scale monthly prices and rates, no retired annual offers, top-up separation, duplicate-subscription navigation, cancellation period and verified billing benefits.');
