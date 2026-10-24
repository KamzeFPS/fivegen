import {failure,sameOrigin} from '@/lib/server';
import {customerOrder} from '@/lib/commerce-v2-server';
import {createPurchaseHelp,purchaseHelp} from '@/lib/buyer-help';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,{params}:Context){try{return Response.json(await purchaseHelp(await customerOrder(req,(await params).id,false,{purchaserOnly:true})),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);return Response.json(await createPurchaseHelp(await customerOrder(req,(await params).id,false,{purchaserOnly:true}),await req.json()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
