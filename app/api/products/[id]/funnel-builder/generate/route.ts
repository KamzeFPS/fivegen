import {failure,identity,sameOrigin} from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import {generateFunnelBuilder} from '@/lib/funnel-builder-server';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const user=await identity(),{id}=await params;return Response.json(await generateFunnelBuilder(id,user.userId,await readCreatorContextJson(request,4096)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){const response=failure(error);response.headers.set('Cache-Control','private, no-store');return response;}}
