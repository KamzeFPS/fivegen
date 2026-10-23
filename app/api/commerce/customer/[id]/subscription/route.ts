import {customerSubscription} from '@/lib/product-studio-commerce';
import {failure,sameOrigin} from '@/lib/server';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(await customerSubscription(req,(await params).id),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);return Response.json(await customerSubscription(req,(await params).id,true));}catch(error){return failure(error);}}

