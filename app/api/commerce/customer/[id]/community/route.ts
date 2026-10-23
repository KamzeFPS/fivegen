import {failure,sameOrigin} from '@/lib/server';
import {communityState,communityAction} from '@/lib/product-community-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(await communityState(req,(await params).id),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);return Response.json(await communityAction(req,(await params).id,await req.json()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
