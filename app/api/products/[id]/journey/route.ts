import {failure,identity} from '@/lib/server';
import {journeyResults} from '@/lib/journey-results-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{const user=await identity(),{id}=await params;return Response.json(await journeyResults(id,user.userId,Object.fromEntries(new URL(req.url).searchParams)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
