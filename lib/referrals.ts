import { ApiError,database,stripe } from "./server";
export async function hashInvitation(token:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
export async function checkoutReferral(req:Request,productId:string,owner:string,total:number){
 const key=`fivegen_ref_${productId.replace(/-/g,'')}`;const code=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(key+'='))?.slice(key.length+1);
 if(!code||!total)return null;
 const r=await database().prepare("SELECT * FROM referral_invites WHERE code=? AND product_id=? AND owner=? AND status='accepted' AND user_id IS NOT NULL AND user_id<>owner").bind(code,productId,owner).first();
 if(!r)return null;return {...r,id:String(r.id),fee:Math.floor(total*Number(r.percent)/10000)};
}
export async function recordReferral(order:Record<string,unknown>,intent:Record<string,unknown>,session:Record<string,any>){
 if(!intent.referral_id||!Number(intent.referral_fee))return;
 let paymentIntent=session.payment_intent;
 if(!paymentIntent&&session.invoice){const payments=await stripe(`invoice_payments?invoice=${encodeURIComponent(session.invoice)}&status=paid`,undefined,String(intent.account));paymentIntent=payments.data?.find((p:any)=>p.payment?.type==="payment_intent")?.payment.payment_intent;}
 if(!paymentIntent)throw new ApiError("The referral payment is still being verified.",409);
 const partner=await database().prepare("SELECT * FROM referral_invites WHERE id=? AND user_id IS NOT NULL").bind(intent.referral_id).first();if(!partner)return;
 await database().prepare("INSERT OR IGNORE INTO referral_commissions (id,order_id,invite_id,owner,partner,product_id,amount,percent,account,payment_intent,state,available_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(String(order.id),order.id,partner.id,intent.owner,partner.user_id,intent.product_id,intent.referral_fee,partner.percent,intent.account,String(paymentIntent),"pending",Date.now()+14*86400000,Date.now()).run();
 const earlier=await database().prepare("SELECT product_id,items FROM orders WHERE owner=? AND lower(email)=? AND id<>? AND provider='stripe' AND (created_at<? OR (created_at=? AND id<?))").bind(intent.owner,String(order.email).toLowerCase(),order.id,order.created_at,order.created_at,order.id).all();
 const repeat=earlier.results.some(r=>r.product_id===intent.product_id||JSON.parse(String(r.items||'[]')).some((item:any)=>item.id===intent.product_id));
 if(repeat||String(order.email).toLowerCase()===String(partner.email).toLowerCase())await voidReferral(String(order.id));
}
async function taggedRefund(path:string,id:string){let cursor='';for(;;){const page=await stripe(path+'?limit=100'+(cursor?'&starting_after='+encodeURIComponent(cursor):''));const found=page.data?.find((r:any)=>r.metadata?.fivegen_commission===id);if(found)return found;if(!page.has_more||!page.data?.length)return null;cursor=page.data[page.data.length-1].id;}}
async function chargeFor(c:Record<string,unknown>){const pi=await stripe(`payment_intents/${c.payment_intent}?expand[]=latest_charge`,undefined,String(c.account));const ch=pi.latest_charge;if(!ch)throw new ApiError("Payment verification is still pending.",409);return typeof ch==='string'?await stripe(`charges/${ch}`,undefined,String(c.account)):ch;}
export async function voidReferral(id:string){
 const db=database();let c=await db.prepare("SELECT * FROM referral_commissions WHERE id=?").bind(id).first();if(!c||['void','reversed'].includes(String(c.state)))return;
 // Mark first: a refund must never race a new payout claim.
 await db.prepare("UPDATE referral_commissions SET state='voiding' WHERE id=?").bind(id).run();
 c=(await db.prepare("SELECT * FROM referral_commissions WHERE id=?").bind(id).first())!;
 if(c.payout_started_at&&!c.transfer_id){const transfers=await stripe('transfers?transfer_group=fivegen_referral_'+encodeURIComponent(id)+'&limit=100');const found=transfers.data?.find((t:any)=>t.metadata?.fivegen_commission===id);if(!found)throw new ApiError("A payout is still settling. Retry this refund shortly.",409);await db.prepare("UPDATE referral_commissions SET transfer_id=? WHERE id=?").bind(found.id,id).run();c.transfer_id=found.id;}
 const charge=await chargeFor(c);
 if(c.transfer_id){const transfer=await stripe(`transfers/${c.transfer_id}`);const remaining=Math.max(0,Number(transfer.amount)-Number(transfer.amount_reversed));if(remaining)await stripe(`transfers/${c.transfer_id}/reversals`,new URLSearchParams({amount:String(Math.min(Number(c.amount),remaining)),'metadata[fivegen_commission]':id}),undefined,`referral-reverse-${id}`);}
 if(charge.application_fee){const fee=await stripe(`application_fees/${charge.application_fee}`);const remaining=Math.max(0,Number(fee.amount)-Number(fee.amount_refunded));if(remaining&&!(await taggedRefund(`application_fees/${charge.application_fee}/refunds`,id)))await stripe(`application_fees/${charge.application_fee}/refunds`,new URLSearchParams({amount:String(Math.min(remaining,Number(c.amount))),'metadata[fivegen_commission]':id}),undefined,`referral-fee-refund-${id}`);}
 await db.prepare("UPDATE referral_commissions SET state=? WHERE id=?").bind(c.transfer_id?'reversed':'void',id).run();
}
export async function handleReferralCharge(charge:Record<string,any>,account:string){
 const pi=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;if(!pi)return;
 const rows=await database().prepare("SELECT id FROM referral_commissions WHERE account=? AND payment_intent=? AND state NOT IN ('void','reversed')").bind(account,pi).all();for(const c of rows.results)await voidReferral(String(c.id));
}
export async function payReferral(id:string,partner:string){
 const db=database(),c=await db.prepare("SELECT * FROM referral_commissions WHERE id=? AND partner=?").bind(id,partner).first();if(!c)throw new ApiError("Commission not found.",404);
 if(c.state==='paid')return {paid:true};if(!['pending','paying'].includes(String(c.state)))throw new ApiError("This commission is not payable.",409);
 if(Number(c.available_at)>Date.now())throw new ApiError("This commission is in its 14-day refund hold.",409);
 if(c.state==='paying'){const transfers=await stripe(`transfers?transfer_group=fivegen_referral_${encodeURIComponent(id)}&limit=100`);const existing=transfers.data?.find((t:any)=>t.metadata?.fivegen_commission===id);if(existing){await db.prepare("UPDATE referral_commissions SET transfer_id=?,state='paid' WHERE id=? AND state='paying'").bind(existing.id,id).run();const latest=await db.prepare("SELECT state FROM referral_commissions WHERE id=?").bind(id).first();if(latest?.state==='voiding'){await voidReferral(id);throw new ApiError('The underlying payment was refunded.',409);}return {paid:true};}}
 if(c.state==='paying'&&Date.now()-Number(c.payout_started_at)>20*3600000)throw new ApiError("This payout needs administrator reconciliation before retrying.",409);
 const seller=await db.prepare("SELECT stripe_account FROM sellers WHERE owner=?").bind(partner).first();if(!seller?.stripe_account)throw new ApiError("Connect Stripe in Payments to receive your earnings.",409);
 const account=await stripe(`accounts/${seller.stripe_account}`);if(!account.payouts_enabled||account.capabilities?.transfers!=='active')throw new ApiError("Finish Stripe onboarding to receive transfers.",409);
 const charge=await chargeFor(c);if(charge.refunded||Number(charge.amount_refunded)>0||charge.disputed||!charge.paid){await voidReferral(id);throw new ApiError("This payment was refunded or disputed. Its commission has been cancelled.",409);}
 if(c.state==='pending'){const claim=await db.prepare("UPDATE referral_commissions SET state='paying',payout_started_at=? WHERE id=? AND state='pending'").bind(Date.now(),id).run();if(!claim.meta.changes)throw new ApiError("This payout is already being processed. Refresh shortly.",409);}
 const transfer=await stripe('transfers',new URLSearchParams({amount:String(c.amount),currency:'usd',destination:String(seller.stripe_account),'metadata[fivegen_commission]':id,transfer_group:`fivegen_referral_${id}`}),undefined,`fivegen-referral-${id}`);
 await db.prepare("UPDATE referral_commissions SET transfer_id=?,state=CASE WHEN state='voiding' THEN 'voiding' ELSE 'paid' END WHERE id=?").bind(transfer.id,id).run();
 const latest=await db.prepare("SELECT state FROM referral_commissions WHERE id=?").bind(id).first();if(latest?.state==='voiding'){await voidReferral(id);throw new ApiError("The payment was refunded while this payout was processing.",409);}return {paid:true};
}
