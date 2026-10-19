import { failure, identity } from '@/lib/server';
import { exportOfferResponses } from '@/lib/offer-lab-server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await identity(), { id } = await params; return await exportOfferResponses(id, user.userId); } catch (error) { return failure(error); }
}
