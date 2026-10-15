import { NextResponse } from "next/server";
import { getEnv } from "@/lib/config/env";
import { readScenario, readScenarioParams } from "@/lib/dev/scenario-flags";
import { sourcesErrorResponse, viewerIp } from "@/lib/http/sources-route-helpers";
import { streamMode } from "@/lib/play/build-player-manifest";
import { parsePlayKey, playRedirectTarget, recordStremioPlay, resolveStremioPlay, StremioPlayError } from "@/lib/stremio/stremio-play-service";
import { CORS, publicBaseUrl, stremioDevice, stremioJson, stremioOptions } from "@/lib/stremio/stremio-route-helpers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };
const HASH_RE = /^([0-9a-f]{40}|sample)$/i;

/**
 * GET /stremio/[token]/play?key=movie:123&hash=… → 302 to the TorBox CDN (STREAM_MODE=direct) or to
 * /stremio/[token]/file/[streamId] (proxy mode: the CDN URL never leaves the VM). 404 UNKNOWN_HASH / NO_VIDEO_FILE,
 * 409 NOT_CACHED (a TV never starts a download), 429 past 10 resolves / minute / token, 503 TORBOX_UNREACHABLE. Logged as a
 * `views` row `mode:'stremio'`.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const device = stremioDevice(token, "play");
  if (device instanceof NextResponse) return device;
  const url = new URL(req.url);
  const key = parsePlayKey(url.searchParams.get("key"));
  const hash = url.searchParams.get("hash") ?? "";
  if (!key || !HASH_RE.test(hash)) return stremioJson({ error: "bad request" }, 400);
  const scenario = readScenario(req);
  const mode = streamMode(readScenarioParams(req));
  try {
    const entry = await resolveStremioPlay({ user: device.user, key, mediaKey: url.searchParams.get("key")!, hash, mode, viewerIp: viewerIp(req, getEnv().TRUST_PROXY === "1"), scenario });
    await recordStremioPlay(device.user, key, entry.release.hash);
    return NextResponse.redirect(playRedirectTarget(entry, mode, publicBaseUrl(), token), { status: 302, headers: { ...CORS, "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof StremioPlayError) return stremioJson({ error: err.code }, err.status);
    const res = sourcesErrorResponse("stremio/play", err);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  }
}

export const OPTIONS = () => stremioOptions();
