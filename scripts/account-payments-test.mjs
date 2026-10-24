import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';

// Execute the real profile payment component and its submit handler with
// isolated dependencies. No env file, account, provider or network is used.
async function load(path,deps,onlyFunction){
  let source=readFileSync(path,'utf8');
  if(onlyFunction){
    const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let selected;
    function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===onlyFunction)selected=node;ts.forEachChild(node,visit);}
    visit(file);assert.ok(selected,`${onlyFunction} exists in the actual implementation`);source=selected.getText(file);if(!source.startsWith('export '))source='export '+source;
  }else source=source.replace(/^import[\s\S]*?;\r?\n/gm,'');
  const key='sellerPaymentsQa'+randomUUID().replaceAll('-','');globalThis[key]=deps;
  const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
  try{return await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}finally{delete globalThis[key];}
}
const componentPath='app/account/payments/seller-payments-account.tsx';
const routePath='app/account/payments/page.tsx';
const account={configured:true,enabled:true,mode:'live',connected:false,ready:false,accountId:null};
const selectedIcons=Object.fromEntries('ArrowLeft ArrowRight Check CheckCircle2 ChevronRight CreditCard ExternalLink Loader2 RefreshCw ShieldCheck Wallet'.split(' ').map(name=>[name,icons[name]]));
const deps={React,useCallback:React.useCallback,useEffect:React.useEffect,useState:React.useState,...selectedIcons,Brand:()=>React.createElement('span',null,'FiveGen')};
deps.CreatorSaleFees=(await load('app/creator-sale-fees.tsx',{React})).CreatorSaleFees;
deps.AccountNavigation=(await load('app/account/account-navigation.tsx',deps)).AccountNavigation;
const ui=await load(componentPath,deps),id='866cfb4b-b55d-4b76-a339-a69368ab7478';

assert.equal(ui.sellerPaymentReturnPath(`/build/${id}`),`/build/${id}`);
assert.equal(ui.sellerPaymentReturnPath(`/?project=${id}&area=commerce&untrusted=discard`),`/?project=${id}&area=commerce`);
for(const path of [null,'https://example.test','//example.test','/\\example.test',`/build/${id}/../../callback`,'/account/billing','/?project=not-an-id&area=commerce',`/?project=${id}&area=unrelated`])assert.equal(ui.sellerPaymentReturnPath(path),null,'Only a known internal product route is a return destination');
const html=renderToStaticMarkup(React.createElement(ui.SellerPaymentsAccount,{email:'seller@example.test',initialAccount:account}));
assert.match(html,/<h1>Seller payments<\/h1>/);assert.match(html,/Connect Stripe once for every product/);assert.match(html,/seller@example.test/);assert.match(html,/<option value="" disabled="" selected="">Select your business country/,'A new seller has no guessed legal country');
assert.match(html,/href="\/account\/billing"/,'Purchasing FiveGen credits is separate from receiving product sales');
assert.equal((html.match(/<form/g)||[]).length,1);
const readyHtml=renderToStaticMarkup(React.createElement(ui.SellerPaymentsAccount,{email:'seller@example.test',initialAccount:{...account,connected:true,ready:true,accountId:'acct_fixture'}}));
assert.match(readyHtml,/Connected for all products/);assert.doesNotMatch(readyHtml,/<form/,'Ready profiles are never asked to connect for another product');
assert.match(readyHtml,/href="https:\/\/dashboard.stripe.com\/acct_fixture\/balance\/overview"/,'Ready sellers can find their actual Stripe balance and payouts');
assert.match(readyHtml,/aria-current="page"[^>]*>[^<]*<svg[^]*?Seller payments/,'The account navigation identifies the current screen');
const unsafeAccount=renderToStaticMarkup(React.createElement(ui.SellerPaymentsAccount,{email:'seller@example.test',initialAccount:{...account,connected:true,ready:true,accountId:'acct_..\/evil'}}));
assert.doesNotMatch(unsafeAccount,/dashboard.stripe.com/,'Malformed account IDs never create a dashboard destination');
const unavailable=renderToStaticMarkup(React.createElement(ui.SellerPaymentsAccount,{email:'seller@example.test',initialAccount:{...account,enabled:false}}));
assert.match(unavailable,/FiveGen’s platform payment setup needs attention/);assert.doesNotMatch(unavailable,/<form/,'An unavailable platform does not advertise a working onboarding action');

async function submit({state=account,country='GB',response={url:'https://connect.stripe.com/setup/fixture'},status=200,busy='',available=true}={}){
  const calls=[],errors=[],notices=[],states=[],locations=[];let prevented=0;
  const handler=await load(componentPath,{busy,available,account:state,country,setBusy:value=>states.push(value),setError:value=>errors.push(value),setNotice:value=>notices.push(value),fetch:async(...args)=>{calls.push(args);return Response.json(response,{status});},window:{location:{assign:url=>locations.push(url)}}},'connect');
  await handler.connect({preventDefault(){prevented++;}});
  return {calls,errors,notices,states,locations,prevented};
}
const first=await submit();assert.equal(first.prevented,1);assert.equal(first.calls[0][0],'/api/commerce/connect');assert.equal(first.calls[0][1].method,'POST');assert.deepEqual(JSON.parse(first.calls[0][1].body),{country:'GB'},'First setup passes only the explicit country, never a product ID or client customer identity');assert.equal(first.locations[0],'https://connect.stripe.com/setup/fixture');
const existing=await submit({state:{...account,connected:true,accountId:'acct_fixture'},country:''});assert.deepEqual(JSON.parse(existing.calls[0][1].body),{},'Continue setup reuses the server-resolved owner account without asking for its country again');
const missing=await submit({country:''});assert.equal(missing.calls.length,0);assert.match(missing.errors.at(-1),/Select the country/);
for(const values of [{busy:'connect'},{available:false}])assert.equal((await submit(values)).calls.length,0,'Busy or unavailable profile cannot initiate a duplicate setup');
const denied=await submit({status:503,response:{error:'The administrator needs to check Stripe Connect permissions.'}});assert.equal(denied.locations.length,0);assert.match(denied.errors.at(-1),/Connect permissions/,'Provider errors remain visible instead of appearing to do nothing');assert.equal(denied.states.at(-1),'');
for(const url of ['https://example.test/setup','https://stripe.com.example.test/setup','javascript:alert(1)','http://connect.stripe.com/setup']){const bad=await submit({response:{url}});assert.equal(bad.locations.length,0);assert.match(bad.errors.at(-1),/unexpected setup link/);}

const order=[];
const page=await load(routePath,{React,requireChatGPTUser:async path=>{order.push(['auth',path]);return {userId:'server-owner',email:'server@example.test'};},commerceAccount:async owner=>{order.push(['account',owner]);return account;},SellerPaymentsAccount:props=>React.createElement('div',null,props.email)});
const rendered=await page.default();assert.deepEqual(order,[['auth','/account/payments'],['account','server-owner']],'Authentication precedes the server-owned account lookup');assert.equal(rendered.props.email,'server@example.test');assert.equal(rendered.props.initialAccount.ready,false);
let accountLookups=0;
const deniedPage=await load(routePath,{React,requireChatGPTUser:async()=>{throw new Error('authentication required');},commerceAccount:async()=>{accountLookups++;return account;},SellerPaymentsAccount:()=>null});
await assert.rejects(()=>deniedPage.default(),/authentication required/);assert.equal(accountLookups,0,'Unauthenticated visitors never access a seller profile');
console.log('Account payments: explicit country, shared-owner setup, safe redirects, visible errors, ready-state UI and authentication passed.');
