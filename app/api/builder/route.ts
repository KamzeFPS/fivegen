import {failure,identity,sameOrigin} from '@/lib/server';
import {builderHeaders,createBuilderWorkspace} from '@/lib/product-builder-server';
export async function POST(req:Request){try{sameOrigin(req);const user=await identity();return Response.json(await createBuilderWorkspace(user.userId,await req.json()),{status:201,headers:builderHeaders});}catch(error){return failure(error);}}
