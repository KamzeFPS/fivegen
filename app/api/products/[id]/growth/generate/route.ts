import { failure, identity, sameOrigin } from '@/lib/server';
import { generateGrowth } from '@/lib/growth-server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const user = await identity(), { id } = await params;
    return Response.json(await generateGrowth(id, user.userId, await request.json()));
  } catch (error) { return failure(error); }
}
