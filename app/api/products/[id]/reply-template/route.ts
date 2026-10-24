import {failure,identity,sameOrigin} from '@/lib/server';
import {getReplyTemplate,saveReplyTemplate} from '@/lib/reply-template-server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
type Context={params:Promise<{id:string}>};
export async function GET(_req:Request,{params}:Context){try{const user=await identity();return Response.json({template:await getReplyTemplate((await params).id,user.userId)},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
export async function PUT(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity();return Response.json({template:await saveReplyTemplate((await params).id,user.userId,await readCreatorContextJson(req,16000))});}catch(e){return failure(e);}}
