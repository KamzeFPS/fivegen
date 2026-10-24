import { failure, identity, sameOrigin } from '@/lib/server';
import { getCampaignWorkspace,saveCampaign,createCampaign,selectCampaign } from '@/lib/campaign-server';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) { try { const user = await identity(), { id } = await params; return Response.json({ ...await getCampaignWorkspace(id,user.userId,new URL(request.url).searchParams.get('campaignId')||undefined) }, { headers: { 'Cache-Control': 'private, no-store' } }); } catch (error) { return failure(error); } }
export async function PATCH(request: Request, { params }: Context) { try { sameOrigin(request); const user = await identity(), { id } = await params; return Response.json({ campaign: await saveCampaign(id, user.userId, await request.json()) }); } catch (error) { return failure(error); } }

export async function POST(request:Request,{params}:Context){try{sameOrigin(request);const user=await identity(),{id}=await params,input=await request.json() as {select?:string;title?:string};return Response.json(input.select?await selectCampaign(id,user.userId,input.select):await createCampaign(id,user.userId,input));}catch(error){return failure(error);}}
