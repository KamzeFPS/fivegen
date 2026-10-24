import {identity,sameOrigin,failure} from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import {applyBrandPreset} from '@/lib/page-template-server';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const user=await identity();return Response.json(await applyBrandPreset((await params).id,user.userId,await readCreatorContextJson(request,1024*1024)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
