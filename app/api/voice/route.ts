import { failure, identity, sameOrigin } from '@/lib/server';
import { listVoiceSources, saveVoiceSource } from '@/lib/creator-voice-server';
import { providerSettings } from '@/lib/ai';
export async function GET() { try { const user = await identity(), settings = await providerSettings(); return Response.json({ sources: await listVoiceSources(user.userId), transcriptionReady: settings.connected.openai && !settings.config.paused }, { headers: { 'Cache-Control': 'private, no-store' } }); } catch (error) { return failure(error); } }
export async function POST(request: Request) { try { sameOrigin(request); const user = await identity(); return Response.json({ source: await saveVoiceSource(null, user.userId, await request.json()) }, { status: 201 }); } catch (error) { return failure(error); } }
