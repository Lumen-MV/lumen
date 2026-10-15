import { NextResponse } from "next/server";
import { parseMediaKey, type MediaKey } from "@/lib/catalog/media-key";
import { readScenario, type ScenarioFlag } from "@/lib/dev/scenario-flags";
import { SourcesUnavailableError } from "@/lib/sources/sources-service";
import { isTmdbNotFound, TmdbError } from "@/lib/tmdb/tmdb-client";
import { isTorboxUnreachable, TorboxError } from "@/lib/torbox/torbox-client";
import { NotCachedError } from "@/lib/torbox/torbox-ensure-torrent";
import { getUserSettings } from "@/lib/users/user-settings";

/** Shared by /api/sources, /api/cloud/*, /api/play/resolve: param parsing, prefs, scenario delays, error mapping. */
const SLOW_NET_MS = 1200;

export function mediaKeyParam(req: Request, name = "mediaKey"): MediaKey | NextResponse {
  const key = parseMediaKey(new URL(req.url).searchParams.get(name));
  return key ?? NextResponse.json({ code: "BAD_REQUEST", issues: [name] }, { status: 400 });
}

/** "Hiện bản 4K" only SHOWS 2160p rows (default on for 2160p viewers); ranking keeps the +20 on the `quality` setting. */
export function sourcesPrefs(userId: number, show4kOverride?: string | null) {
  const s = getUserSettings(userId);
  const show4k = show4kOverride === "1" ? true : show4kOverride === "0" ? false : s.show_4k || s.quality === "2160p";
  return { quality: s.quality, preferSmall: s.prefer_small, show4k };
}

/** Dev `slow-net`: +1.2 s so "⟳ Đang tìm nguồn…" / picker skeleton can be captured. */
export async function applyScenarioDelay(req: Request): Promise<Set<ScenarioFlag>> {
  const scenario = readScenario(req);
  if (scenario.has("slow-net")) await new Promise((r) => setTimeout(r, SLOW_NET_MS));
  return scenario;
}

/** Viewer IP for `requestdl?user_ip=` — only trusted behind the proxy (TRUST_PROXY=1), else undefined. */
export function viewerIp(req: Request, trustProxy: boolean): string | undefined {
  if (!trustProxy) return undefined;
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff && /^[0-9a-f.:]+$/i.test(xff) ? xff : undefined;
}

export function sourcesErrorResponse(scope: string, err: unknown): NextResponse {
  if (isTmdbNotFound(err)) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  if (err instanceof NotCachedError) return NextResponse.json({ code: "NOT_CACHED" }, { status: 409 });
  console.error(`[${scope}]`, err instanceof Error ? err.message : err);
  if (err instanceof TmdbError) return NextResponse.json({ code: "TMDB_DOWN" }, { status: 502 });
  if (err instanceof SourcesUnavailableError) return NextResponse.json({ code: "SOURCES_UNREACHABLE" }, { status: 502 });
  // upstream `detail` text stays in the server log (above); clients get the code and map it to copy-vi
  if (err instanceof TorboxError) return NextResponse.json({ code: isTorboxUnreachable(err) ? "TORBOX_UNREACHABLE" : "TORBOX_ERROR" }, { status: isTorboxUnreachable(err) ? 503 : 502 });
  return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
}
