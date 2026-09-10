import { z } from "zod";
import {
  database,
  failure,
  identity,
  sameOrigin,
  ApiError,
} from "@/lib/server";
import { providerSchema, providerSettings, seal } from "@/lib/ai";
export async function GET() {
  try {
    const u = await identity();
    const s = await providerSettings(u.userId);
    return Response.json({
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
    const u = await identity();
    const data = z
      .object({
        config: providerSchema,
        openai: z.string().max(600).optional(),
        anthropic: z.string().max(600).optional(),
        fal: z.string().max(600).optional(),
        remove: z.enum(["openai", "anthropic", "fal"]).optional(),
      })
      .parse(await req.json());
    const current = await providerSettings(u.userId);
    const keys: { [k: string]: unknown } = {
      openai: current.row?.openai ?? null,
      anthropic: current.row?.anthropic ?? null,
      fal: current.row?.fal ?? null,
    };
    for (const p of ["openai", "anthropic", "fal"] as const) {
      if (data.remove === p) keys[p] = null;
      else if (data[p]?.trim()) {
        const key = data[p]!.trim();
        if (key.length < 20)
          throw new ApiError("That API key looks incomplete.");
        keys[p] = await seal(key, u.userId);
      }
    }
    await database()
      .prepare(
        "INSERT INTO providers (owner,openai,anthropic,fal,config) VALUES (?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET openai=excluded.openai,anthropic=excluded.anthropic,fal=excluded.fal,config=excluded.config",
      )
      .bind(
        u.userId,
        keys.openai,
        keys.anthropic,
        keys.fal,
        JSON.stringify(data.config),
      )
      .run();
    return Response.json({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
