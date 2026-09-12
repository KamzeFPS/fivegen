import { failure } from '@/lib/server';
import { paddleEnvironment, paddleServer, paddleSigningSecret } from '@/lib/paddle/server';
import { dispatchPaddleEvent } from '@/lib/paddle/events';

export async function POST(request: Request) {
  try {
    const paddle = paddleServer();
    const secret = paddleSigningSecret();
    const signature = request.headers.get('paddle-signature');
    if (!signature) return Response.json({ error: 'Missing Paddle signature.' }, { status: 400 });
    const rawBody = await request.text();
    let event;
    try {
      // The SDK verifies the raw bytes and timestamp BEFORE parsing the event.
      // Never replace secret with an API key or JSON.parse rawBody here.
      event = await paddle.webhooks.unmarshal(rawBody, secret, signature);
    } catch {
      return Response.json({ error: 'Invalid Paddle webhook signature or payload.' }, { status: 400 });
    }
    const handled = await dispatchPaddleEvent(event, paddleEnvironment());
    return Response.json({ received: true, ignored: !handled });
  } catch (error) { return failure(error); }
}
