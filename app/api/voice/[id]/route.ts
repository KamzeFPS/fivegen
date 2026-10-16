import { z } from 'zod';
import { failure, identity, sameOrigin } from '@/lib/server';
import { getVoiceSource, saveVoiceSource, deleteVoiceSource } from '@/lib/creator-voice-server';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { try { const user = await identity(), { id } = await params; return Response.json({ source: await getVoiceSource(id, user.userId) }, { headers: { 'Cache-Control': 'private, no-store' } }); } catch (error) { return failure(error); } }
export async function PATCH(request: Request, { params }: Context) { try { sameOrigin(request); const user = await identity(), { id } = await params; return Response.json({ source: await saveVoiceSource(id, user.userId, await request.json()) }); } catch (error) { return failure(error); } }
export async function DELETE(request: Request, { params }: Context) { try { sameOrigin(request); const user = await identity(), { id } = await params, value = z.object({ expectedUpdatedAt: z.number().int().positive() }).parse(await request.json()); await deleteVoiceSource(id, user.userId, value.expectedUpdatedAt); return Response.json({ deleted: true }); } catch (error) { return failure(error); } }
