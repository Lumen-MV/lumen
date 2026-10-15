import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity/log-activity";
import { requireUserApi } from "@/lib/auth/require-admin";
import { deviceLabelFromUserAgent } from "@/lib/auth/session-service";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { getEnv } from "@/lib/config/env";
import { copy } from "@/lib/copy-vi";
import { readScenario, readScenarioParams } from "@/lib/dev/scenario-flags";
import { streamMode } from "@/lib/play/build-player-manifest";
import { detectDevice, externalPlayerUrl, type HandoffTarget } from "@/lib/play/external-player-links";
import { externalRateLimited } from "@/lib/play/external-rate-limit";
import { getStream } from "@/lib/play/stream-registry";
import { beatView } from "@/lib/play/viewer-limit";
import { titleInfo } from "@/lib/sources/sources-service";
import { pickHandoffSubtitle, type HandoffSubtitle } from "@/lib/subtitles/handoff-subtitle-pick";

export const dynamic = "force-dynamic";

/**
 * GET /api/play/external?streamId=&target=stremio|infuse|vlc|iina|copy → {url, expiresAt, subtitle}: the deep link / raw
 * stream URL for the hand-off sheet (direct: CDN URL; proxy: same-origin stream URL — the device-token signed variant is
 * Phase 6) + the viewer's subtitle for this title as {label, url} with a signed, session-less `.srt` URL (null when
 * none): Infuse / VLC iOS get it inside the link (`&sub=`), "Sao chép link phụ đề" copies it on its own. Logs a `views`
 * row (`mode:'app'`, never counted against the 5-viewer limit) + activity. 10 calls/min/user.
 */
const TARGETS = new Set<HandoffTarget>(["stremio", "infuse", "vlc", "iina", "copy"]);

export async function GET(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const url = new URL(req.url);
  const target = url.searchParams.get("target") as HandoffTarget | null;
  const streamId = url.searchParams.get("streamId") ?? "";
  if (!target || !TARGETS.has(target)) return NextResponse.json({ code: "BAD_REQUEST", issues: ["target"] }, { status: 400 });
  const entry = getStream(streamId, me.user.id);
  if (!entry) return NextResponse.json({ code: "STREAM_EXPIRED" }, { status: 410 });
  if (externalRateLimited(me.user.id)) return NextResponse.json({ code: "RATE_LIMITED" }, { status: 429 });
  const key = parseMediaKey(entry.mediaKey)!;
  const env = getEnv();
  const params = readScenarioParams(req);
  const streamUrl = streamMode(params) === "proxy" ? `${env.APP_URL}/api/play/stream/${entry.streamId}` : entry.cdnUrl;
  const info = await titleInfo(key).catch(() => ({ title: entry.release.title, imdbId: null as string | null }));
  const stremio = info.imdbId ? { imdbId: info.imdbId, season: key.season, episode: key.episode } : null;
  let subtitle: HandoffSubtitle | null = null;
  try {
    subtitle = pickHandoffSubtitle(me.user.id, entry.mediaKey, readScenario(req), params, entry);
  } catch (err) {
    // a subtitle problem must never block the hand-off itself: the link goes out without one
    console.warn("[play/external] subtitle pick", err instanceof Error ? err.message : err);
  }
  const link = externalPlayerUrl(target as Exclude<HandoffTarget, "qr">, streamUrl, detectDevice(req.headers.get("user-agent") ?? ""), stremio, subtitle?.url ?? null);
  if (!link) return NextResponse.json({ code: "NO_IMDB_ID" }, { status: 404 });
  const ua = req.headers.get("user-agent") ?? "";
  beatView(me.user.id, key, target === "stremio" ? "stremio" : "app", entry.release.hash, deviceLabelFromUserAgent(ua));
  logActivity("view", copy.activityView(me.user.displayName, info.title, target), me.user.id);
  return NextResponse.json({ url: link, expiresAt: entry.expiresAt, subtitle }, { headers: { "cache-control": "no-store" } });
}
