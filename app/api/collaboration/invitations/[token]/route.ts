import {failure,identity,sameOrigin} from '@/lib/server';
import {acceptCollaborationInvitation,inspectCollaborationInvitation} from '@/lib/creator-collaboration-server';
type Context={params:Promise<{token:string}>};const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
export async function GET(_req:Request,{params}:Context){try{const user=await identity();return Response.json({invitation:(await inspectCollaborationInvitation((await params).token,user)).invitation},{headers});}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity();return Response.json(await acceptCollaborationInvitation((await params).token,user),{headers});}catch(error){return failure(error);}}
