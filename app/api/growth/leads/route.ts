import { ApiError, failure, sameOrigin } from "@/lib/server";
import { leadInputSchema } from "@/lib/growth-funnel";
import { captureLead, getPublicFunnel, limitLeadCapture } from "@/lib/growth-funnel-server";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await request.text();
    if (body.length > 4096) throw new ApiError("Please shorten your response.", 413);
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { throw new ApiError("Send a valid signup form."); }
    const input = leadInputSchema.parse(parsed);
    const funnel = await getPublicFunnel(input.slug);
    await limitLeadCapture(funnel.productId, input.email);
    if (!input.website) await captureLead(funnel, input);
    return Response.json({ success: true, message: funnel.landing.thankYou }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
