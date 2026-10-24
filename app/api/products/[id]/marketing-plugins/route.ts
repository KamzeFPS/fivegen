import { failure, identity, sameOrigin } from '@/lib/server';
import { getMarketingPlugins, marketingPluginHeaders, updateMarketingPlugin } from '@/lib/marketing-plugin-server';

type Context = { params: Promise<{ id: string }> };
function failed(error: unknown) {
  const response = failure(error);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await identity(), { id } = await params;
    return Response.json(await getMarketingPlugins(id, user.userId), { headers: marketingPluginHeaders });
  } catch (error) { return failed(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    sameOrigin(request);
    const user = await identity(), { id } = await params;
    return Response.json(await updateMarketingPlugin(id, user.userId, await request.json()), { headers: marketingPluginHeaders });
  } catch (error) { return failed(error); }
}
