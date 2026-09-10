import { z } from "zod";
import { ApiError, database, failure, identity, sameOrigin, stripe } from "@/lib/server";
import { planFor, reconcileMembership, syncMembership } from "@/lib/billing";
import { plans } from "@/lib/plans";
export async function GET(req:Request){try{
  const u=await identity();const session=new URL(req.url).searchParams.get("session_id");
  if(session)await reconcileMembership(u.userId,session);
  return Response.json(await planFor(u.userId));
}catch(e){return failure(e);}}
export async function POST(req:Request){try{
  sameOrigin(req);const u=await identity();const data=z.object({action:z.enum(["upgrade","portal"]),interval:z.enum(["month","year"]).default("month")}).parse(await req.json());
  const plan=await planFor(u.userId);if(!plan.billingReady)throw new ApiError("Pro checkout is not available yet. The platform owner needs to connect Stripe and its webhook.",503);
  const origin=new URL(req.url).origin;
  const row=await database().prepare("SELECT * FROM memberships WHERE owner=?").bind(u.userId).first();
  if(data.action==="portal"){
    if(!row?.customer_id)throw new ApiError("There is no billing account to manage yet.",409);
    const p=await stripe("billing_portal/sessions",new URLSearchParams({customer:String(row.customer_id),return_url:`${origin}/?billing=manage`}));return Response.json({url:p.url});
  }
  if(row?.subscription_id){const current=await stripe(`subscriptions/${row.subscription_id}`);await syncMembership(current);if(["active","trialing","past_due","unpaid","incomplete"].includes(current.status))throw new ApiError("You already have a subscription. Use Manage billing to update it.",409);}
  const fields=new URLSearchParams({mode:"subscription","line_items[0][price_data][currency]":"usd","line_items[0][price_data][unit_amount]":String((data.interval==="year"?plans.pro.yearly:plans.pro.monthly)*100),"line_items[0][price_data][recurring][interval]":data.interval,"line_items[0][price_data][product_data][name]":"FiveGen Pro","line_items[0][quantity]":"1",success_url:`${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/?billing=cancelled`,"metadata[purpose]":"fivegen_pro","metadata[owner]":u.userId,"subscription_data[metadata][purpose]":"fivegen_pro","subscription_data[metadata][owner]":u.userId});
  if(row?.customer_id)fields.set("customer",String(row.customer_id));else if(u.email)fields.set("customer_email",u.email);
  const session=await stripe("checkout/sessions",fields);return Response.json({url:session.url});
}catch(e){return failure(e);}}
