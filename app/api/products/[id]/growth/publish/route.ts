import { z } from "zod";
import { failure, identity, sameOrigin } from "@/lib/server";
import { getOwnedFunnel, publishFunnel, unpublishFunnel } from "@/lib/growth-funnel-server";

const schema = z.object({ expectedUpdatedAt: z.number().int().min(0), expectedGrowthUpdatedAt: z.number().int().min(0), creatorVslUploadId: z.string().uuid().nullable().default(null) });
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { const user = await identity(), { id } = await params; return Response.json({ funnel: await getOwnedFunnel(id, user.userId) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  try { sameOrigin(request); const user = await identity(), { id } = await params; return Response.json({ funnel: await publishFunnel(id, user.userId, schema.parse(await request.json())) }); } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, { params }: Context) {
  try { sameOrigin(request); const user = await identity(), { id } = await params; return Response.json({ funnel: await unpublishFunnel(id, user.userId) }); } catch (error) { return failure(error); }
}
