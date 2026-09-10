import assert from 'node:assert/strict';
import { calculateQuote, commerceSchema, defaultCommerce } from '../lib/commerce.ts';
const main={id:'main',slug:'main',title:'Main',price:49},bonus={id:'bonus',slug:'bonus',title:'Bonus',price:19},extra={id:'extra',slug:'extra',title:'Extra',price:29};
function quote(type,value=20,extras={}){const c=defaultCommerce();c.deal={...c.deal,type,value,...extras};return calculateQuote(main,c,[bonus,extra]);}
assert.equal(quote('percentage',20).total,3920);
assert.equal(quote('fixed',10).total,3900);
assert.equal(quote('fixed',100).total,0);
for(const type of ['bogo','bonus']){const q=quote(type,0,{productId:'bonus'});assert.equal(q.total,4900);assert.deepEqual(q.items.map(i=>i.id),['main','bonus']);}
assert.equal(quote('bundle',59,{productId:'bonus'}).total,5900);
const c=defaultCommerce();c.deal={...c.deal,type:'volume',minimum:3,value:25};
assert.equal(calculateQuote(main,c,[],2).total,9800);
assert.equal(calculateQuote(main,c,[],3).total,11025);
c.deal={...c.deal,type:'percentage',code:'LAUNCH',value:20};
assert.equal(calculateQuote(main,c,[]).total,4900);
assert.equal(calculateQuote(main,c,[],1,'launch').total,3920);
assert.throws(()=>calculateQuote(main,c,[],1,'WRONG'));
c.deal.endsAt='2020-01-01T00:00:00Z';assert.throws(()=>calculateQuote(main,c,[],1,'LAUNCH'));assert.equal(calculateQuote(main,c,[]).total,4900);
c.deal={...defaultCommerce().deal,type:'flash_sale',value:50,startsAt:'2030-01-01T00:00:00Z',endsAt:'2030-02-01T00:00:00Z'};
assert.equal(calculateQuote(main,c,[],1,'',false,Date.parse('2030-01-15')).total,2450);
assert.equal(calculateQuote(main,c,[],1,'',false,Date.parse('2030-02-02')).total,4900);
c.deal=defaultCommerce().deal;c.upsell={...c.upsell,enabled:true,productId:'extra',price:9};
assert.equal(calculateQuote(main,c,[extra]).total,4900);assert.equal(calculateQuote(main,c,[extra],1,'',true).total,5800);
assert.throws(()=>calculateQuote(main,c,[],1,'',true));assert.throws(()=>calculateQuote(main,c,[extra],-1));
c.billing='month';assert.equal(commerceSchema.safeParse(c).success,false);
c.upsell.enabled=false;assert.equal(commerceSchema.safeParse(c).success,true);assert.throws(()=>calculateQuote(main,c,[],2));
const invalid=defaultCommerce();invalid.funnel.enabled=true;assert.equal(commerceSchema.safeParse(invalid).success,false);
console.log('Passed: integer pricing, all deal classes, coupon windows, opt-in upsells, quantity limits, subscription rules, and funnel validation.');
