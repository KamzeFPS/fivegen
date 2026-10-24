import assert from 'node:assert/strict';
import {initializePurchaseEmailDispatchSecret,startPurchaseEmailWorker} from '../runtime/render/purchase-email-worker.mjs';

// Process-local credentials, timers and loopback transport only; no server,
// customer data, env file, email provider or real network is involved.
const source={AUTOMATIONS_WORKER_ENABLED:'false',AUTOMATION_DISPATCH_SECRET:'untouched-marketing-credential'},other={};
initializePurchaseEmailDispatchSecret(source);initializePurchaseEmailDispatchSecret(other);
assert.match(source.PURCHASE_EMAIL_DISPATCH_SECRET,/^[a-zA-Z0-9_-]{43}$/);assert.notEqual(source.PURCHASE_EMAIL_DISPATCH_SECRET,other.PURCHASE_EMAIL_DISPATCH_SECRET,'Each process gets an independent random credential');
const first=source.PURCHASE_EMAIL_DISPATCH_SECRET;initializePurchaseEmailDispatchSecret(source);assert.equal(source.PURCHASE_EMAIL_DISPATCH_SECRET,first,'Initialization preserves this process’s existing credential');assert.equal(source.AUTOMATION_DISPATCH_SECRET,'untouched-marketing-credential');assert.equal(source.AUTOMATIONS_WORKER_ENABLED,'false');
const provided={PURCHASE_EMAIL_DISPATCH_SECRET:'explicit-server-only-secret-at-least-32-characters'};initializePurchaseEmailDispatchSecret(provided);assert.equal(provided.PURCHASE_EMAIL_DISPATCH_SECRET,'explicit-server-only-secret-at-least-32-characters');
const short={PURCHASE_EMAIL_DISPATCH_SECRET:'invalid-short'};initializePurchaseEmailDispatchSecret(short);assert.equal(short.PURCHASE_EMAIL_DISPATCH_SECRET,'invalid-short','An explicitly invalid credential is never silently substituted');
const requests=[],logs=[],timers=[];let cleared=0,unref=0,held=null,fail=false;
const worker=startPurchaseEmailWorker({origin:'https://www.fivegen.test',port:5199},{source,
  interval(callback,delay){assert.equal(delay,60000);const timer={callback,unref(){unref++;}};timers.push(timer);return timer;},
  clear(timer){assert.equal(timer,timers[0]);cleared++;},log:(...parts)=>logs.push(parts),
  async fetcher(url,options){requests.push({url,options});if(held)await held;if(fail)throw new Error('PRIVATE NETWORK INFORMATION');return {ok:true,status:200};},
});
assert.equal(requests.length,0,'Construction does not send or dispatch on startup');assert.equal(unref,1);
await worker.tick();assert.equal(requests.length,1,'Purchase delivery runs while the marketing toggle stays disabled');assert.equal(requests[0].url,'http://127.0.0.1:5199/api/purchase-emails/dispatch');assert.equal(requests[0].options.method,'POST');assert.equal(requests[0].options.headers.Host,'www.fivegen.test');assert.equal(requests[0].options.headers.Authorization,'Bearer '+source.PURCHASE_EMAIL_DISPATCH_SECRET);assert.equal(requests[0].options.body,undefined);assert.equal(source.AUTOMATIONS_WORKER_ENABLED,'false');
let release;held=new Promise(done=>{release=done;});const inFlight=worker.tick();await Promise.resolve();const beforeConcurrent=requests.length;await worker.tick();assert.equal(requests.length,beforeConcurrent,'Ticks never overlap while a dispatch is running');release();await inFlight;held=null;
source.PURCHASE_EMAILS_WORKER_ENABLED='false';const beforeDisabled=requests.length;await worker.tick();assert.equal(requests.length,beforeDisabled,'The dedicated toggle pauses purchase mail without touching marketing');source.PURCHASE_EMAILS_WORKER_ENABLED='true';
const saved=source.PURCHASE_EMAIL_DISPATCH_SECRET;source.PURCHASE_EMAIL_DISPATCH_SECRET='short';await worker.tick();assert.equal(requests.length,beforeDisabled,'An invalid credential prevents loopback dispatch');source.PURCHASE_EMAIL_DISPATCH_SECRET=saved;
fail=true;await worker.tick();assert.equal(logs.length,1);assert.ok(!JSON.stringify(logs).includes(saved));assert.ok(!JSON.stringify(logs).includes('PRIVATE NETWORK INFORMATION'),'Logs do not expose provider details or dispatcher credentials');fail=false;await worker.tick();assert.equal(requests.length,beforeDisabled+2,'A later minute retries after a transient transport failure');
worker.stop();worker.stop();assert.equal(cleared,1,'Shutdown stops the independent timer idempotently');const stoppedAt=requests.length;await worker.tick();assert.equal(requests.length,stoppedAt,'No dispatch is attempted after shutdown');
console.log('Purchase email worker passed: random process-only credentials, independent default-enabled timer, private loopback/Host/Bearer transport, disabled marketing isolation, pause, nonoverlap, transient retry, sanitized logs and shutdown. No network or email sends.');
