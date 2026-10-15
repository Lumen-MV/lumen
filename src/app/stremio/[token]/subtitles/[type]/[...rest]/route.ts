import { NextResponse } from "next/server";
import { mediaKeyStringOfParsed } from "@/lib/stremio/stremio-ids";
import { isStremioType, publicBaseUrl, resolveStremioId, stremioDevice, stremioJson, stremioNotFound, stremioOptions } from "@/lib/stremio/stremio-route-helpers";
import { buildSubtitles } from "@/lib/stremio/stremio-subtitles-builder";
import { hasVtt, listSubRows } from "@/lib/subtitles/subtitle-store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string; type: string; rest: string[] }> };

/**
 * GET /stremio/[token]/subtitles/{movie|series}/{id}[/videoHash=…].json → {subtitles}: the title's `subtitle_cache` rows
 * (Phase 5 — fetched by the web player or the TV's first VTT request); never triggers a provider search itself.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { token, type, rest } = await ctx.params;
  const device = stremioDevice(token);
  if (device instanceof NextResponse) return device;
  if (!isStremioType(type)) return stremioNotFound();
  try {
    const id = await resolveStremioId(type, rest);
    if (!id) return stremioJson({ subtitles: [] });
    const rows = listSubRows(mediaKeyStringOfParsed(id)).map((r) => ({ id: r.id, lang: r.lang, source: r.source, label: r.label, ready: hasVtt(r) }));
    return stremioJson({ subtitles: buildSubtitles(rows, publicBaseUrl(), token) });
  } catch (err) {
    console.error("[stremio/subtitles]", rest[0], err instanceof Error ? err.message : err);
    return stremioJson({ subtitles: [] });
  }
}

export const OPTIONS = () => stremioOptions();
