import { NextResponse } from "next/server";
import { buildMovieMeta, buildSeriesMeta } from "@/lib/stremio/stremio-meta-builder";
import { isStremioType, resolveStremioId, stremioDevice, stremioJson, stremioNotFound, stremioOptions } from "@/lib/stremio/stremio-route-helpers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string; type: string; rest: string[] }> };

/** GET /stremio/[token]/meta/{movie|series}/lumen:tmdbm123.json → {meta} (series meta lists every episode as `videos`). */
export async function GET(_req: Request, ctx: Ctx) {
  const { token, type, rest } = await ctx.params;
  const device = stremioDevice(token);
  if (device instanceof NextResponse) return device;
  if (!isStremioType(type)) return stremioNotFound();
  try {
    const id = await resolveStremioId(type, rest);
    if (!id) return stremioNotFound();
    const meta = type === "movie" ? await buildMovieMeta(id.tmdbId) : await buildSeriesMeta(id.tmdbId);
    return meta ? stremioJson({ meta }) : stremioNotFound();
  } catch (err) {
    console.error("[stremio/meta]", rest[0], err instanceof Error ? err.message : err);
    return stremioJson({ error: "server" }, 500);
  }
}

export const OPTIONS = () => stremioOptions();
