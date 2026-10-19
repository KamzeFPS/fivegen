import { failure, identity } from '@/lib/server';
import { growthDashboard } from '@/lib/growth-analytics';
export async function GET(request:Request){try{const user=await identity(),query=new URL(request.url).searchParams,days=Number(query.get('days')||30),productId=query.get('productId')||undefined;return Response.json(await growthDashboard(user.userId,days,productId),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
