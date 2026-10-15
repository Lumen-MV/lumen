import { NextResponse } from "next/server";
import { EmbeddedTooLargeError } from "@/lib/subtitles/embedded-subtitle-extractor";
import { readScenario } from "@/lib/dev/scenario-flags";
import { CORS, stremioDevice, stremioJson } from "@/lib/stremio/stremio-route-helpers";
import { findSubRow, readVtt } from "@/lib/subtitles/subtitle-store";
import { ensureVtt, OsQuotaError, SubtitleUnavailableError } from "@/lib/subtitles/subtitle-vtt-ensure";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string; id: string }> };

/** GET /stremio/[token]/subs/[id].vtt → `text/vtt` (device-token auth; first hit downloads like /api/subs/[id].vtt; embedded tracks are not served here). */
export async function GET(req: Request, ctx: Ctx) {
  const { token, id } = await ctx.params;
  const device = stremioDevice(token);
  if (device instanceof NextResponse) return device;
  const m = id.match(/^(\d{1,9})\.vtt$/);
  if (!m) return stremioJson({ error: "bad id" }, 400);
  const row = findSubRow(Number(m[1]));
  if (!row || row.source === "embedded") return stremioJson({ error: "not found" }, 404);
  try {
    const ready = await ensureVtt(row, readScenario(req), null);
    return new NextResponse(readVtt(ready), { status: 200, headers: { ...CORS, "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=31536000" } });
  } catch (err) {
    if (err instanceof OsQuotaError) return stremioJson({ error: "OS_QUOTA" }, 429);
    if (err instanceof EmbeddedTooLargeError || err instanceof SubtitleUnavailableError) return stremioJson({ error: "unavailable" }, 404);
    console.error("[stremio/subs]", row.id, err instanceof Error ? err.message : err);
    return stremioJson({ error: "provider" }, 502);
  }
}

export const OPTIONS = () => new NextResponse(null, { status: 204, headers: CORS });
