import { copy } from "@/lib/copy-vi";
import type { Release } from "@/lib/sources/sources-types";

/**
 * Pure: ranked releases → Stremio stream objects. Cached rows (top `max`, already scored by Phase 3) point at our
 * `/stremio/{token}/play?…` redirect (302 → TorBox CDN, or the same-origin proxy file in STREAM_MODE=proxy); MKV / DTS
 * rows carry `notWebReady` so Stremio Web knows. Uncached rows fall back to `infoHash` so Stremio's own engine can
 * fetch them (TorBox never starts a download from the TV). `bingeGroup` keeps the next episode on the same quality.
 * The TV plays MKV / HEVC natively, so the viewer's `quality` pref leads the cached list (2160p rows first for a 4K
 * viewer, 1080p first otherwise) before the web score decides the rest.
 */
export type StremioStream = { name: string; title: string; url?: string; infoHash?: string; fileIdx?: number; behaviorHints?: { notWebReady?: boolean; bingeGroup?: string } };
export const MAX_CACHED_STREAMS = 5;
export const MAX_UNCACHED_STREAMS = 3;

export function playUrl(base: string, token: string, mediaKey: string, hash: string): string {
  return `${base}/stremio/${token}/play?key=${encodeURIComponent(mediaKey)}&hash=${hash}`;
}

const line = (r: Release) => [r.qualityLabel, r.formatLabel, r.sizeLabel, r.parsed.group].filter(Boolean).join(" · ");

export type StreamQuality = "1080p" | "2160p";

/** Stable: rows matching the preferred resolution first, otherwise the incoming (score) order. */
export function orderByQualityPref<T extends { parsed: { resolution: string } }>(rows: T[], quality: StreamQuality): T[] {
  return [...rows.filter((r) => r.parsed.resolution === quality), ...rows.filter((r) => r.parsed.resolution !== quality)];
}

/** `preferredHash` = the viewer's applied "Lần trước" release (release-pref-select.ts): listed first with the ⭐ line. */
export function buildStreams(input: { releases: Release[]; base: string; token: string; mediaKey: string; quality?: StreamQuality; max?: number; preferredHash?: string | null }): StremioStream[] {
  const s = copy.stremio;
  const byPref = orderByQualityPref(input.releases.filter((r) => r.cacheState === "cached"), input.quality ?? "1080p");
  const pref = input.preferredHash ? byPref.find((r) => r.hash === input.preferredHash) : undefined;
  const cached = (pref ? [pref, ...byPref.filter((r) => r !== pref)] : byPref).slice(0, input.max ?? MAX_CACHED_STREAMS);
  const uncached = input.releases.filter((r) => r.cacheState !== "cached" && !r.parsed.bad).slice(0, MAX_UNCACHED_STREAMS);
  return [
    ...cached.map((r) => ({ name: s.streamName(r.qualityLabel), title: `${line(r)}\n${r === pref ? `${s.lastPick} · ` : ""}${s.cached}`, url: playUrl(input.base, input.token, input.mediaKey, r.hash), behaviorHints: { notWebReady: r.playClass !== "direct", bingeGroup: `lumen-${r.qualityLabel}` } })),
    ...uncached.map((r) => ({ name: s.streamName(r.qualityLabel), title: `${line(r)}\n${s.uncached}`, infoHash: r.hash, ...(r.fileIdx !== undefined ? { fileIdx: r.fileIdx } : {}), behaviorHints: { bingeGroup: `lumen-${r.qualityLabel}` } })),
  ];
}

/** Dev / QA: the local ffmpeg sample as the only stream (scenario `play-sample`). */
export function sampleStream(base: string, token: string, mediaKey: string): StremioStream {
  return { name: copy.stremio.streamName("1080p"), title: `Lumen.Sample · ${copy.stremio.cached}`, url: `${playUrl(base, token, mediaKey, "sample")}`, behaviorHints: { notWebReady: false } };
}
