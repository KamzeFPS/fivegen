import {clipperFailure as failure} from '@/lib/clipper-server';
import {requireAdmin} from '@/lib/admin';
import {database,sameOrigin} from '@/lib/server';
import {reviewClipperSubmission,clipperJsonBody,clipperResponse} from '@/lib/clipper-server';
import {approveClipperVideo} from '@/lib/clipper-publishing';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{
 sameOrigin(request);const user=await requireAdmin(),{id}=await params,input=await clipperJsonBody(request);
 const row=await database().prepare('SELECT video_id FROM clipper_submissions WHERE id=?').bind(id).first();
 if(row?.video_id&&input?.status==='approved')return clipperResponse(await approveClipperVideo(user.userId,id,{caption:input.caption,platforms:input.platforms,reviewNote:input.reviewNote}));
 return clipperResponse(await reviewClipperSubmission(user.userId,id,input));
}catch(error){return failure(error);}}
