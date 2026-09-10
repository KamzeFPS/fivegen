import { binding, failure, ApiError, stripe } from "@/lib/server";
import { recordPayment, recordRenewal } from "@/lib/payments";
import { syncMembership } from "@/lib/billing";
export async function POST(req: Request) {
  try {
    const secrets = [binding("STRIPE_WEBHOOK_SECRET"),binding("STRIPE_BILLING_WEBHOOK_SECRET")].filter(Boolean);
    if (!secrets.length) throw new ApiError("Webhook is not configured.", 503);
    const body = await req.text();
    const signature = req.headers.get("stripe-signature") || "";
    const parts = signature.split(",").map((s) => s.split("="));
    const time = parts.find((s) => s[0] === "t")?.[1];
    const candidates = parts.filter((s) => s[0] === "v1").map((s) => s[1]);
    if (!time || Math.abs(Date.now() / 1000 - Number(time)) > 300)
      throw new ApiError("Invalid signature timestamp.", 400);
    let valid = false;
    for(const secret of secrets){
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
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
    }
    if (!valid) throw new ApiError("Invalid signature.", 400);
    const event = JSON.parse(body);
    const object=event.data.object;
    if(!event.account && event.type.startsWith("customer.subscription.") && object.metadata?.purpose==="fivegen_pro"){
      await syncMembership(await stripe(`subscriptions/${object.id}`));
    }
    if(!event.account && event.type==="checkout.session.completed" && object.metadata?.purpose==="fivegen_pro" && object.payment_status==="paid" && object.subscription){
      await syncMembership(await stripe(`subscriptions/${object.subscription}`));
    }
    if(event.account && event.type==="invoice.paid")await recordRenewal(object,String(event.account));
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type) &&
      event.data.object.payment_status === "paid" &&
      event.data.object.metadata?.product_id &&
      event.data.object.metadata?.owner
      && event.account
    ) {
      await recordPayment(event.data.object, event.account || "");
    }
    return Response.json({ received: true });
  } catch (e) {
    return failure(e);
  }
}
