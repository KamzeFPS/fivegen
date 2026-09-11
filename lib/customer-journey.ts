import { ApiError,database } from "./server";
import { productAccess } from "./access";
import { readExperience } from "./experience";
import { sendEmail } from "./messaging";
export async function captureLead(owner:string,productId:string,email:string,name:string,source:string,marketing=false){
 const normalized=email.trim().toLowerCase();const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${productId}:${normalized}`));const id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 await database().prepare("INSERT INTO leads (id,owner,product_id,email,name,source,marketing,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,marketing=MAX(leads.marketing,excluded.marketing)").bind(id,owner,productId,normalized,name,source,marketing?1:0,Date.now()).run();return id;
}
export async function bookSlot(product:Record<string,unknown>,slotId:string,notes:string,origin:string){
 const {user}=await productAccess(product,undefined,true);const db=database(),e=readExperience(product.experience);
 if(!e.booking.enabled)throw new ApiError("Bookings are not open for this product.",409);
 const slot=await db.prepare("SELECT * FROM booking_slots WHERE id=? AND product_id=?").bind(slotId,product.id).first();
 if(!slot||Number(slot.starts_at)<=Date.now()||slot.booking_id)throw new ApiError("That time is no longer available. Choose another slot.",409);
 const id=crypto.randomUUID(),start=Number(slot.starts_at),end=start+Number(slot.duration)*60000;
 const result=await db.batch([
 db.prepare("INSERT INTO bookings (id,owner,product_id,slot_id,user_id,email,name,status,notes,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM booking_slots WHERE id=? AND booking_id IS NULL) AND NOT EXISTS (SELECT 1 FROM bookings b JOIN booking_slots s ON b.slot_id=s.id WHERE b.owner=? AND b.status IN ('confirmed','attended') AND s.starts_at < ? AND s.starts_at+s.duration*60000 > ?) AND NOT EXISTS (SELECT 1 FROM bookings WHERE product_id=? AND user_id=? AND status='confirmed') AND (SELECT COUNT(*) FROM bookings WHERE product_id=? AND user_id=? AND status IN ('confirmed','attended','no_show')) < MAX(1,(SELECT COALESCE(SUM(CASE WHEN o.provider='stripe' AND o.amount>0 THEN 1 ELSE 0 END),0)+COALESCE(MAX(CASE WHEN o.provider='free' THEN 1 ELSE 0 END),0) FROM orders o WHERE o.owner=? AND lower(o.email)=? AND (o.product_id=? OR EXISTS(SELECT 1 FROM json_each(o.items) j WHERE json_extract(j.value,'$.id')=?))))").bind(id,product.owner,product.id,slotId,user!.userId,user!.email.toLowerCase(),user!.displayName||user!.email,"confirmed",notes,Date.now(),slotId,product.owner,end,start,product.id,user!.userId,product.id,user!.userId,product.owner,user!.email.toLowerCase(),product.id,product.id),
 db.prepare("UPDATE booking_slots SET booking_id=? WHERE id=? AND booking_id IS NULL AND EXISTS (SELECT 1 FROM bookings WHERE id=?)").bind(id,slotId,id),
 ]);
 if(!result[0].meta.changes)throw new ApiError("You have no unused session, an appointment is already scheduled, or that time was just taken. Cancel an upcoming booking before choosing a new time.",409);
 await captureLead(String(product.owner),String(product.id),user!.email,user!.displayName||user!.email,"booking");
 const when=new Intl.DateTimeFormat('en',{dateStyle:'full',timeStyle:'short',timeZone:e.booking.timezone}).format(start);
 const email=await sendEmail(user!.email,`Booking confirmed: ${product.title}`,`${e.booking.confirmationTitle}\n\n${when} (${e.booking.timezone})\n${slot.duration} minutes\n\n${e.booking.confirmationBody}\n\nPrepare: ${e.booking.preparation}\nMeeting: ${e.booking.meetingUrl||'Your host will provide the meeting details.'}\n\nView your booking: ${origin}/learn/${product.slug}`,`booking/${id}`);
 return {id,emailSent:email.sent};
}
export async function cancelBooking(id:string,userId:string){const db=database(),b=await db.prepare("SELECT * FROM bookings WHERE id=? AND (user_id=? OR owner=?)").bind(id,userId,userId).first();if(!b)throw new ApiError("Booking not found.",404);if(b.status!=="confirmed")throw new ApiError("Only a confirmed booking can be cancelled.",409);await db.batch([db.prepare("UPDATE bookings SET status='cancelled' WHERE id=? AND status='confirmed'").bind(id),db.prepare("UPDATE booking_slots SET booking_id=NULL WHERE id=? AND booking_id=?").bind(b.slot_id,id)]);}
