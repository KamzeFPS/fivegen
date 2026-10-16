import { failure, identity } from '@/lib/server';
import { growthDashboard } from '@/lib/growth-analytics';
export async function GET(request:Request){try{const user=await identity(),days=Number(new URL(request.url).searchParams.get('days')||30);return Response.json(await growthDashboard(user.userId,days),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
