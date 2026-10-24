import {z} from 'zod';
import {ApiError,binding,database,ownedProduct} from './server';
import {builderOrderDelivery} from './builder-delivery-server';

type Order=Record<string,unknown>;
export type TeamSeat={id:string;email:string;createdAt:number};
export type TeamLicenseView={enabled:boolean;totalSeats:number;capacity:number;allocated:number;remaining:number;seats:TeamSeat[];nextOffset:number|null;offset:number;licenseTerms:string};
const email=(value:string)=>value.trim().toLowerCase();
async function license(order:Order){
  if(order.status!=='paid')return null;
  const snapshot=await builderOrderDelivery(String(order.id)),settings=snapshot?.studio?.playbook;
  if(snapshot?.builderType!=='playbook'||settings?.teamLicense!=='team')return null;
  const total=Number(settings.seats||1);if(!Number.isSafeInteger(total)||total<1||total>1000)return null;
  return {total,capacity:Math.max(0,total-1),terms:typeof settings.licenseTerms==='string'?settings.licenseTerms:''};
}
/** This helper only expands read/content access. Purchaser-only mutations must
 * use customerOrder(...,{purchaserOnly:true}) before invoking their operation. */
export async function teamSeatAllows(order:Order,userEmail:string){
  if(!userEmail||!await license(order))return false;
  return !!await database().prepare("SELECT id FROM product_team_seats WHERE order_id=? AND owner=? AND product_id=? AND mode=? AND email=? AND status='active'").bind(order.id,order.owner,order.product_id,order.mode,email(userEmail)).first();
}
export async function teamSeatOrderIds(userEmail:string,mode:'test'|'live'){
  if(!userEmail)return [];
  const rows=await database().prepare("SELECT o.* FROM product_team_seats s JOIN commerce_orders o ON o.id=s.order_id AND o.owner=s.owner AND o.product_id=s.product_id AND o.mode=s.mode WHERE s.email=? AND s.mode=? AND s.status='active' AND o.status='paid' ORDER BY s.created_at DESC LIMIT 100").bind(email(userEmail),mode).all();
  const ids:string[]=[];for(const order of rows.results)if(await license(order))ids.push(String(order.id));return ids;
}
export async function listTeamSeats(order:Order,offset=0):Promise<TeamLicenseView>{
  const settings=await license(order);if(!settings)return {enabled:false,totalSeats:1,capacity:0,allocated:0,remaining:0,seats:[],nextOffset:null,offset:0,licenseTerms:''};
  const position=Number.isSafeInteger(offset)&&offset>=0?Math.min(offset,1000):0,db=database();
  const [count,rows]=await Promise.all([
    db.prepare("SELECT COUNT(*) n FROM product_team_seats WHERE order_id=? AND owner=? AND product_id=? AND mode=? AND status='active'").bind(order.id,order.owner,order.product_id,order.mode).first(),
    db.prepare("SELECT id,email,created_at FROM product_team_seats WHERE order_id=? AND owner=? AND product_id=? AND mode=? AND status='active' ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET ?").bind(order.id,order.owner,order.product_id,order.mode,position).all(),
  ]);
  const allocated=Number(count?.n||0);return {enabled:true,totalSeats:settings.total,capacity:settings.capacity,allocated,remaining:Math.max(0,settings.capacity-allocated),seats:rows.results.map(row=>({id:String(row.id),email:String(row.email),createdAt:Number(row.created_at)})),offset:position,nextOffset:position+100<allocated?position+100:null,licenseTerms:settings.terms};
}
const changeSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('grant'),email:z.string().trim().email().max(254)}),
  z.object({action:z.literal('revoke'),seatId:z.string().uuid()}),
]);
export async function changeTeamSeat(order:Order,input:unknown){
  const value=changeSchema.parse(input),settings=await license(order);if(!settings)throw new ApiError('This purchase does not include a team license.',403);
  const db=database(),now=Date.now();
  if(value.action==='revoke'){
    await db.prepare("UPDATE product_team_seats SET status='revoked',updated_at=? WHERE id=? AND order_id=? AND owner=? AND product_id=? AND mode=? AND status='active'").bind(now,value.seatId,order.id,order.owner,order.product_id,order.mode).run();
    return listTeamSeats(order);
  }
  const address=email(value.email);if(address===email(String(order.email)))throw new ApiError('Your purchaser access already occupies one included seat.');
  const existing=await db.prepare("SELECT id FROM product_team_seats WHERE order_id=? AND email=? AND status='active'").bind(order.id,address).first();if(existing)return listTeamSeats(order);
  // Capacity, current paid state and row ownership are tested in the same SQL
  // statement as allocation, including reactivation, so parallel grants cannot
  // exceed the frozen purchased license.
  const result=await db.prepare(`INSERT INTO product_team_seats(id,order_id,owner,product_id,mode,email,status,created_at,updated_at)
    SELECT ?,?,?,?,?,?,'active',?,? WHERE EXISTS(SELECT 1 FROM commerce_orders WHERE id=? AND owner=? AND product_id=? AND mode=? AND status='paid')
    AND (SELECT COUNT(*) FROM product_team_seats WHERE order_id=? AND status='active')<?
    ON CONFLICT(order_id,email) DO UPDATE SET status='active',updated_at=excluded.updated_at
    WHERE product_team_seats.status='revoked' AND product_team_seats.owner=excluded.owner AND product_team_seats.product_id=excluded.product_id AND product_team_seats.mode=excluded.mode`).bind(crypto.randomUUID(),order.id,order.owner,order.product_id,order.mode,address,now,now,order.id,order.owner,order.product_id,order.mode,order.id,settings.capacity).run();
  if(!result.meta.changes){const duplicate=await db.prepare("SELECT id FROM product_team_seats WHERE order_id=? AND email=? AND status='active'").bind(order.id,address).first();if(!duplicate)throw new ApiError('All included team seats are allocated. Remove a teammate before adding another.',409);}
  return listTeamSeats(order);
}
export async function creatorTeamLicenses(productId:string,owner:string){
  await ownedProduct(productId,owner);const mode=binding('STRIPE_MODE')==='live'?'live':'test';
  const orders=await database().prepare("SELECT * FROM commerce_orders WHERE product_id=? AND owner=? AND mode=? AND status='paid' ORDER BY paid_at DESC LIMIT 100").bind(productId,owner,mode).all();
  const licenses:{orderId:string;purchaserEmail:string;totalSeats:number;allocatedSeats:number;remaining:number}[]=[];
  for(const order of orders.results){const settings=await license(order);if(!settings)continue;const count=await database().prepare("SELECT COUNT(*) n FROM product_team_seats WHERE order_id=? AND owner=? AND product_id=? AND mode=? AND status='active'").bind(order.id,owner,productId,mode).first(),allocated=Number(count?.n||0);licenses.push({orderId:String(order.id),purchaserEmail:String(order.email),totalSeats:settings.total,allocatedSeats:allocated,remaining:Math.max(0,settings.capacity-allocated)});}
  return {licenses,totalAllocated:licenses.reduce((sum,item)=>sum+item.allocatedSeats,0)};
}
