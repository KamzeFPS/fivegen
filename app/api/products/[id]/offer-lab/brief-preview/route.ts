import {z} from 'zod';
import {identity,failure} from '@/lib/server';
import {offerBriefPreview} from '@/lib/offer-lab-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{const user=await identity(),variant=z.enum(['a','b']).parse(new URL(req.url).searchParams.get('variant'));return Response.json(await offerBriefPreview((await params).id,user.userId,variant),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
