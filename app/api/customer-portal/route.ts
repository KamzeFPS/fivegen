import { z } from "zod";
import { ApiError, database, failure, sameOrigin, stripe } from "@/lib/server";
export async function POST(req:Request){try{
  sameOrigin(req);const {token}=z.object({token:z.string().min(20).max(150)}).parse(await req.json());
  const order=await database().prepare("SELECT o.*,p.slug FROM orders o JOIN products p ON o.product_id=p.id WHERE token=?").bind(token).first();
  if(!order?.customer_id||!order.subscription_id||!order.stripe_account)throw new ApiError("No subscription was found for this access link.",403);
  const origin=new URL(req.url).origin;
  const portal=await stripe("billing_portal/sessions",new URLSearchParams({customer:String(order.customer_id),return_url:`${origin}/p/${order.slug}/success?token=${encodeURIComponent(token)}`}),String(order.stripe_account));
  return Response.json({url:portal.url});
}catch(e){return failure(e);}}
