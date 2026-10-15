import type { TorboxCachedEntry } from "@/lib/torbox/torbox-types";
import { pickVideoFile } from "@/lib/torbox/torbox-pick-video-file";
import type { RawRelease } from "./hash-source-interface";
import { classifyPlayability } from "./playability-classifier";
import { isSeasonPack, parseRelease } from "./release-parser";
import { audioLabel, formatLabel, formatSize, qualityLabel } from "./release-labels";
import { scoreRelease, sortReleases, type ScorePrefs } from "./release-scorer";
import type { CloudJob, Release } from "./sources-types";

/** Pure assembly of the ranked release list (no I/O) — shared by the service and the unit tests. */
export type BuildInput = {
  raws: RawRelease[];
  cached: Map<string, TorboxCachedEntry>;
  jobs: Map<string, CloudJob>;
  prefs: ScorePrefs & { show4k: boolean };
  season?: number;
  episode?: number;
  /** episodes in the season (TMDB) for the "Trọn mùa 4 · 9 tập" label */
  seasonEpisodeCount?: number;
  max?: number;
};

export const MAX_ROWS = 30;
/** The cap keeps ≥ 8 rows of the preferred resolution and (4K on) ≥ 8 rows of 2160p when they exist — neither block can vanish. */
export const PREF_RES_RESERVE = 8;
const MAX_SIZE_BYTES = 120 * 1024 ** 3;

export function buildRelease(raw: RawRelease, input: BuildInput): Release {
  const entry = input.cached.get(raw.hash);
  const job = input.jobs.get(raw.hash);
  // Torrentio adds a file line for single-episode torrents too → only the release name decides (S04 without E01)
  const isPack = input.season !== undefined && isSeasonPack(raw.title);
  const cachedFile = entry?.files?.length ? pickVideoFile(entry.files.map((f, i) => ({ id: f.id ?? i, name: f.name, size: f.size })), input.season, input.episode) : null;
  const fileName = cachedFile ? cachedFile.name.split("/").pop() : raw.fileName;
  const parsed = parseRelease(raw.title, fileName);
  const cacheState = entry || job?.state === "ready" ? "cached" : "uncached";
  const { playClass, playReason } = classifyPlayability(parsed);
  // pack size = the whole torrent (checkcached `size`), else the sum of its known files, else the per-file size "(1 tập)"
  const packBytes = isPack ? (entry?.size ?? (entry?.files?.length ? entry.files.reduce((n, f) => n + (f.size || 0), 0) : 0)) : 0;
  const sizeBytes = packBytes || raw.sizeBytes;
  const release: Release = {
    hash: raw.hash,
    title: raw.title,
    fileIdx: raw.fileIdx,
    parsed,
    qualityLabel: qualityLabel(parsed),
    formatLabel: formatLabel(parsed, raw.title),
    sizeBytes,
    sizeLabel: formatSize(sizeBytes),
    audioLabel: audioLabel(parsed),
    seeders: raw.seeders,
    cacheState,
    playClass,
    playReason,
    score: 0,
    recommended: false,
    fileName,
  };
  if (isPack) release.pack = { season: input.season!, episodes: input.seasonEpisodeCount ?? 0, sizeIsFile: !packBytes };
  if (job && job.state !== "ready") release.job = job;
  if (!parsed.group && raw.tracker) release.parsed = { ...parsed, group: raw.tracker };
  // size-based score terms (prefer_small window, > 40 GB) judge the episode file, not the whole pack
  release.score = scoreRelease(isPack && raw.sizeBytes ? { ...release, sizeBytes: raw.sizeBytes } : release, input.prefs);
  return release;
}

/**
 * Top `limit` by rank, but for every resolution in `reserveRes` at least min(reserve, available) rows stay (the lowest-ranked
 * unprotected rows yield). Order stays by rank, so `ranked[0]` is always kept.
 */
export function capWithReserve(ranked: Release[], limit: number, reserveRes: string[], reserve = PREF_RES_RESERVE): Release[] {
  if (ranked.length <= limit) return ranked;
  const top = ranked.slice(0, limit);
  const protectedRows = new Set<Release>();
  const extra: Release[] = [];
  for (const res of new Set(reserveRes)) {
    const ofRes = ranked.filter((r) => r.parsed.resolution === res).slice(0, reserve);
    for (const r of ofRes) protectedRows.add(r);
    for (const r of ofRes) if (!top.includes(r)) extra.push(r);
  }
  if (!extra.length) return top;
  const kept: Release[] = [];
  let drop = extra.length;
  for (let i = top.length - 1; i >= 0; i--) {
    if (drop > 0 && !protectedRows.has(top[i])) drop--;
    else kept.unshift(top[i]);
  }
  return sortReleases([...kept, ...extra], "recommended").slice(0, Math.max(limit, kept.length + extra.length - drop));
}

export type BuiltReleases = { releases: Release[]; best: Release | null; /** every row after dedupe/drops (incl. hidden 2160p), ranked, before the cap — stable counts for title_sources whatever the caller's toggle/cap */ ranked: Release[] };

/** Dedupe by hash → build → drop CAM/TS + absurd sizes → rank by score → hide 2160p unless show4k → cap (reserve pref res + 2160p) → flag `.rec`. */
export function buildReleaseList(input: BuildInput): BuiltReleases {
  const seen = new Set<string>();
  const all: Release[] = [];
  for (const raw of input.raws) {
    if (seen.has(raw.hash)) continue;
    seen.add(raw.hash);
    const r = buildRelease(raw, input);
    if (r.parsed.bad || raw.sizeBytes > MAX_SIZE_BYTES) continue;
    all.push(r);
  }
  // "Hiện bản 4K" only SHOWS 2160p rows; the order (and `best`) stays score-based, so a cached 1080p MP4 keeps the hero playable
  const ranked = sortReleases(all, "recommended");
  const visible = input.prefs.show4k ? ranked : ranked.filter((r) => r.parsed.resolution !== "2160p");
  const releases = capWithReserve(visible, input.max ?? MAX_ROWS, input.prefs.show4k ? [input.prefs.quality, "2160p"] : [input.prefs.quality]);
  const best = visible[0] ?? null;
  // the mockup marks ".rec" only on a cached best row
  if (best && best.cacheState === "cached") best.recommended = true;
  return { releases, best, ranked };
}
