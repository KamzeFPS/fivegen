import { z } from "zod";
import { ApiError,database,failure,identity,productFromRow,sameOrigin } from "@/lib/server";
import { productAccess } from "@/lib/access";
import { bookSlot,cancelBooking } from "@/lib/customer-journey";
async function access(slug:string){const p=await database().prepare("SELECT * FROM products WHERE slug=?").bind(slug).first();if(!p)throw new ApiError("Product not found.",404);const a=await productAccess(p,undefined,true);return {p,...a};}
export async function GET(_req:Request,{params}:{params:Promise<{slug:string}>}){try{const {p,user,owner}=await access((await params).slug),product=productFromRow(p),db=database();const [progress,posts,slots,bookings,uploads]=await Promise.all([
 db.prepare("SELECT lesson_id FROM lesson_progress WHERE product_id=? AND user_id=?").bind(p.id,user!.userId).all(),
 product.experience?.community.enabled?db.prepare("SELECT id,user_id,name,body,parent_id,pinned,created_at FROM community_posts WHERE product_id=? ORDER BY pinned DESC,created_at DESC LIMIT 200").bind(p.id).all():{results:[]},
 product.experience?.booking.enabled?db.prepare("SELECT id,starts_at,duration FROM booking_slots WHERE product_id=? AND booking_id IS NULL AND starts_at>? ORDER BY starts_at LIMIT 100").bind(p.id,Date.now()).all():{results:[]},
 db.prepare("SELECT b.id,b.status,b.notes,s.starts_at,s.duration FROM bookings b JOIN booking_slots s ON s.id=b.slot_id WHERE b.product_id=? AND b.user_id=? ORDER BY s.starts_at DESC LIMIT 50").bind(p.id,user!.userId).all(),
 db.prepare("SELECT id,name,mime,size FROM uploads WHERE product_id=? AND status='completed' AND mime NOT LIKE 'video/%' ORDER BY created_at").bind(p.id).all(),
 ]);
 const allowance=await db.prepare("SELECT MAX(1,(SELECT COALESCE(SUM(CASE WHEN o.provider='stripe' AND o.amount>0 THEN 1 ELSE 0 END),0)+COALESCE(MAX(CASE WHEN o.provider='free' THEN 1 ELSE 0 END),0) FROM orders o WHERE o.owner=? AND lower(o.email)=? AND (o.product_id=? OR EXISTS(SELECT 1 FROM json_each(o.items) j WHERE json_extract(j.value,'$.id')=?)))) - (SELECT COUNT(*) FROM bookings WHERE product_id=? AND user_id=? AND status IN ('confirmed','attended','no_show')) remaining").bind(p.owner,user!.email.toLowerCase(),p.id,p.id,p.id,user!.userId).first();
 const lessonIds=new Set(product.content.sections.map((s,i)=>s.id||String(i)));
 if(!owner){product.content={sections:product.content.sections,benefits:product.content.benefits,files:product.content.files,launch:''};delete product.commerce;delete product.instructions;delete product.angle;}
 return Response.json({product,bookingCredits:Math.max(0,Number(allowance?.remaining||0)),owner,userId:user!.userId,progress:progress.results.map(r=>r.lesson_id).filter(id=>lessonIds.has(String(id))),posts:posts.results,slots:slots.results,bookings:bookings.results,uploads:uploads.results},{headers:{"Cache-Control":"private, no-store"}});
}catch(e){return failure(e);}}
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){try{
 sameOrigin(req);const {p,user,owner}=await access((await params).slug),product=productFromRow(p),db=database();const data=z.discriminatedUnion("action",[
 z.object({action:z.literal("complete"),lessonId:z.string().max(80),complete:z.boolean()}),
 z.object({action:z.literal("post"),body:z.string().trim().min(1).max(5000),parentId:z.string().uuid().optional()}),
 z.object({action:z.literal("deletePost"),id:z.string().uuid()}),
 z.object({action:z.literal("pinPost"),id:z.string().uuid(),pinned:z.boolean()}),
 z.object({action:z.literal("book"),slotId:z.string().uuid(),notes:z.string().max(2000).default("")}),
 z.object({action:z.literal("cancel"),id:z.string().uuid()}),
 ]).parse(await req.json());
 if(data.action==="complete"){if(!product.content.sections.some((s,i)=>(s.id||String(i))===data.lessonId))throw new ApiError("Lesson not found.",404);const id=`${p.id}:${user!.userId}:${data.lessonId}`;if(data.complete)await db.prepare("INSERT OR IGNORE INTO lesson_progress (id,product_id,user_id,lesson_id,completed_at) VALUES (?,?,?,?,?)").bind(id,p.id,user!.userId,data.lessonId,Date.now()).run();else await db.prepare("DELETE FROM lesson_progress WHERE id=?").bind(id).run();}
 if(["post","deletePost","pinPost"].includes(data.action)&&!product.experience?.community.enabled)throw new ApiError("Community is not enabled.",409);
 if(data.action==="post"){const recent=await db.prepare("SELECT COUNT(*) n FROM community_posts WHERE product_id=? AND user_id=? AND created_at>?").bind(p.id,user!.userId,Date.now()-60000).first();if(Number(recent?.n)>4)throw new ApiError("Give the conversation a moment before posting again.",429);if(data.parentId&&!await db.prepare("SELECT id FROM community_posts WHERE id=? AND product_id=? AND parent_id IS NULL").bind(data.parentId,p.id).first())throw new ApiError("Discussion not found.",404);await db.prepare("INSERT INTO community_posts (id,product_id,user_id,name,body,parent_id,pinned,created_at) VALUES (?,?,?,?,?,?,0,?)").bind(crypto.randomUUID(),p.id,user!.userId,user!.displayName||user!.email.split('@')[0],data.body,data.parentId||null,Date.now()).run();}
 if(data.action==="deletePost"){const post=await db.prepare("SELECT user_id FROM community_posts WHERE id=? AND product_id=?").bind(data.id,p.id).first();if(!post||(!owner&&post.user_id!==user!.userId))throw new ApiError("You can only remove your own posts.",403);await db.prepare("DELETE FROM community_posts WHERE product_id=? AND (id=? OR parent_id=?)").bind(p.id,data.id,data.id).run();}
 if(data.action==="pinPost"){if(!owner)throw new ApiError("Only the community host can pin discussions.",403);await db.prepare("UPDATE community_posts SET pinned=? WHERE id=? AND product_id=?").bind(data.pinned?1:0,data.id,p.id).run();}
 if(data.action==="book")return Response.json(await bookSlot(p,data.slotId,data.notes,new URL(req.url).origin));
 if(data.action==="cancel") {const b=await db.prepare("SELECT id FROM bookings WHERE id=? AND product_id=?").bind(data.id,p.id).first();if(!b)throw new ApiError("Booking not found.",404);await cancelBooking(data.id,user!.userId);}
 return Response.json({saved:true});
}catch(e){return failure(e);}}
