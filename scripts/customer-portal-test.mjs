import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import React from 'react';
import ts from 'typescript';

// Run the shipped component's effects and event callbacks with a deterministic
// hook/fetch harness. These fixtures never touch Stripe, identities or a database.
const source = readFileSync('app/customer/portal.tsx', 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
const componentCode = ts.transpileModule(source, { compilerOptions:{ module:ts.ModuleKind.ES2022, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.React } }).outputText;
const sameDeps = (before, after) => before && after && before.length === after.length && before.every((value,index) => Object.is(value, after[index]));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function nodes(value) { return Array.isArray(value) ? value.flatMap(nodes) : React.isValidElement(value) ? [value, ...nodes(value.props.children)] : []; }
function text(value) { return Array.isArray(value) ? value.map(text).join(' ') : React.isValidElement(value) ? text(value.props.children) : value == null || typeof value === 'boolean' ? '' : String(value); }

async function harness(search = '') {
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
    React, useState, useRef, useCallback, useEffect, Link:'a', Brand:()=>React.createElement('span',null,'FiveGen'), location:{search},
    commerceMoney:amount => `$${(amount / 100).toFixed(2)}`,
    isConsulting:format => format === 'Coaching session',
    commerceResponse:async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; },
    fetch:(url,options) => { const request = { url, options, ...deferred() }; requests.push(request); return request.promise; },
  };
  const key = `customerPortalQa${randomUUID().replaceAll('-','')}`;
  globalThis[key] = dependencies;
  const module = await import('data:text/javascript;base64,' + Buffer.from(`const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n${componentCode}`).toString('base64'));
  delete globalThis[key]; Component = module.CustomerPortal;
  function render() {
    for (let attempt = 0; dirty && attempt < 30; attempt++) {
      dirty = false; cursor = 0; tree = Component();
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

// The exact report: a paid book plus an abandoned pending attempt. Both the
// plain library URL and a pending checkout return must open the existing book.
for (const search of ['', '?order=pending-order']) {
  const app = await harness(search);
  await app.respond(0,{orders:[paidA,pending], paymentStatusError:search ? 'Still checking your latest payment.' : undefined});
  assert.equal(app.requests[1].url,'/api/commerce/customer/paid-a');
  assert.match(app.text,/Opening your product/);
  assert.doesNotMatch(app.text,/Select a paid product/);
  await app.respond(1,content());
  assert.match(app.text,/Private purchased content for paid-a/);
  assert.equal(app.find('a').find(link => text(link).includes('original.pdf')).props.href,'/api/commerce/customer/paid-a/uploads/original-upload');
  assert.equal(app.find('a').find(link => text(link).includes('workbook.md')).props.href,'/api/commerce/customer/paid-a/files/workbook.md');
  assert.ok(app.text.indexOf('Download your files')<app.text.indexOf('Contents'),'Original downloads appear before reading sections');
  const otherOrders=app.find('details').find(node=>node.props.className==='customer-other-orders');
  assert.equal(otherOrders.props.open,false,'Unpaid orders do not crowd the paid library');
  const reading=app.find('details').find(node=>node.props.className.includes('customer-reading-section'));
  assert.equal(reading.props.open,true,'The first reading section opens without an extra click');
  assert.equal(app.button('Viewing product').props['aria-pressed'],true);
  await app.click('Viewing product');
  assert.match(app.text,/Private purchased content for paid-a/,'Clicking the already open purchase never clears it');
  assert.equal(app.requests.length,2);
  await app.click('Check payment status');
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
  await app.respond(3,{orders:[paidA,paidB,pending]});
  assert.equal(app.button('Viewing product').props.children[0].props.children,paidA.title,'Refreshing preserves the customer’s current selection');
  assert.equal(app.requests.length,4);
  app.dispose();
}

// Content errors have their own working retry, rather than an empty selection
// message or a library refresh that never reruns the content effect.
{
  const app = await harness();
  await app.respond(0,{orders:[paidA]});
  await app.respond(1,{error:'Unable to read the purchased file right now.'},503);
  assert.match(app.text,/We couldn’t open your product/);
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
