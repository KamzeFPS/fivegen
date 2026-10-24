import {failure,identity} from '@/lib/server';
import {listCollaborationWorkspaces} from '@/lib/creator-collaboration-server';
export async function GET(){try{return Response.json(await listCollaborationWorkspaces(await identity()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
