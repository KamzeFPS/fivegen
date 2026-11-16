import {binding} from '@/lib/server';
import {clipperResponse,clipperFailure} from '@/lib/clipper-server';
import {dispatchClipperPublishing} from '@/lib/clipper-publishing';
export async function POST(request:Request){const secret=binding('CLIPPER_PUBLISHING_DISPATCH_SECRET');if(secret.length<32||request.headers.get('authorization')!=='Bearer '+secret)return clipperResponse({error:'Unauthorized.'},401);try{return clipperResponse(await dispatchClipperPublishing());}catch(error){return clipperFailure(error);}}
