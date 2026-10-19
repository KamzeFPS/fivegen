import { failure, identity, sameOrigin } from '@/lib/server';
import { getCampaign, saveCampaign } from '@/lib/campaign-server';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { try { const user = await identity(), { id } = await params; return Response.json({ campaign: await getCampaign(id, user.userId) }, { headers: { 'Cache-Control': 'private, no-store' } }); } catch (error) { return failure(error); } }
export async function PATCH(request: Request, { params }: Context) { try { sameOrigin(request); const user = await identity(), { id } = await params; return Response.json({ campaign: await saveCampaign(id, user.userId, await request.json()) }); } catch (error) { return failure(error); } }
