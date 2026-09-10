import { z } from "zod";
import { ApiError, binding, database } from "./server";
import {reserveAIBudget} from "./credits";
export const providerSchema = z.object({
  dailyBudget:z.number().min(1).max(10000).default(10),
  paused:z.boolean().default(false),
  textProvider: z.enum(["openai", "anthropic"]).default("openai"),
  textModel: z
    .enum(["gpt-4.1-mini", "claude-haiku-4-5"])
    .default("gpt-4.1-mini"),
  imageModel: z
    .enum(["fal-ai/flux-pro/v1.1-ultra"])
    .default("fal-ai/flux-pro/v1.1-ultra"),
  videoModel: z
    .enum(["fal-ai/kling-video/v2.6/pro/text-to-video"])
    .default("fal-ai/kling-video/v2.6/pro/text-to-video"),
});
export const MASTER_OWNER="__fivegen_platform__";
export type ProviderConfig = z.infer<typeof providerSchema>;
async function cryptoKey() {
  const raw = binding("CREDENTIAL_ENCRYPTION_KEY");
  if (!raw)
    throw new ApiError(
      "API key storage is not configured. Set CREDENTIAL_ENCRYPTION_KEY on the server.",
      503,
    );
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function seal(value: string, owner: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(owner) },
    await cryptoKey(),
    new TextEncoder().encode(value),
  );
  return (
    btoa(String.fromCharCode(...iv)) +
    "." +
    btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  );
}
async function unseal(value: string, owner: string) {
  const [i, c] = value.split(".");
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: Uint8Array.from(atob(i), (c) => c.charCodeAt(0)),
      additionalData: new TextEncoder().encode(owner),
    },
    await cryptoKey(),
    Uint8Array.from(atob(c), (c) => c.charCodeAt(0)),
  );
  return new TextDecoder().decode(plain);
}
export async function providerSettings(_owner?: string) {
  const row = await database()
    .prepare("SELECT * FROM providers WHERE owner=?")
    .bind(MASTER_OWNER)
    .first();
  const config = providerSchema.parse(row ? JSON.parse(String(row.config)) : {});
  return {
    row,
    config,
    connected: {
      openai: !!row?.openai || !!binding("OPENAI_API_KEY"),
      anthropic: !!row?.anthropic || !!binding("ANTHROPIC_API_KEY"),
      fal: !!row?.fal || !!binding("FAL_KEY"),
    },
    secure: !!binding("CREDENTIAL_ENCRYPTION_KEY"),
  };
}
export async function providerKey(
  owner: string,
  provider: "openai" | "anthropic" | "fal",
) {
  const s = await providerSettings(owner);
  const val = s.row?.[provider];
  if (val) return unseal(String(val), MASTER_OWNER);
  const runtime=binding(provider==="fal"?"FAL_KEY":provider==="openai"?"OPENAI_API_KEY":"ANTHROPIC_API_KEY");
  if(runtime)return runtime;
  throw new ApiError(
    "FiveGen AI is being configured by the administrator. Your saved work is safe.",
    409,
  );
}
export async function textGeneration(
  owner: string,
  system: string,
  prompt: string,
  maxTokens = 8000,
) {
  const { config } = await providerSettings(owner);
  const key = await providerKey(owner, config.textProvider);
  const inputBytes=new TextEncoder().encode(system+prompt).length;
  if(inputBytes>64000)throw new ApiError("This request is too large. Shorten the brief or instructions.");
  const inputRate=config.textProvider==="anthropic"?1:0.4,outputRate=config.textProvider==="anthropic"?5:1.6;
  await reserveAIBudget(Math.ceil(inputBytes*inputRate+maxTokens*outputRate));
  let output = "";
  if (config.textProvider === "openai") {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(150000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.textModel,
        instructions: system,
        input: prompt,
        max_output_tokens: maxTokens,
        store: false,
        text: { format: { type: "json_object" } },
      }),
    });
    const d = (await r.json()) as any;
    if (!r.ok)
      throw new ApiError("AI generation is temporarily unavailable. Please retry later.", 502);
    if (d.status === "incomplete")
      throw new ApiError(
        "The model reached its output limit. Try a more focused brief or another model.",
        502,
      );
    output =
      d.output
        ?.filter((o: any) => o.type === "message")
        .flatMap((o: any) => o.content)
        .filter((c: any) => c.type === "output_text")
        .map((c: any) => c.text)
        .join("") || "";
  } else {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(150000),
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.textModel,
        system,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const d = (await r.json()) as any;
    if (!r.ok)
      throw new ApiError(
        "AI generation is temporarily unavailable. Please retry later.",
        502,
      );
    if (d.stop_reason === "max_tokens")
      throw new ApiError(
        "The model reached its output limit. Try a more focused brief.",
        502,
      );
    output =
      d.content
        ?.filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("") || "";
  }
  try {
    return JSON.parse(
      output
        .trim()
        .replace(/^```(?:json)?\s*/, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    throw new ApiError(
      "The model returned an invalid format. Your saved work is safe; retry this step.",
      502,
    );
  }
}
export const productSystem =
  "You are the senior product strategist, instructional designer, and editor at a premium digital product studio. Build specific, complete, useful products from the creator brief. Do not return generic filler, placeholders, unsupported claims, fake testimonials, or fabricated research. Adapt the deliverables to the requested product type. Include worked examples, actionable instructions, original exercises, and reusable tools when relevant. Respect requested language and tone. Distinguish illustrative examples from factual claims. Return ONLY valid JSON following the requested shape. Never include markdown fences around the JSON.";
