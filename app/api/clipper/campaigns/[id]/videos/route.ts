import {identity,sameOrigin} from '@/lib/server';
import {clipperFailure,clipperResponse} from '@/lib/clipper-server';
import {uploadClipperVideo} from '@/lib/clipper-video';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const user=await identity(),{id}=await params;return clipperResponse(await uploadClipperVideo(request,id,user),201);}catch(error){return clipperFailure(error);}}
