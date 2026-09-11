import {z} from 'zod';
import {ApiError,database,failure,identity,sameOrigin,stripe} from '@/lib/server';
import {planFor,syncMembership} from '@/lib/billing';
export async function GET(){try{const u=await identity();return Response.json(await planFor(u.userId));}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 sameOrigin(req);const u=await identity();const {action}=z.object({action:z.string()}).parse(await req.json());
 if(action!=='cancel')throw new ApiError('FiveGen no longer sells plans. All tools are included; buy AI credits in AI & credits.',410);
 const row=await database().prepare('SELECT subscription_id FROM memberships WHERE owner=?').bind(u.userId).first();
 if(!row?.subscription_id)return Response.json({cancelled:true});
 const sub=await stripe('subscriptions/'+row.subscription_id);
 if(sub.metadata?.purpose!=='fivegen_pro'||sub.metadata?.owner!==u.userId)throw new ApiError('This subscription could not be verified.',409);
 if(!['canceled','incomplete_expired'].includes(sub.status)){const updated=await stripe('subscriptions/'+sub.id,new URLSearchParams({cancel_at_period_end:'true'}));await syncMembership(updated);}
 return Response.json({cancelled:true});
}catch(e){return failure(e);}}
