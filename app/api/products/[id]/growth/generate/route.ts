import {ApiError,failure,identity,sameOrigin} from '@/lib/server';
import {generateGrowthAsset,applyGrowthAsset,listGrowthAssetProposals} from '@/lib/growth-server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const user=await identity(),{id}=await params,value=await readCreatorContextJson(request,2048);if(!value||typeof value!=='object'||!('asset' in value))throw new ApiError('Choose the script, page or email asset to generate. Refresh Sales video to use the scoped draft workflow.',400);return Response.json(await generateGrowthAsset(id,user.userId,value),{headers});}catch(error){return failure(error);}}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const user=await identity(),{id}=await params;return Response.json(await applyGrowthAsset(id,user.userId,await readCreatorContextJson(request,2048)),{headers});}catch(error){return failure(error);}}
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await identity(),{id}=await params;return Response.json({proposals:await listGrowthAssetProposals(id,user.userId)},{headers});}catch(error){return failure(error);}}
