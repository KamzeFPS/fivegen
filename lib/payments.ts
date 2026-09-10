import { ApiError, database } from "./server";
export async function recordPayment(
  session: Record<string, any>,
  account: string,
) {
  if (
    session.payment_status !== "paid" ||
    session.mode !== "payment" ||
    session.currency !== "usd"
  )
    throw new ApiError("Payment has not completed yet.", 409);
  const p = await database()
    .prepare(
      "SELECT p.id,p.owner,s.stripe_account FROM products p JOIN sellers s ON p.owner=s.owner WHERE p.id=?",
    )
    .bind(session.metadata?.product_id || "")
    .first();
  if (!p || p.stripe_account !== account || p.owner !== session.metadata?.owner)
    throw new ApiError("Payment could not be matched to this product.", 403);
  const amount = Number(session.amount_total);
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    amount !== Number(session.metadata?.expected_amount)
  )
    throw new ApiError("The payment amount could not be verified.", 409);
  const token = crypto.randomUUID() + crypto.randomUUID();
  await database()
    .prepare(
      "INSERT OR IGNORE INTO orders (id,product_id,owner,email,amount,provider,token,created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .bind(
      session.id,
      p.id,
      p.owner,
      session.customer_details?.email || "customer",
      amount,
      "stripe",
      token,
      Date.now(),
    )
    .run();
  return database()
    .prepare("SELECT token FROM orders WHERE id=?")
    .bind(session.id)
    .first<{ token: string }>();
}
