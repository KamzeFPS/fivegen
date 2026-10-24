import { ApiError, database, identity } from "./server";
import { assertSubscriptionAccess, orderItems } from "./payments";
import {resolveFileSaleAccess} from './file-sales';
export async function productAccess(product:Record<string,unknown>,token?:string,requireMember=false) {
  const user=await identity().catch(()=>null);
  const sale=await resolveFileSaleAccess(product,token,user);
  if(sale){if(requireMember&&!user)throw new ApiError('Sign in using your purchase email to continue.',401);return {user,owner:sale.owner};}
  if(user?.userId===product.owner)return {user,owner:true};
  if(requireMember&&!user)throw new ApiError("Sign in to join the classroom or community.",401);
  const rows=token? await database().prepare("SELECT * FROM orders WHERE token=? AND owner=?").bind(token,product.owner).all():user?await database().prepare("SELECT * FROM orders WHERE lower(email)=? AND owner=? ORDER BY created_at DESC LIMIT 200").bind(user.email.toLowerCase(),product.owner).all():{results:[]};
  for(const order of rows.results){
    if(order.product_id!==product.id&&!orderItems(order).some(i=>i.id===product.id))continue;
    if(requireMember&&String(order.email).toLowerCase()!==user!.email.toLowerCase())continue;
    await assertSubscriptionAccess(order);
    return {user,owner:false};
  }
  throw new ApiError("This product belongs to customers with access. Use your purchase email to sign in, or open your private access link.",403);
}
