import {ApiError,identity} from '@/lib/server';
import {isAdmin} from '@/lib/admin';
import {clipperFailure,getClipperSubmission} from '@/lib/clipper-server';
import {getClipperVideo,streamClipperVideo} from '@/lib/clipper-video';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await identity(),{id}=await params,submission=await getClipperSubmission(id);if(!submission.videoId||(submission.owner!==user.userId&&!isAdmin(user)))throw new ApiError('Video not found.',404);return streamClipperVideo(request,await getClipperVideo(submission.videoId));}catch(error){return clipperFailure(error);}}
export const HEAD=GET;
