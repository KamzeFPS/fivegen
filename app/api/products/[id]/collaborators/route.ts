import {failure,identity,sameOrigin} from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import {changeCollaborator,inviteCollaborator,listCollaborators} from '@/lib/creator-collaboration-server';
type Context={params:Promise<{id:string}>};const headers={'Cache-Control':'private, no-store'};
export async function GET(_req:Request,{params}:Context){try{const user=await identity();return Response.json(await listCollaborators((await params).id,user.userId),{headers});}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity();return Response.json(await inviteCollaborator((await params).id,user,await readCreatorContextJson(req,4096)),{headers});}catch(error){return failure(error);}}
export async function PATCH(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity();return Response.json(await changeCollaborator((await params).id,user,await readCreatorContextJson(req,4096)),{headers});}catch(error){return failure(error);}}
