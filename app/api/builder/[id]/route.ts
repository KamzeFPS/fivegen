import {failure,identity,sameOrigin} from '@/lib/server';
import {adoptBuilderWorkspace,builderHeaders,getBuilderWorkspace,saveBuilderWorkspace} from '@/lib/product-builder-server';
type Context={params:Promise<{id:string}>};
export async function GET(_req:Request,{params}:Context){try{const user=await identity(),{id}=await params;return Response.json(await getBuilderWorkspace(id,user.userId),{headers:builderHeaders});}catch(error){return failure(error);}}
export async function PATCH(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity(),{id}=await params;return Response.json(await saveBuilderWorkspace(id,user.userId,await req.json()),{headers:builderHeaders});}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity(),{id}=await params;return Response.json(await adoptBuilderWorkspace(id,user.userId),{headers:builderHeaders});}catch(error){return failure(error);}}
