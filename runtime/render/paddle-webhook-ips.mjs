import { BlockList, isIP } from 'node:net';

export const PADDLE_LIVE_IP_URL='https://api.paddle.com/ips';
const CLOUDFLARE_IP_URL='https://api.cloudflare.com/client/v4/ips';
const privateProxies=new BlockList();
for(const [ip,prefix] of [['10.0.0.0',8],['172.16.0.0',12],['192.168.0.0',16],['127.0.0.0',8],['169.254.0.0',16]])privateProxies.addSubnet(ip,prefix,'ipv4');
for(const [ip,prefix] of [['fc00::',7],['fe80::',10],['::1',128]])privateProxies.addSubnet(ip,prefix,'ipv6');
const normalize=ip=>typeof ip==='string'&&ip.startsWith('::ffff:')&&isIP(ip.slice(7))===4?ip.slice(7):ip;
const includes=(list,ip)=>isIP(ip)!==0&&list.check(ip,isIP(ip)===4?'ipv4':'ipv6');
function error(status,message){return Object.assign(new Error(message),{status});}
function cloudflareRanges(data){
  if(!data?.success||!Array.isArray(data.result?.ipv4_cidrs)||!data.result.ipv4_cidrs.length||!Array.isArray(data.result?.ipv6_cidrs))throw error(503,'The trusted proxy IP list is unavailable.');
  const list=new BlockList();
  for(const cidr of [...data.result.ipv4_cidrs,...data.result.ipv6_cidrs]){
    const [address,prefix,...extra]=String(cidr).split('/'),version=isIP(address),bits=Number(prefix);
    if(extra.length||!version||!/^\d+$/.test(prefix)||bits<1||bits>(version===4?32:128))throw error(503,'The trusted proxy IP list is invalid.');
    list.addSubnet(address,bits,version===4?'ipv4':'ipv6');
  }
  return list;
}

export function createPaddleWebhookIpGuard({fetcher=fetch,now=Date.now,ttlMs=10*60*1000}={}){
  let cached=null,pending=null,retryAt=0;
  async function lists(mode){
    if(cached&&now()<cached.expires&&(mode!=='render'||cached.proxies))return cached;
    if(now()<retryAt)throw error(503,'Webhook IP verification is temporarily unavailable.');
    if(pending)return pending;
    pending=(async()=>{
      const response=await fetcher(PADDLE_LIVE_IP_URL,{signal:AbortSignal.timeout(5000),redirect:'error'});
      if(!response.ok)throw error(503,'Paddle webhook IP lookup failed.');
      const payload=await response.json(),cidrs=payload?.data?.ipv4_cidrs;
      if(!Array.isArray(cidrs)||!cidrs.length||cidrs.length>1024)throw error(503,'Paddle returned an invalid webhook IP list.');
      const addresses=new Set();
      for(const cidr of cidrs){
        const [ip,prefix,...extra]=String(cidr).split('/');
        if(extra.length||isIP(ip)!==4||prefix!=='32')throw error(503,'Paddle returned an invalid webhook IP range.');
        addresses.add(ip);
      }
      let proxies=null;
      if(mode==='render'){
        const response=await fetcher(CLOUDFLARE_IP_URL,{signal:AbortSignal.timeout(5000),redirect:'error'});
        if(!response.ok)throw error(503,'The trusted proxy IP list is unavailable.');
        proxies=cloudflareRanges(await response.json());
      }
      cached={addresses,proxies,expires:now()+ttlMs};return cached;
    })().catch(cause=>{retryAt=now()+5000;throw error(503,'Webhook IP verification is temporarily unavailable.');}).finally(()=>{pending=null;});
    return pending;
  }
  return async function allow(request,{mode,render=false}={}){
    if(mode!=='direct'&&mode!=='render')throw error(503,'Set PADDLE_WEBHOOK_IP_MODE explicitly to direct or render.');
    const {addresses,proxies}=await lists(mode);
    let source=normalize(request.socket?.remoteAddress);
    if(mode==='render'){
      // Render's managed edge supplies X-Forwarded-For. Never accept a
      // client-supplied leftmost IP blindly: retain every non-proxy candidate.
      // A forged Paddle IP plus the actual caller IP is rejected as ambiguous.
      if(!render||!includes(privateProxies,source)||typeof request.headers?.['cf-ray']!=='string')throw error(403,'Untrusted webhook proxy.');
      const forwarded=request.headers?.['x-forwarded-for'];
      if(typeof forwarded!=='string'||forwarded.length>2048)throw error(403,'Missing webhook source IP.');
      const chain=forwarded.split(',').map(value=>normalize(value.trim()));
      if(!chain.length||chain.length>32||chain.some(ip=>!isIP(ip)))throw error(403,'Invalid webhook source IP.');
      const candidates=[...new Set(chain.filter(ip=>!includes(privateProxies,ip)&&!includes(proxies,ip)))];
      if(candidates.length!==1)throw error(403,'Ambiguous webhook source IP.');
      source=candidates[0];
    }
    if(!addresses.has(source))throw error(403,'Webhook source IP is not allowed.');
    return source;
  };
}
