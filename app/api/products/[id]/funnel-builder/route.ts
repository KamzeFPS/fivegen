import {failure,identity,sameOrigin} from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import {getFunnelBuilder,saveFunnelBuilder} from '@/lib/funnel-builder-server';
const headers={'Cache-Control':'private, no-store'};
function failed(error:unknown){const response=failure(error);response.headers.set('Cache-Control','private, no-store');return response;}
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await identity(),{id}=await params;return Response.json({workspace:await getFunnelBuilder(id,user.userId)},{headers});}catch(error){return failed(error);}}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const user=await identity(),{id}=await params;return Response.json({workspace:await saveFunnelBuilder(id,user.userId,await readCreatorContextJson(request,8388608))},{headers});}catch(error){return failed(error);}}
