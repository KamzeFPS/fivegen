import {z} from 'zod';
import {identity,sameOrigin,failure} from '@/lib/server';
import {creatorContextWorkspace,saveCreatorSelection} from '@/lib/creator-context-server';
import {applyCreatorContextProposal} from '@/lib/creator-context-apply';
import {readCreatorContextJson} from '@/lib/creator-context-request';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
type Context={params:Promise<{id:string}>};
export async function GET(_req:Request,{params}:Context){try{const user=await identity();return Response.json(await creatorContextWorkspace(user.userId,(await params).id),{headers});}catch(error){return failure(error);}}
export async function PUT(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity(),{id}=await params;return Response.json({selection:await saveCreatorSelection(user.userId,id,await readCreatorContextJson(req,4096))},{headers});}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity(),{id}=await params,value=z.object({action:z.literal('apply'),messageId:z.string().min(1).max(100),expectedVersion:z.number().int().positive(),mode:z.enum(['append','replace']).default('replace')}).strict().parse(await readCreatorContextJson(req,4096));return Response.json(await applyCreatorContextProposal(user.userId,id,value),{headers});}catch(error){return failure(error);}}
