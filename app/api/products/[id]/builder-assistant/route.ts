import { failure, identity, sameOrigin } from '@/lib/server';
import { readBuilderAssistant, sendBuilderAssistant } from '@/lib/builder-assistant';

function privateResponse(response: Response) { response.headers.set('Cache-Control', 'private, no-store'); return response; }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await identity(), { id } = await params; return privateResponse(Response.json(await readBuilderAssistant(id, user.userId))); }
  catch (error) { return privateResponse(failure(error)); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { sameOrigin(request); const user = await identity(), { id } = await params; return privateResponse(Response.json(await sendBuilderAssistant(id, user.userId, await request.json()))); }
  catch (error) { return privateResponse(failure(error)); }
}
