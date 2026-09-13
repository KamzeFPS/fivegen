import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import type { Product } from "./product";
import { readCommerce } from "./commerce";
import { readExperience } from "./experience";
import { mcpIdentity } from "./mcp-context";
import {acceptedTerms} from './terms';
export function binding(name: string): string {
  return String(
    (env as unknown as Record<string, unknown>)[name] ||
      process.env[name] ||
      "",
  );
}
export function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db)
    throw new Error(
      "Your workspace database is not available. Please try again shortly.",
    );
  return db;
}
export async function identity(options:{allowUnaccepted?:boolean}={}) {
  const user = mcpIdentity.getStore() || await getChatGPTUser();
  if (!user)
    throw new ApiError("Sign in to create and save your products.", 401);
  if(!options.allowUnaccepted&&!await acceptedTerms(user.userId))throw new ApiError('Review and accept the updated Terms & Conditions at /welcome before continuing.',428);
  return user;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function failure(error: unknown) {
  if (error instanceof ApiError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error && typeof error === "object" && "issues" in error)
    return Response.json(
      { error: "Please check your inputs and try again." },
      { status: 400 },
    );
  console.error(error);
  return Response.json(
    {
      error:
        "Something went wrong. Your changes were not saved. Please try again.",
    },
    { status: 500 },
  );
}
export function productFromRow(r: Record<string, unknown>): Product {
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    description: String(r.description),
    audience: String(r.audience),
    format: r.format as Product["format"],
    price: Number(r.price) / 100,
    color: r.color as Product["color"],
    content: JSON.parse(String(r.content)),
    status: r.status as Product["status"],
    commerce: readCommerce(r.commerce),
    experience: readExperience(r.experience),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}
export async function ownedProduct(id: string, owner: string) {
  const r = await database()
    .prepare("SELECT * FROM products WHERE id=? AND owner=?")
    .bind(id, owner)
    .first();
  if (!r) throw new ApiError("Product not found.", 404);
  return r;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError("This request is not allowed.", 403);
}
export function stripeMode(): "live" | "test" | null {
  const key = binding("STRIPE_SECRET_KEY");
  return /^(sk|rk)_live_/.test(key) ? "live" : /^(sk|rk)_test_/.test(key) ? "test" : null;
}
export function stripeConfigured() {
  const mode = stripeMode();
  const expected = binding("STRIPE_MODE");
  return !!mode && (!expected || mode === expected);
}
export function assertStripeMode(livemode: unknown) {
  if (!stripeConfigured()) throw new ApiError("Platform payments are not configured for this environment.", 503);
  if (typeof livemode !== "boolean" || livemode !== (stripeMode() === "live"))
    throw new ApiError("The Stripe payment environment does not match this platform.", 400);
}
export async function stripe(
  path: string,
  body?: URLSearchParams,
  account?: string,
  idempotencyKey?: string,
): Promise<Record<string, any>> {
  const key = binding("STRIPE_SECRET_KEY");
  if (!stripeConfigured())
    throw new ApiError(
      "Platform payments are not configured for this environment. The administrator needs to check Stripe settings.",
      503,
    );
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(account ? { "Stripe-Account": account } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body?.toString(),
    signal: AbortSignal.timeout(30000),
  });
  const data = (await res.json()) as Record<string, any>;
  if (!res.ok)
    throw new ApiError(
      data.error?.message || "Stripe could not complete this request.",
      502,
    );
  return data;
}
