import {clipperFailure as failure} from '@/lib/clipper-server';
import {requireAdmin} from '@/lib/admin';
import {ApiError,sameOrigin} from '@/lib/server';
import {saveClipperCampaign,clipperJsonBody,clipperResponse} from '@/lib/clipper-server';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const user=await requireAdmin(),{id}=await params,input=await clipperJsonBody(request);if(!input||typeof input!=='object'||Array.isArray(input))throw new ApiError('Send a valid campaign.',400);const {expectedVersion,...value}=input;return clipperResponse(await saveClipperCampaign(user.userId,value,id,expectedVersion));}catch(error){return failure(error);}}
