import { failure, identity } from '@/lib/server';
import { paddleAccount } from '@/lib/paddle/account';
export async function GET() {
  try { const user = await identity(); return Response.json(await paddleAccount(user.userId), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return failure(error); }
}
