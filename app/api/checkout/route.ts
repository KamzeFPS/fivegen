import { ApiError, database, failure, sameOrigin, stripe } from "@/lib/server";
import { quoteProduct } from "@/lib/offers-server";
import { selectionSchema } from "@/lib/commerce";
import { recordFreeOrder } from "@/lib/payments";
import { z } from "zod";
export async function POST(req:Request){try{
  sameOrigin(req);const s=selectionSchema.extend({expectedTotal:z.number().int().min(0).optional()}).parse(await req.json());
  const {row,quote}=await quoteProduct(s.slug,s.quantity,s.code,s.addUpsell);
  if(s.expectedTotal!==undefined&&s.expectedTotal!==quote.total)throw new ApiError("This offer changed. Refresh the page to review the current price before checkout.",409);
  const origin=new URL(req.url).origin;
  const id=crypto.randomUUID(),mode=quote.billing==="once"?"payment":"subscription";
  await database().prepare("INSERT INTO checkout_intents (id,owner,product_id,account,amount,mode,items,quantity,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(id,row.owner,row.id,String(row.stripe_account||""),quote.total,mode,JSON.stringify(quote.items),quote.quantity,Date.now()).run();
  if(quote.total===0&&mode==="payment"){
    const order=await recordFreeOrder(id);
    return Response.json({url:`${origin}/p/${s.slug}/success?token=${encodeURIComponent(String(order.token))}`});
  }
  if(quote.total<50)throw new ApiError("The minimum checkout total is $0.50. Please adjust the offer.",409);
  if(!row.stripe_account)throw new ApiError("This creator has not connected payments yet.",409);
  const account=await stripe(`accounts/${row.stripe_account}`);
  if(!account.charges_enabled)throw new ApiError("This creator’s payment setup is not complete.",409);
  const fields=new URLSearchParams({mode,"line_items[0][price_data][currency]":"usd","line_items[0][price_data][unit_amount]":String(quote.total),"line_items[0][price_data][product_data][name]":String(row.title)+(quote.quantity>1?` · ${quote.quantity} licenses`:""),"line_items[0][price_data][product_data][description]":quote.items.map(i=>i.title).join(" + ").slice(0,1000),"line_items[0][quantity]":"1",success_url:`${origin}/p/${s.slug}/success?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/p/${s.slug}`,"metadata[product_id]":String(row.id),"metadata[owner]":String(row.owner),"metadata[order_ref]":id,"metadata[expected_amount]":String(quote.total)});
  if(mode==="subscription"){
    fields.set("line_items[0][price_data][recurring][interval]",quote.billing);
    fields.set("subscription_data[metadata][product_id]",String(row.id));fields.set("subscription_data[metadata][owner]",String(row.owner));fields.set("subscription_data[metadata][order_ref]",id);
  }
  const session=await stripe("checkout/sessions",fields,String(row.stripe_account));
  await database().prepare("UPDATE checkout_intents SET session_id=? WHERE id=?").bind(session.id,id).run();
  return Response.json({url:session.url});
}catch(e){return failure(e);}}
