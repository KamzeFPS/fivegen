import { z } from 'zod';
import { failure, sameOrigin } from '@/lib/server';
import { automationResponseHeaders, unsubscribeAutomation } from '@/lib/automation-server';

export async function POST(request: Request) {
  try { sameOrigin(request); const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(await request.json()); await unsubscribeAutomation(token); return Response.json({ success: true }, { headers: automationResponseHeaders }); } catch (error) { return failure(error); }
}
