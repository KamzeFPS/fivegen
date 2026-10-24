import {binding,database} from './server';
import {sendTransactionalEmail,transactionalEmailConfiguration,type TransactionalEmail} from './messaging';

type Row=Record<string,unknown>;
const emailPattern=/^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/;
const retryWindow=23*3600000;
function canonicalOrigin(){
  try{const url=new URL(binding('APP_ORIGIN'));return !url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash&&(url.protocol==='https:'||binding('STRIPE_MODE')!=='live'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))?url.origin:'';}catch{return '';}
}
// Include this statement in the same batch as the verified pending -> paid
// transition. Its SELECT cannot queue a refunded, disputed or unpaid order.
export function commercePurchaseEmailStatement(orderId:string,now:number){
  return database().prepare(`INSERT OR IGNORE INTO purchase_emails (id,source,order_id,owner,product_id,mode,recipient,title,amount,currency,access_path,status,due_at,created_at)
    SELECT 'commerce:'||mode||':'||id,'commerce',id,owner,product_id,mode,email,title,amount,currency,'/customer?order='||id,CASE WHEN mode='live' THEN 'pending' ELSE 'suppressed' END,?,?
    FROM commerce_orders WHERE id=? AND status='paid' AND paid_at IS NOT NULL`).bind(now,now,orderId);
}
// Legacy file offers are sandbox-only and have no authoritative refund/access
// revocation state. Retain a suppressed audit identity; never send from this
// adapter, including if a malformed or future caller supplies live mode.
// Matching the new random token prevents backfilling retained purchases.
export function legacyPurchaseEmailStatement(orderId:string,mode:'live'|'test',newOrderToken:string,now:number){
  return database().prepare(`INSERT OR IGNORE INTO purchase_emails (id,source,order_id,owner,product_id,mode,recipient,title,amount,currency,access_path,status,due_at,created_at)
    SELECT 'legacy:'||?||':'||o.id,'legacy',o.id,o.owner,o.product_id,?,o.email,COALESCE(json_extract(r.snapshot,'$.title'),p.title),o.amount,'usd','/access/'||p.slug||'?order='||o.id,'suppressed',?,?
    FROM orders o JOIN products p ON p.id=o.product_id AND p.owner=o.owner JOIN file_sale_revisions r ON r.id=o.sale_revision_id AND r.product_id=o.product_id
    WHERE o.id=? AND o.token=? AND o.provider='stripe' AND o.amount>0`).bind(mode,mode,now,now,orderId,newOrderToken);
}
function escape(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));}
function message(row:Row,from:string,origin:string):TransactionalEmail{
  const title=String(row.title).replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,200),recipient=String(row.recipient),path=String(row.access_path);
  if(!emailPattern.test(recipient)||!/^\/(?:customer\?order=[a-zA-Z0-9_-]+|access\/[a-zA-Z0-9_-]+\?order=[a-zA-Z0-9_-]+)$/.test(path)||!Number.isSafeInteger(row.amount)||Number(row.amount)<0||!['usd','eur','gbp','cad','aud'].includes(String(row.currency)))throw new Error('The saved purchase email needs review.');
  const accessUrl=origin+path,signInUrl=origin+'/signin-with-chatgpt?return_to='+encodeURIComponent(path),total=new Intl.NumberFormat('en-US',{style:'currency',currency:String(row.currency).toUpperCase()}).format(Number(row.amount)/100);
  const text=`Your purchase is confirmed.\n\n${title}\n${total} paid\nOrder reference: ${String(row.order_id)}\n\nOpen your purchase: ${accessUrl}\n\nIn another browser or device, sign in with the same email you used at checkout: ${signInUrl}\n\nKeep this link to return to your purchase. The link does not grant access by itself; your content stays private and access depends on your purchase status.\n\nThis is a purchase confirmation from FiveGen, not a marketing email.`;
  const html=`<!doctype html><html><head><meta name="color-scheme" content="light"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f3f0;color:#20201e;font-family:Arial,sans-serif"><div style="display:none">Your purchase is ready. Open your private product on FiveGen.</div><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:40px 16px"><table role="presentation" style="width:100%;max-width:560px;margin:auto;background:white;border-radius:20px;border:1px solid #e9e5de;border-collapse:separate"><tr><td style="padding:36px"><div style="font-weight:800;font-size:24px;letter-spacing:-1px">Five<span style="color:#fa7424">Gen</span></div><p style="margin:36px 0 12px;color:#a44e16;font-size:11px;font-weight:bold;letter-spacing:2px">PURCHASE CONFIRMED</p><h1 style="font-size:30px;line-height:1.15;letter-spacing:-1px;margin:0 0 18px">Something good is waiting.</h1><p style="color:#67645e;font-size:16px;line-height:1.7">Your payment is confirmed. Your private purchase is ready to open.</p><div style="padding:22px;background:#faf8f5;border:1px solid #eee8df;border-radius:12px;margin:26px 0"><h2 style="font-size:20px;line-height:1.4;margin:0 0 10px">${escape(title)}</h2><p style="margin:0;color:#68645e">${escape(total)} paid</p></div><a href="${escape(accessUrl)}" style="display:inline-block;background:#fc792a;border-radius:9px;color:#17100b;font-size:15px;font-weight:bold;text-decoration:none;padding:16px 25px">Open my purchase &rarr;</a><p style="font-size:13px;color:#767169;line-height:1.7;margin-top:24px">On another device? <a href="${escape(signInUrl)}" style="color:#a44e16">Sign in with your purchase email</a>. Keep this link to return to your purchase. Access depends on your purchase status.</p><p style="font-size:11px;line-height:1.6;color:#8c867d;border-top:1px solid #ece8e1;padding-top:22px;margin-top:30px">Order reference: ${escape(String(row.order_id))}<br>This is a purchase confirmation from FiveGen. It does not subscribe you to marketing.</p></td></tr></table><p style="max-width:510px;margin:18px auto;color:#8c867d;font-size:11px;line-height:1.6">If the button does not open, paste this address into your browser:<br>${escape(accessUrl)}</p></td></tr></table></body></html>`;
  return {from:`FiveGen <${from}>`,to:[recipient],subject:`Your purchase is ready: ${title}`,text,html};
}
export async function purchaseEmailReadiness(){
  const configuration=await transactionalEmailConfiguration(),origin=canonicalOrigin(),worker=binding('PURCHASE_EMAIL_DISPATCH_SECRET').length>=32&&binding('PURCHASE_EMAILS_WORKER_ENABLED')!=='false';
  return {ready:configuration.ready&&!!origin&&worker,providerReady:configuration.ready,originReady:!!origin,workerReady:worker,message:!configuration.ready?configuration.message:!origin?'Set APP_ORIGIN to the canonical HTTPS FiveGen origin before sending purchase links.':!worker?'The purchase email worker is paused or not running. Start the production server with transactional delivery enabled.':'Purchase confirmations will be delivered automatically after verified live payments.'};
}
export async function purchaseEmailState(orderId:string){
  const row=await database().prepare("SELECT status,sent_at FROM purchase_emails WHERE source='commerce' AND order_id=? AND mode=?").bind(orderId,binding('STRIPE_MODE')).first();
  if(!row)return null;
  return {state:row.status==='pending'||row.status==='sending'?'queued':String(row.status),acceptedAt:row.sent_at==null?null:Number(row.sent_at)};
}
async function validPurchase(row:Row){
  // An old order row or file grant proves a purchase occurred, not that its
  // payment/access is still valid. Only modern paid/revocable orders may mail.
  if(row.source!=='commerce')return false;
  return !!await database().prepare("SELECT id FROM commerce_orders WHERE id=? AND owner=? AND product_id=? AND mode='live' AND status='paid' AND email=? AND NOT EXISTS(SELECT 1 FROM commerce_revocations r WHERE r.account_id=commerce_orders.account_id AND r.mode=commerce_orders.mode AND r.payment_intent=commerce_orders.payment_intent)").bind(row.order_id,row.owner,row.product_id,row.recipient).first();
}
async function finish(row:Row,status:string,error:string){await database().prepare('UPDATE purchase_emails SET status=?,lease=0,error=? WHERE id=? AND lease=?').bind(status,error,row.id,row.lease).run();}
export async function dispatchPurchaseEmails(limit=2){
  const readiness=await purchaseEmailReadiness();if(!readiness.ready)return {processed:0,sent:0,message:readiness.message};
  if(binding('STRIPE_MODE')!=='live')return {processed:0,sent:0,message:'Sandbox purchase confirmations are suppressed.'};
  const now=Date.now(),candidates=await database().prepare("SELECT id FROM purchase_emails WHERE mode='live' AND due_at<=? AND (status='pending' OR (status='sending' AND lease<?)) ORDER BY due_at,id LIMIT ?").bind(now,now,Math.max(1,Math.min(5,limit))).all();let processed=0,sent=0;
  for(const candidate of candidates.results){
    const lease=Date.now()+60000,claimed=await database().prepare("UPDATE purchase_emails SET status='sending',lease=? WHERE id=? AND (status='pending' OR (status='sending' AND lease<?))").bind(lease,candidate.id,Date.now()).run();if(!claimed.meta.changes)continue;processed++;
    const row=await database().prepare('SELECT * FROM purchase_emails WHERE id=? AND lease=?').bind(candidate.id,lease).first();if(!row)continue;
    if(!await validPurchase(row)){await finish(row,'cancelled','The purchase is no longer eligible for a confirmation.');continue;}
    if(row.first_attempt_at!=null&&Date.now()-Number(row.first_attempt_at)>=retryWindow){await finish(row,'failed','Delivery is unconfirmed outside the safe retry window. Check Resend before contacting this buyer.');continue;}
    let payload:TransactionalEmail;
    if(row.payload){try{payload=JSON.parse(String(row.payload)) as TransactionalEmail;}catch{await finish(row,'failed','The saved purchase email needs administrator review. The paid product is still available.');continue;}}
    else{
      const configuration=await transactionalEmailConfiguration(),origin=canonicalOrigin();if(!configuration.ready||!origin){await finish(row,'pending','The verified email sender and canonical APP_ORIGIN must be configured before delivery.');continue;}
      try{payload=message(row,configuration.from,origin);}catch{await finish(row,'failed','The saved purchase email needs administrator review. The paid product is still available.');continue;}
      await database().prepare("UPDATE purchase_emails SET payload=? WHERE id=? AND lease=? AND payload=''").bind(JSON.stringify(payload),row.id,lease).run();
    }
    if(!await validPurchase(row)){await finish(row,'cancelled','The purchase is no longer eligible for a confirmation.');continue;}
    const attempt=await database().prepare("UPDATE purchase_emails SET attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?) WHERE id=? AND lease=? AND status='sending'").bind(Date.now(),row.id,lease).run();if(!attempt.meta.changes)continue;row.attempts=Number(row.attempts)+1;
    const delivery=await sendTransactionalEmail(payload,`fivegen-purchase/${String(row.id)}`,()=>validPurchase(row));
    // A database interruption after provider acceptance leaves the lease in
    // place. The next worker replays the exact body/key to recover the receipt.
    if(delivery.cancelled)await finish(row,'cancelled',delivery.message);
    else if(delivery.sent){await database().prepare("UPDATE purchase_emails SET status='sent',lease=0,sent_at=?,provider_id=?,error='' WHERE id=? AND lease=?").bind(Date.now(),delivery.providerId||'',row.id,lease).run();sent++;}
    else if(delivery.retryable&&Number(row.attempts)<6){await database().prepare("UPDATE purchase_emails SET status='pending',lease=0,due_at=?,error=? WHERE id=? AND lease=?").bind(Date.now()+Math.min(3600000,30000*2**Number(row.attempts)),delivery.message,row.id,lease).run();}
    else await finish(row,'failed',delivery.message);
  }
  return {processed,sent};
}
