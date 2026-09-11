import { z } from "zod";
import {
  database,
  failure,
  identity,
  sameOrigin,
  ApiError,
} from "@/lib/server";
import { MASTER_OWNER, providerSchema, providerSettings, seal } from "@/lib/ai";
import {isAdmin,requireAdmin} from "@/lib/admin";
import {creditBalance} from "@/lib/credits";
import {creditPolicy,textCredits} from "@/lib/credit-policy";
export async function GET() {
  try {
    const u = await identity();
    const s = await providerSettings(u.userId);
    return Response.json({
      admin:isAdmin(u),credits:await creditBalance(u.userId),costs:{text:textCredits(s.config.textProvider),image:creditPolicy.image,video:creditPolicy.video},
      config: s.config,
      connected: s.connected,
      secure: s.secure,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(req: Request) {
  try {
    sameOrigin(req);
    const u = await requireAdmin();
    const data = z
      .object({
        config: providerSchema,
        openai: z.string().max(600).optional(),
        anthropic: z.string().max(600).optional(),
        fal: z.string().max(600).optional(),
        resend:z.string().max(600).optional(),
        remove: z.enum(["openai", "anthropic", "fal", "resend"]).optional(),
      })
      .parse(await req.json());
    if(data.config.textModel!==(data.config.textProvider==="openai"?"gpt-4.1-mini":"claude-haiku-4-5"))throw new ApiError("Choose the matching model for this provider.");
    const current = await providerSettings(u.userId);
    const keys: { [k: string]: unknown } = {
      openai: current.row?.openai ?? null,
      anthropic: current.row?.anthropic ?? null,
      fal: current.row?.fal ?? null,
      resend:current.row?.resend ?? null,
    };
    for (const p of ["openai", "anthropic", "fal", "resend"] as const) {
      if (data.remove === p) keys[p] = null;
      else if (data[p]?.trim()) {
        const key = data[p]!.trim();
        if (key.length < 20)
          throw new ApiError("That API key looks incomplete.");
        keys[p] = await seal(key, MASTER_OWNER);
      }
    }
    await database()
      .prepare(
        "INSERT INTO providers (owner,openai,anthropic,fal,resend,config) VALUES (?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET openai=excluded.openai,anthropic=excluded.anthropic,fal=excluded.fal,resend=excluded.resend,config=excluded.config",
      )
      .bind(
        MASTER_OWNER,
        keys.openai,
        keys.anthropic,
        keys.fal,
        keys.resend,
        JSON.stringify(data.config),
      )
      .run();
    return Response.json({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
