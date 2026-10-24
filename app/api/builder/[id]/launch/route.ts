import {failure,identity,sameOrigin} from '@/lib/server';
import {creatorLaunchInput,creatorLaunchState,updateCreatorLaunch} from '@/lib/creator-launch-server';
import {builderHeaders} from '@/lib/product-builder-server';
type Context={params:Promise<{id:string}>};
export async function GET(_req:Request,{params}:Context){try{const user=await identity();return Response.json(await creatorLaunchState((await params).id,user.userId),{headers:builderHeaders});}catch(error){return failure(error);}}
export async function PATCH(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity();return Response.json(await updateCreatorLaunch((await params).id,user.userId,await creatorLaunchInput(req)),{headers:builderHeaders});}catch(error){return failure(error);}}
