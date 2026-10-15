import type { CacheState, ParsedRelease, PlayClass, Release } from "./sources-types";

/** Ranking inputs: the user's quality preference and "prefer smaller files" setting. */
export type ScorePrefs = { quality: "1080p" | "2160p"; preferSmall: boolean };

export type Scorable = { parsed: ParsedRelease; cacheState: CacheState; playClass: PlayClass; sizeBytes: number; seeders: number };

const GB = 1024 ** 3;

/**
 * +50 cached, +40 direct, +15 maybe, +20 matches pref res, +10 1080p 1.5–6 GB when prefer_small, +3 x265,
 * −50 CAM/TS, −10 DV without HDR10, −15 > 40 GB, + min(seeders,50)/5. 2160p rows are hidden elsewhere unless show_4k.
 */
export function scoreRelease(r: Scorable, prefs: ScorePrefs): number {
  const sizeGb = r.sizeBytes / GB;
  let s = 0;
  if (r.cacheState === "cached") s += 50;
  if (r.playClass === "direct") s += 40;
  else if (r.playClass === "maybe") s += 15;
  if (r.parsed.resolution === prefs.quality) s += 20;
  if (prefs.preferSmall && r.parsed.resolution === "1080p" && sizeGb >= 1.5 && sizeGb <= 6) s += 10;
  if (r.parsed.codec === "x265") s += 3;
  if (r.parsed.bad) s -= 50;
  if (r.parsed.hdr.includes("DV") && !r.parsed.hdr.some((h) => h.startsWith("HDR"))) s -= 10;
  if (sizeGb > 40) s -= 15;
  s += Math.min(r.seeders, 50) / 5;
  return Math.round(s * 100) / 100;
}

export type SortKey = "recommended" | "size" | "seeders";

/** Stable sort used by the service (recommended) and the picker's sort chips; ties fall back to score. */
export function sortReleases<T extends Pick<Release, "score" | "sizeBytes" | "seeders">>(list: T[], key: SortKey): T[] {
  const by: Record<SortKey, (a: T, b: T) => number> = {
    recommended: (a, b) => b.score - a.score,
    size: (a, b) => b.sizeBytes - a.sizeBytes || b.score - a.score,
    seeders: (a, b) => b.seeders - a.seeders || b.score - a.score,
  };
  return [...list].sort(by[key]);
}
