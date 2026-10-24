import { identity, failure } from '@/lib/server';
import { getPageRevisions } from '@/lib/page-template-server';
export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) { try { const user = await identity(); return Response.json({ revisions: await getPageRevisions((await params).id, user.userId) }, { headers: {'Cache-Control':'private, no-store'} }); } catch(error) { return failure(error); } }
