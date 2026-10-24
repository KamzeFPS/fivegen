import {identity,failure} from '@/lib/server';
import {marketingToolActivity} from '@/lib/marketing-activity-server';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{const user=await identity();return Response.json({activity:await marketingToolActivity((await params).id,user.userId)},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
