import {failure,identity,sameOrigin} from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import {executeWorkspaceAssistantAction} from '@/lib/workspace-assistant-server';

export async function POST(request:Request){
  try{
    sameOrigin(request);
    const user=await identity();
    return Response.json(await executeWorkspaceAssistantAction(user.userId,await readCreatorContextJson(request,8192)),{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return failure(error);}
}
