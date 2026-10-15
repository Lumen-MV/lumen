import { NextResponse } from "next/server";
import { readScenario } from "@/lib/dev/scenario-flags";
import { sourcesPrefs } from "@/lib/http/sources-route-helpers";
import { selectPreferredRelease } from "@/lib/sources/release-pref-select";
import { getReleasePref, titleKeyOf } from "@/lib/sources/release-prefs-store";
import { getSources, SourcesUnavailableError } from "@/lib/sources/sources-service";
import { mediaKeyOfParsed, mediaKeyStringOfParsed } from "@/lib/stremio/stremio-ids";
import { isStremioType, publicBaseUrl, resolveStremioId, stremioDevice, stremioJson, stremioNotFound, stremioOptions } from "@/lib/stremio/stremio-route-helpers";
import { buildStreams, sampleStream } from "@/lib/stremio/stremio-stream-builder";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string; type: string; rest: string[] }> };

/**
 * GET /stremio/[token]/stream/{movie|series}/{lumen:tmdbm123 | lumen:tmdbt123:1:2 | tt123[:1:2]}.json → {streams}:
 * Phase 3 sources for the viewer's own prefs (quality / prefer small / 4K), top 5 cached as `url` (our 302, the preferred
 * resolution first) + 3 uncached as `infoHash`. Dev scenario `play-sample` answers the local sample only (QA: no TorBox / Torrentio traffic).
 */
export async function GET(req: Request, ctx: Ctx) {
  const { token, type, rest } = await ctx.params;
  const device = stremioDevice(token);
  if (device instanceof NextResponse) return device;
  if (!isStremioType(type)) return stremioNotFound();
  const base = publicBaseUrl();
  try {
    const id = await resolveStremioId(type, rest);
    if (!id) return stremioJson({ streams: [] });
    const mediaKey = mediaKeyStringOfParsed(id);
    const scenario = readScenario(req);
    if (scenario.has("play-sample")) return stremioJson({ streams: [sampleStream(base, token, mediaKey)] });
    const prefs = sourcesPrefs(device.user.id);
    const key = mediaKeyOfParsed(id);
    const { releases } = await getSources(key, prefs, scenario);
    // the viewer's "Lần trước" release (same data the web primary uses) leads the list while it is cached
    const preferredHash = selectPreferredRelease(releases, getReleasePref(device.user.id, titleKeyOf(key)), key.type === "tv").release?.hash ?? null;
    return stremioJson({ streams: buildStreams({ releases, base, token, mediaKey, quality: prefs.quality, preferredHash }) });
  } catch (err) {
    if (!(err instanceof SourcesUnavailableError)) console.error("[stremio/stream]", rest[0], err instanceof Error ? err.message : err);
    return stremioJson({ streams: [] });
  }
}

export const OPTIONS = () => stremioOptions();
