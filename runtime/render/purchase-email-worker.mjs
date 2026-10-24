import {randomBytes} from 'node:crypto';
import {loopbackRequest} from './loopback-http.mjs';

// This credential is only for this process's loopback requests. A restart can
// rotate it safely: email jobs and provider idempotency are stored separately.
export function initializePurchaseEmailDispatchSecret(source=process.env){
  if(!source.PURCHASE_EMAIL_DISPATCH_SECRET?.trim())source.PURCHASE_EMAIL_DISPATCH_SECRET=randomBytes(32).toString('base64url');
}

export function startPurchaseEmailWorker(config,{source=process.env,fetcher=loopbackRequest,interval=setInterval,clear=clearInterval,log=console.error}={}){
  let stopped=false,dispatching=false;
  const tick=async()=>{
    if(stopped||dispatching||source.PURCHASE_EMAILS_WORKER_ENABLED==='false'||(source.PURCHASE_EMAIL_DISPATCH_SECRET||'').length<32)return;
    dispatching=true;
    try{
      const response=await fetcher(`http://127.0.0.1:${config.port}/api/purchase-emails/dispatch`,{method:'POST',headers:{Host:new URL(config.origin).host,Authorization:`Bearer ${source.PURCHASE_EMAIL_DISPATCH_SECRET}`},signal:AbortSignal.timeout(45000)});
      if(!response.ok)log('Purchase email dispatch did not complete:',response.status);
    }catch{if(!stopped)log('Purchase email dispatch is temporarily unavailable. Pending confirmations will retry.');}
    finally{dispatching=false;}
  };
  const timer=interval(()=>{void tick();},60000);timer.unref?.();
  return {tick,stop(){if(stopped)return;stopped=true;clear(timer);}};
}
