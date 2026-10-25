import {createHmac} from 'node:crypto';
import {loopbackRequest} from './loopback-http.mjs';
// This key authenticates dispatch and existing unsubscribe token signatures.
// A purpose-separated fallback must stay stable across process restarts.
export function initializeAutomationDispatchSecret(source=process.env){
 if(!source.AUTOMATION_DISPATCH_SECRET?.trim()){if((source.CREDENTIAL_ENCRYPTION_KEY||'').length<32)throw Error('A persistent CREDENTIAL_ENCRYPTION_KEY is required for automation signing');source.AUTOMATION_DISPATCH_SECRET=createHmac('sha256',source.CREDENTIAL_ENCRYPTION_KEY).update('fivegen:automation-dispatch-and-unsubscribe:v1').digest('base64url');}
}
export function startAutomationWorker(config,{source=process.env,fetcher=loopbackRequest,interval=setInterval,clear=clearInterval,log=console.error}={}){
 let stopped=false,dispatching=false;
 const tick=async()=>{
  if(stopped||dispatching||source.AUTOMATIONS_WORKER_ENABLED==='false'||(source.AUTOMATION_DISPATCH_SECRET||'').length<32)return;
  dispatching=true;
  try{const response=await fetcher(`http://127.0.0.1:${config.port}/api/automations/dispatch`,{method:'POST',headers:{Host:new URL(config.origin).host,Authorization:`Bearer ${source.AUTOMATION_DISPATCH_SECRET}`},signal:AbortSignal.timeout(90000)});if(!response.ok)log('Automation dispatch did not complete:',response.status);}
  catch{if(!stopped)log('Automation dispatch temporarily unavailable. Pending jobs will retry.');}
  finally{dispatching=false;}
 };
 const timer=interval(()=>{void tick();},60000);timer.unref?.();
 return {tick,stop(){if(stopped)return;stopped=true;clear(timer);}};
}
