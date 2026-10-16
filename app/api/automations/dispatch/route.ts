import { binding, failure } from '@/lib/server';
import { automationResponseHeaders, dispatchAutomations } from '@/lib/automation-server';

export async function POST(request: Request) {
  const secret = binding('AUTOMATION_DISPATCH_SECRET'), authorization = request.headers.get('authorization') || '';
  if (secret.length < 32 || authorization !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: automationResponseHeaders });
  try { return Response.json(await dispatchAutomations(5), { headers: automationResponseHeaders }); } catch (error) { return failure(error); }
}
