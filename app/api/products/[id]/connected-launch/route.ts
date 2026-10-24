import { failure, identity, sameOrigin } from '@/lib/server';
import { connectedLaunch, selectConnectedLaunch,reviewGrowthPlanAsset } from '@/lib/connected-launch-server';
import { readCreatorContextJson } from '@/lib/creator-context-request';
type Context={params:Promise<{id:string}>};
const headers={'Cache-Control':'private, no-store'};
export async function GET(_req:Request,{params}:Context){try{const user=await identity();return Response.json({launch:await connectedLaunch((await params).id,user.userId)},{headers});}catch(e){return failure(e);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity();return Response.json({launch:await selectConnectedLaunch((await params).id,user.userId,await readCreatorContextJson(req,2048))},{headers});}catch(e){return failure(e);}}

export async function PATCH(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity();return Response.json({launch:await reviewGrowthPlanAsset((await params).id,user.userId,await readCreatorContextJson(req,2048))},{headers});}catch(error){return failure(error);}}
