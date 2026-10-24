import {failure,identity,sameOrigin} from '@/lib/server';
import {publishBuilderProduct} from '@/lib/product-builder-publication';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const user=await identity(),{id}=await params;return Response.json(await publishBuilderProduct(id,user.userId,await request.json()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
