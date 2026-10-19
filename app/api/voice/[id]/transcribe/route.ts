import { failure, identity, sameOrigin } from '@/lib/server';
import { transcribeVoiceSource } from '@/lib/creator-voice-server';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { sameOrigin(request); const user = await identity(), { id } = await params; return Response.json(await transcribeVoiceSource(id, user.userId, await request.json())); } catch (error) { return failure(error); } }
