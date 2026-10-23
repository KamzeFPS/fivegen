import {failure,identity,sameOrigin} from '@/lib/server';
import {builderHeaders,convertBuilderWorkspace} from '@/lib/product-builder-server';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const user=await identity();return Response.json(await convertBuilderWorkspace((await params).id,user.userId,await req.json()),{headers:builderHeaders});}catch(error){return failure(error);}}
