import {failure,identity,sameOrigin} from '@/lib/server';
import {creatorRefundAction,creatorRefundHistory} from '@/lib/creator-refund-server';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{const user=await identity();return Response.json(await creatorRefundHistory((await params).id,user.userId),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const user=await identity();return Response.json(await creatorRefundAction((await params).id,user.userId,await req.json()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
