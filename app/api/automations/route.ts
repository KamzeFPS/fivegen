import { z } from 'zod';
import { failure, identity, sameOrigin } from '@/lib/server';
import { automationDraftSchema, automationTriggers } from '@/lib/automation';
import { automationResponseHeaders, getAutomationWorkspace, saveAutomation, setAutomationStatus } from '@/lib/automation-server';

const inputSchema = z.object({ productId: z.string().uuid(), trigger: z.enum(automationTriggers), expectedRevision: z.number().int().min(0), action: z.enum(['save', 'activate', 'pause']), draft: automationDraftSchema.optional() });
export async function GET(request: Request) {
  try { const user = await identity(), productId = z.string().uuid().parse(new URL(request.url).searchParams.get('productId')); return Response.json(await getAutomationWorkspace(productId, user.userId), { headers: automationResponseHeaders }); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request); const user = await identity(), input = inputSchema.parse(await request.json());
    const workspace = input.action === 'save' ? await saveAutomation(input.productId, user.userId, input.trigger, input.draft, input.expectedRevision) : await setAutomationStatus(input.productId, user.userId, input.trigger, input.action, input.expectedRevision);
    return Response.json(workspace, { headers: automationResponseHeaders });
  } catch (error) { return failure(error); }
}
