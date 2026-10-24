import { identity, sameOrigin, failure } from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import { getBrandPresets, saveBrandPreset } from '@/lib/page-template-server';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() { try { const user = await identity(); return Response.json({ presets: await getBrandPresets(user.userId) }, { headers }); } catch(error) { return failure(error); } }
export async function POST(request: Request) { try { sameOrigin(request); const user = await identity(); return Response.json({ presets: await saveBrandPreset(user.userId, await readCreatorContextJson(request,32*1024)) }, { headers }); } catch(error) { return failure(error); } }
