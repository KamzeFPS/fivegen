import {clipperFailure as failure} from '@/lib/clipper-server';
import {identity,sameOrigin} from '@/lib/server';
import {saveClipperProfile,clipperJsonBody,clipperResponse} from '@/lib/clipper-server';
export async function PUT(request:Request){try{sameOrigin(request);const user=await identity();return clipperResponse(await saveClipperProfile(user.userId,await clipperJsonBody(request)));}catch(error){return failure(error);}}
