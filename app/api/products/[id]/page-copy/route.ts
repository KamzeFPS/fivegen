import {z} from 'zod';
import {identity,sameOrigin,failure} from '@/lib/server';
import {suggestPageCopy,validatePageCopy} from '@/lib/page-copy-server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const user=await identity(),productId=(await params).id,input=await readCreatorContextJson(req,32768);if((input as {action?:string}).action==='validate'){const v=z.object({action:z.literal('validate'),id:z.string().uuid()}).strict().parse(input);return Response.json({proposal:await validatePageCopy(productId,user.userId,v.id)},{headers:{'Cache-Control':'private, no-store'}});}return Response.json(await suggestPageCopy(productId,user.userId,input),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
