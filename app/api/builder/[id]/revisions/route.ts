import {failure,identity,sameOrigin} from '@/lib/server';
import {builderHeaders,getBuilderRevisionHistory,restoreBuilderRevision} from '@/lib/product-builder-server';

type Context={params:Promise<{id:string}>};
export async function GET(req:Request,{params}:Context){try{
 const user=await identity(),{id}=await params,before=new URL(req.url).searchParams.get('before');
 return Response.json(await getBuilderRevisionHistory(id,user.userId,before===null?undefined:Number(before)),{headers:builderHeaders});
}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:Context){try{
 sameOrigin(req);const user=await identity(),{id}=await params;
 return Response.json(await restoreBuilderRevision(id,user.userId,await req.json()),{headers:builderHeaders});
}catch(error){return failure(error);}}
