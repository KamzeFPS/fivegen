import {z} from "zod";
import {ApiError,binding,database,failure,identity,sameOrigin,stripe,stripeConfigured} from "@/lib/server";
import {creditBalance,reconcileCredits} from "@/lib/credits";
import {creditPacks} from "@/lib/credit-policy";
import {creditPolicy,textCredits} from "@/lib/credit-policy";
import {providerSettings} from "@/lib/ai";
export async function GET(req:Request){try{
  const u=await identity(),session=new URL(req.url).searchParams.get("session_id");
  if(session)await reconcileCredits(u.userId,session);
  const history=await database().prepare("SELECT operation,cost,state,created_at FROM credit_usage WHERE owner=? ORDER BY created_at DESC LIMIT 30").bind(u.userId).all();
  const settings=await providerSettings();
  return Response.json({balance:await creditBalance(u.userId),history:history.results,billingReady:stripeConfigured()&&!!binding("STRIPE_BILLING_WEBHOOK_SECRET"),costs:{text:textCredits(settings.config.textProvider),image:creditPolicy.image,video:creditPolicy.video}});
}catch(e){return failure(e);}}
export async function POST(req:Request){try{
  sameOrigin(req);const u=await identity(),d=z.object({pack:z.string()}).parse(await req.json());
  const pack=creditPacks.find(p=>p.id===d.pack);if(!pack)throw new ApiError("Choose a valid credit pack.");
  if(!stripeConfigured()||!binding("STRIPE_BILLING_WEBHOOK_SECRET"))throw new ApiError("Credit checkout is being configured. Please try again soon.",503);
  const origin=new URL(req.url).origin;
  const fields=new URLSearchParams({mode:"payment","line_items[0][price_data][currency]":"usd","line_items[0][price_data][unit_amount]":String(pack.cents),"line_items[0][price_data][product_data][name]":`${pack.credits.toLocaleString()} FiveGen credits`,"line_items[0][quantity]":"1","metadata[purpose]":"fivegen_credits","metadata[owner]":u.userId,"metadata[pack]":pack.id,"payment_intent_data[metadata][purpose]":"fivegen_credits","payment_intent_data[metadata][owner]":u.userId,customer_email:u.email,success_url:`${origin}/?billing=credits&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/?billing=credits`});
  const s=await stripe("checkout/sessions",fields);return Response.json({url:s.url});
}catch(e){return failure(e);}}
