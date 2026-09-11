import { z } from "zod";
import { ApiError,database,failure,productFromRow,sameOrigin } from "@/lib/server";
import { captureLead } from "@/lib/customer-journey";

import { recordFreeOrder } from "@/lib/payments";
export async function POST(req:Request){try{
 sameOrigin(req);const d=z.object({slug:z.string().max(80),name:z.string().trim().min(1).max(100),email:z.string().trim().email().max(200),marketing:z.boolean().default(false),website:z.string().max(200).default('')}).parse(await req.json());if(d.website)throw new ApiError("Please try submitting the form again.");
 const db=database(),r=await db.prepare("SELECT * FROM products WHERE slug=? AND status='published'").bind(d.slug).first();if(!r)throw new ApiError("This guide is unavailable.",404);const p=productFromRow(r),f=p.commerce!.funnel;if(!f.enabled||f.kind!=='free_guide')throw new ApiError("This free guide funnel is unavailable.",404);
 const target=f.leadProductId?await db.prepare("SELECT * FROM products WHERE id=? AND owner=? AND price=0 AND status='published'").bind(f.leadProductId,r.owner).first():r;if(!target||Number(target.price)!==0)throw new ApiError("The creator needs to connect a published free guide.",409);
 const guide=productFromRow(target),id=crypto.randomUUID();await captureLead(String(r.owner),String(r.id),d.email,d.name,'free-guide',d.marketing);
 await db.prepare("INSERT INTO checkout_intents (id,owner,product_id,account,amount,mode,items,quantity,platform_fee,email,created_at) VALUES (?,?,?,'',0,'payment',?,1,0,?,?)").bind(id,r.owner,target.id,JSON.stringify([{id:guide.id,slug:guide.slug,title:guide.title,price:0,amount:0}]),d.email.toLowerCase(),Date.now()).run();const order=await recordFreeOrder(id);
 return Response.json({url:`/p/${guide.slug}/success?token=${encodeURIComponent(String(order.token))}`,message:f.thankYou,nextUrl:p.price>0?`/p/${p.slug}`:null});
}catch(e){return failure(e);}}
