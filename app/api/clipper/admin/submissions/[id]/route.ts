import {clipperFailure as failure} from '@/lib/clipper-server';
import {requireAdmin} from '@/lib/admin';
import {sameOrigin} from '@/lib/server';
import {reviewClipperSubmission,clipperJsonBody,clipperResponse} from '@/lib/clipper-server';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const user=await requireAdmin(),{id}=await params;return clipperResponse(await reviewClipperSubmission(user.userId,id,await clipperJsonBody(request)));}catch(error){return failure(error);}}
