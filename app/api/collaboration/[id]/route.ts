import {failure,identity,sameOrigin} from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import {collaborationWorkspace,saveCollaborationDraft} from '@/lib/creator-collaboration-server';
type Context={params:Promise<{id:string}>};const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
export async function GET(_req:Request,{params}:Context){try{const user=await identity();return Response.json(await collaborationWorkspace((await params).id,user),{headers});}catch(error){return failure(error);}}
export async function PATCH(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity();return Response.json(await saveCollaborationDraft((await params).id,user,await readCreatorContextJson(req,1024*1024)),{headers});}catch(error){return failure(error);}}
