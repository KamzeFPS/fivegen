import {clipperFailure as failure} from '@/lib/clipper-server';
import {identity,sameOrigin} from '@/lib/server';
import {submitClipperClip,clipperJsonBody,clipperResponse} from '@/lib/clipper-server';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const user=await identity(),{id}=await params;return clipperResponse(await submitClipperClip(user.userId,id,await clipperJsonBody(request)),201);}catch(error){return failure(error);}}
