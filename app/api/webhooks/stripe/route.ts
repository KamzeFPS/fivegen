import { binding, failure, ApiError } from "@/lib/server";
import { recordPayment } from "@/lib/payments";
export async function POST(req: Request) {
  try {
    const secret = binding("STRIPE_WEBHOOK_SECRET");
    if (!secret) throw new ApiError("Webhook is not configured.", 503);
    const body = await req.text();
    const signature = req.headers.get("stripe-signature") || "";
    const parts = signature.split(",").map((s) => s.split("="));
    const time = parts.find((s) => s[0] === "t")?.[1];
    const candidates = parts.filter((s) => s[0] === "v1").map((s) => s[1]);
    if (!time || Math.abs(Date.now() / 1000 - Number(time)) > 300)
      throw new ApiError("Invalid signature timestamp.", 400);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    let valid = false;
    for (const c of candidates) {
      if (!/^[a-f0-9]{64}$/.test(c)) continue;
      const bytes = Uint8Array.from(c.match(/.{2}/g)!, (v) => parseInt(v, 16));
      if (
        await crypto.subtle.verify(
          "HMAC",
          key,
          bytes,
          new TextEncoder().encode(`${time}.${body}`),
        )
      )
        valid = true;
    }
    if (!valid) throw new ApiError("Invalid signature.", 400);
    const event = JSON.parse(body);
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type) &&
      event.data.object.payment_status === "paid" &&
      event.data.object.metadata?.product_id &&
      event.data.object.metadata?.owner
    ) {
      await recordPayment(event.data.object, event.account || "");
    }
    return Response.json({ received: true });
  } catch (e) {
    return failure(e);
  }
}
