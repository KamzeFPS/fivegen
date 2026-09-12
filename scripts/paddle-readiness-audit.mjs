import {writeFileSync,readFileSync} from 'node:fs';
import {Paddle,Environment} from '@paddle/paddle-node-sdk';
import assert from 'node:assert/strict';
assert.equal(process.env.PADDLE_ENVIRONMENT,'production');
assert.ok(process.env.PADDLE_API_KEY?.startsWith('pdl_live_apikey_'));
const urls=['https://www.fivegen.ai/','https://www.fivegen.ai/terms','https://www.fivegen.ai/privacy','https://www.fivegen.ai/refund','https://www.fivegen.ai/refunds','https://www.fivegen.ai/pricing','https://fivegen.ai/pricing'];
const pages=await Promise.all(urls.map(async url=>{
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)}),html=await response.text();
  const clean=value=>value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  return {url,finalUrl:response.url,status:response.status,title:clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''),headings:[...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)].map(match=>clean(match[1])),links:[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(match=>({href:match[1],text:clean(match[2])})).filter(link=>/terms|privacy|refund|contact|mailto|pricing/i.test(link.href+' '+link.text)),sandboxNotice:html.includes('Sandbox checkout')};
}));
const domainsResponse=await fetch('https://api.paddle.com/checkout-domains?per_page=200',{headers:{Authorization:'Bearer '+process.env.PADDLE_API_KEY}});
assert.ok(domainsResponse.ok,'Live checkout domain inspection failed');
const domains=(await domainsResponse.json()).data.map(domain=>({id:domain.id,domain:domain.domain,status:domain.status}));
const p=new Paddle(process.env.PADDLE_API_KEY,{environment:Environment.production});
const mapping=JSON.parse(readFileSync('docs/paddle-live-mapping.json','utf8'));
const catalog=await Promise.all(mapping.prices.map(async mapped=>{
  const price=await p.prices.get(mapped.liveId);
  return {pack:mapped.packId,priceId:price.id,productId:price.productId,amount:price.unitPrice.amount,currency:price.unitPrice.currencyCode,active:price.status==='active',billingCycle:price.billingCycle,matchesSandbox:price.unitPrice.amount===mapped.amount&&price.unitPrice.currencyCode===mapped.currency&&price.billingCycle===null};
}));
const ipsResponse=await fetch('https://api.paddle.com/ips');assert.ok(ipsResponse.ok);
const ips=(await ipsResponse.json()).data.ipv4_cidrs;
const report={checkedAt:new Date().toISOString(),pages,domains,catalog,liveWebhookIPs:{source:'https://api.paddle.com/ips',ipv4_cidrs:ips},publicDeployment:'sandbox intentionally retained',defaultLivePaymentLink:'unverified dashboard-only setting',verification:'not confirmed'};
writeFileSync('docs/paddle-live-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
