import {failure,sameOrigin} from '@/lib/server';
import {productPushStatus,productPushAction} from '@/lib/product-push-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(await productPushStatus(req,(await params).id),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);return Response.json(await productPushAction(req,(await params).id,await req.json()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
