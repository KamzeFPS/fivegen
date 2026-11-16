import {clipperFailure} from '@/lib/clipper-server';
import {publishingMediaVideo} from '@/lib/clipper-publishing';
import {streamClipperVideo} from '@/lib/clipper-video';
async function serve(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params,video=await publishingMediaVideo(id.replace(/\.mp4$/,''),new URL(request.url).searchParams.get('token')||'');const response=await streamClipperVideo(request,video);response.headers.set('Referrer-Policy','no-referrer');response.headers.set('X-Robots-Tag','noindex, nofollow');return response;}catch(error){return clipperFailure(error);}}
export const GET=serve;
export const HEAD=serve;
