import { ApiError, binding, database, failure, sameOrigin, stripe } from "@/lib/server";
import { quoteProduct } from "@/lib/offers-server";
import { selectionSchema } from "@/lib/commerce";
import { recordFreeOrder } from "@/lib/payments";
import {checkoutReferral} from "@/lib/referrals";
import {captureLead} from "@/lib/customer-journey";
import { z } from "zod";
import {commissionAmount,commissionRate} from "@/lib/credit-policy";
export async function POST(req:Request){try{
  sameOrigin(req);const s=selectionSchema.extend({expectedTotal:z.number().int().min(0).optional(),email:z.string().trim().email().max(200).optional(),name:z.string().trim().max(100).default("")}).parse(await req.json());
  const {row,quote,plan}=await quoteProduct(s.slug,s.quantity,s.code,s.addUpsell);
  const platformFee=commissionAmount(quote.total,plan.tier);
  const referral=await checkoutReferral(req,String(row.id),String(row.owner),quote.items[0].amount);
  const referralFee=Number(referral?.fee||0),fee=platformFee+referralFee;
  if(quote.total===0&&!s.email)throw new ApiError("Enter your email to save access to your classroom, community or booking.");
  if(s.expectedTotal!==undefined&&s.expectedTotal!==quote.total)throw new ApiError("This offer changed. Refresh the page to review the current price before checkout.",409);
  const origin=new URL(req.url).origin;
  const id=crypto.randomUUID(),mode=quote.billing==="once"?"payment":"subscription";
  await database().prepare("INSERT INTO checkout_intents (id,owner,product_id,account,amount,mode,items,quantity,platform_fee,created_at,referral_id,referral_fee,email) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,row.owner,row.id,String(row.stripe_account||""),quote.total,mode,JSON.stringify(quote.items),quote.quantity,platformFee,Date.now(),referral?.id||null,referralFee,s.email?.toLowerCase()||"").run();
  if(quote.total===0&&mode==="payment"){
    const order=await recordFreeOrder(id);
    if(s.email)await captureLead(String(row.owner),String(row.id),s.email,s.name||s.email,"free-product");
    return Response.json({url:`${origin}/p/${s.slug}/success?token=${encodeURIComponent(String(order.token))}`});
  }
  if(quote.total<50)throw new ApiError("The minimum checkout total is $0.50. Please adjust the offer.",409);
  if(!binding("STRIPE_WEBHOOK_SECRET"))throw new ApiError("Payment delivery is not configured yet. Please try again after the creator finishes payment setup.",503);
  if(!row.stripe_account)throw new ApiError("This creator has not connected payments yet.",409);
  const account=await stripe(`accounts/${row.stripe_account}`);
  if(!account.charges_enabled || !account.payouts_enabled)throw new ApiError("This creator’s payment setup is not complete.",409);
  const fields=new URLSearchParams({mode,"line_items[0][price_data][currency]":"usd","line_items[0][price_data][unit_amount]":String(quote.total),"line_items[0][price_data][product_data][name]":String(row.title)+(quote.quantity>1?` · ${quote.quantity} licenses`:""),"line_items[0][price_data][product_data][description]":quote.items.map(i=>i.title).join(" + ").slice(0,1000),"line_items[0][quantity]":"1",success_url:`${origin}/p/${s.slug}/success?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/p/${s.slug}`,"metadata[product_id]":String(row.id),"metadata[owner]":String(row.owner),"metadata[order_ref]":id,"metadata[expected_amount]":String(quote.total)});
  if(mode==="subscription"){
    fields.set("subscription_data[application_fee_percent]",String(Math.round(fee/quote.total*10000)/100));
    fields.set("line_items[0][price_data][recurring][interval]",quote.billing);
    fields.set("subscription_data[metadata][product_id]",String(row.id));fields.set("subscription_data[metadata][owner]",String(row.owner));fields.set("subscription_data[metadata][order_ref]",id);
  }
  else if(fee>0)fields.set("payment_intent_data[application_fee_amount]",String(fee));
  if(s.email)fields.set("customer_email",s.email);
  const session=await stripe("checkout/sessions",fields,String(row.stripe_account));
  await database().prepare("UPDATE checkout_intents SET session_id=? WHERE id=?").bind(session.id,id).run();
  return Response.json({url:session.url});
}catch(e){return failure(e);}}
