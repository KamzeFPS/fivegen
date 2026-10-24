import { z } from "zod";
import { failure, identity, sameOrigin } from "@/lib/server";
import { getOwnedFunnel,getOwnedFunnelVideoDraft,saveFunnelVideoDraft,publishFunnel, unpublishFunnel } from "@/lib/growth-funnel-server";

const schema = z.object({ expectedUpdatedAt: z.number().int().min(0), expectedGrowthUpdatedAt: z.number().int().min(0), creatorVslUploadId: z.string().uuid().nullable().default(null),expectedVideoDraftUpdatedAt:z.number().int().min(0).optional() });
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { const user = await identity(), { id } = await params;const [funnel,videoDraft]=await Promise.all([getOwnedFunnel(id,user.userId),getOwnedFunnelVideoDraft(id,user.userId)]);return Response.json({funnel,videoDraft}, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return failure(error); }
}
export async function PATCH(request:Request,{params}:Context){
 try{sameOrigin(request);const user=await identity(),{id}=await params;const raw=await request.text();if(raw.length>8192)return Response.json({error:'The video selection is too large.'},{status:413});const input=z.object({expectedUpdatedAt:z.number().int().min(0),creatorVslUploadId:z.string().uuid().nullable()}).strict().parse(JSON.parse(raw));return Response.json({videoDraft:await saveFunnelVideoDraft(id,user.userId,input)},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}
}
export async function POST(request: Request, { params }: Context) {
  try { sameOrigin(request); const user = await identity(), { id } = await params; return Response.json({ funnel: await publishFunnel(id, user.userId, schema.parse(await request.json())) }); } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, { params }: Context) {
  try { sameOrigin(request); const user = await identity(), { id } = await params; return Response.json({ funnel: await unpublishFunnel(id, user.userId) }); } catch (error) { return failure(error); }
}
