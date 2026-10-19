import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChevronDown,Loader2,RefreshCw} from 'lucide-react';

async function load(path,deps){
  const source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),key='earningsUi'+randomUUID().replaceAll('-','');
  globalThis[key]=deps;
  const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
  try{return await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}finally{delete globalThis[key];}
}
const {CreatorEarnings,earningsMoney}=await load('app/creator-earnings.tsx',{React,ChevronDown,Loader2,RefreshCw});
const {CreatorSaleFees}=await load('app/creator-sale-fees.tsx',{React});
const now=Date.UTC(2026,9,19),sale={id:'new-sale-0001',productId:'product-one',title:'A useful workbook',amount:100,currency:'usd',status:'paid',feeStatus:'confirmed',expectedFeeBps:500,expectedFeeAmount:5,actualChargePlatformFeeAmount:5,settlementAmount:100,settlementCurrency:'usd',stripeFeeAmount:34,platformFeeAmount:5,creatorNetAmount:61,availability:'pending',availableAt:now+7*86400000,paidAt:now,createdAt:now};
const legacy={...sale,id:'legacy-sale-01',title:'An earlier purchase',feeStatus:'legacy',expectedFeeBps:0,expectedFeeAmount:0,actualChargePlatformFeeAmount:0,platformFeeAmount:0,creatorNetAmount:66};
const pending={...sale,id:'pending-sale-1',title:'Awaiting actual fees',feeStatus:'pending',settlementAmount:null,settlementCurrency:null,stripeFeeAmount:null,platformFeeAmount:null,creatorNetAmount:null,availableAt:null,availability:''};
const refunded={...sale,id:'refunded-sale',title:'A refunded purchase',status:'revoked',feeStatus:'refunded'};
const report={commissionPercent:5,sales:[{currency:'usd',grossAmount:300,orders:3}],totals:[{currency:'usd',grossAmount:200,stripeFeeAmount:68,platformFeeAmount:5,creatorNetAmount:127,confirmedOrders:2}],coverage:{totalOrders:4,confirmedOrders:2,pendingOrders:1,legacyOrders:1,excludedOrders:1},orders:[sale,legacy,pending,refunded],orderLimit:50};
const render=(value=report,props={})=>renderToStaticMarkup(React.createElement(CreatorEarnings,{report:value,onRefresh(){},...props}));
const html=render();
assert.match(html,/USD\s*1\.27/,'Confirmed earnings render the exact server amount, not a guess from the sale price');
assert.match(html,/USD\s*0\.68/);assert.match(html,/USD\s*0\.05/);assert.match(html,/USD\s*0\.61/);
assert.match(html,/1 paid sale is awaiting Stripe fee confirmation and excluded/,'Pending rows are visibly excluded from confirmed totals');
assert.match(html,/Stripe fees pending/);assert.match(html,/not yet an available bank payout/);assert.match(html,/Oct 26, 2026/);
assert.match(html,/Earlier sale · no FiveGen fee/);assert.match(html,/FiveGen’s fee for this sale is zero/,'Earlier sales are not shown as retroactively charged');
const legacyArticle=html.match(/<article class="earnings-sale ">(?:(?!<article)[\s\S])*An earlier purchase(?:(?!<article)[\s\S])*?<\/article>/)?.[0];
assert.ok(legacyArticle);assert.match(legacyArticle,/USD\s*0\.00/);assert.doesNotMatch(legacyArticle,/FiveGen fee · 5%/);
const excludedArticle=html.match(/<article class="earnings-sale is-excluded">[\s\S]*?<\/article>/)?.[0];
assert.ok(excludedArticle);assert.match(excludedArticle,/Revoked \/ disputed · excluded/);assert.doesNotMatch(excludedArticle,/USD\s*0\.61/,'Revoked original earnings never masquerade as current earnings');
const pendingHtml=render({...report,totals:[],coverage:{...report.coverage,confirmedOrders:0,pendingOrders:1},orders:[pending]});
assert.match(pendingHtml,/final fee breakdown is on its way/);assert.doesNotMatch(pendingHtml,/USD\s*0\.00/,'Unknown Stripe fees and net must not become zero');assert.match(pendingHtml,/USD\s*0\.05/,'Known charge application fee can display before balance confirmation');
const fx=render({...report,totals:[{currency:'jpy',grossAmount:150,stripeFeeAmount:40,platformFeeAmount:7,creatorNetAmount:103,confirmedOrders:1}],coverage:{totalOrders:1,confirmedOrders:1,pendingOrders:0,legacyOrders:0,excludedOrders:0},orders:[{...sale,settlementAmount:150,settlementCurrency:'jpy',stripeFeeAmount:40,platformFeeAmount:7,creatorNetAmount:103}]});
assert.match(fx,/USD\s*1\.00/);assert.match(fx,/JPY\s*103/);assert.match(fx,/Stripe converted this payment to JPY\s*150/,'Sale currency and settlement currency remain explicit');
assert.match(earningsMoney(100,'usd'),/USD\s*1\.00/);assert.match(earningsMoney(100,'jpy'),/JPY\s*100/);assert.match(earningsMoney(100,'isk'),/ISK\s*1/);
const refreshing=render(report,{refreshing:true,error:'Stripe could not be checked.'});assert.match(refreshing,/disabled="" aria-label="Check actual Stripe fees"/);assert.match(refreshing,/role="alert"/);
const disclosure=renderToStaticMarkup(React.createElement(CreatorSaleFees));assert.match(disclosure,/5% of the sale price/);assert.match(disclosure,/The customer pays the price you set/);assert.match(disclosure,/fees vary/);assert.doesNotMatch(disclosure,/0\.34|2\.9%/,'The fee disclosure invents no Stripe rate');
console.log('Creator earnings UI passed: actual fee/net amounts, legacy zero commission, pending and revoked states, FX/minor-unit display, payout distinction and fee disclosure.');
