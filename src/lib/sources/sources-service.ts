import "server-only";
import { formatMediaKey, parseMediaKey, type MediaKey } from "@/lib/catalog/media-key";
import { listJobsForMedia, toCloudJob } from "@/lib/cloud/cloud-jobs-store";
import { hasSimCached } from "@/lib/cloud/cloud-sim-torbox";
import { getEnv } from "@/lib/config/env";
import type { ScenarioFlag } from "@/lib/dev/scenario-flags-shared";
import { createMemoryCacheStore } from "@/lib/tmdb/memory-cache-store";
import { getSeason } from "@/lib/tmdb/catalog-queries-detail";
import { fetchMovieRaw, fetchTvRaw } from "@/lib/tmdb/tmdb-detail-fetch";
import { checkCachedMemo, knownCached } from "@/lib/torbox/torbox-cache-check";
import { readTorrentCache } from "@/lib/torbox/torbox-ensure-torrent";
import { hasCachedLink } from "@/lib/torbox/torbox-link-cache";
import { pickVideoFile } from "@/lib/torbox/torbox-pick-video-file";
import type { TorboxCachedEntry } from "@/lib/torbox/torbox-types";
import type { HashSource, RawRelease } from "./hash-source-interface";
import { shortContainer } from "./release-labels";
import { buildReleaseList } from "./sources-build-release";
import type { CloudJob, Release, SourcesResponse } from "./sources-types";
import { createTorrentioHashSource } from "./torrentio-hash-source";
import { upsertTitleSources } from "./title-sources-store";
import { createYtsHashSource } from "./yts-hash-source";

/**
 * search (Torrentio, YTS fallback for movies; 1 h memo per imdb key) → dedupe → checkcached (10 min memo, list_files)
 * → classify → score → sort → cap 30 → attach cloud jobs → write title_sources (only for real, un-simulated answers).
 */
export const TORRENTIO_TTL_MS = 60 * 60_000;
const g = globalThis as unknown as { __hcSearchMemo?: ReturnType<typeof createMemoryCacheStore> };
/** on globalThis: a dev recompile must not re-ask Torrentio for every open title */
const searchMemo = g.__hcSearchMemo ??= createMemoryCacheStore(300, TORRENTIO_TTL_MS);
let sources: HashSource[] | null = null;
const hashSources = (): HashSource[] => (sources ??= [createTorrentioHashSource(getEnv().TORRENTIO_BASE), createYtsHashSource()]);
/** tests / sweeper may swap the providers */
export const setHashSources = (list: HashSource[] | null) => void (sources = list);

export class SourcesUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourcesUnavailableError";
  }
}

export type SourcesPrefs = { quality: "1080p" | "2160p"; preferSmall: boolean; show4k: boolean };
export type SourcesResult = SourcesResponse & { title: string; imdbId: string | null; seasonEpisodeCount?: number };

export type TitleInfo = { title: string; imdbId: string | null; seasonEpisodeCount?: number };

/** Title + IMDb id from the cached TMDB detail; episode count of the requested season for pack labels. */
export async function titleInfo(key: MediaKey): Promise<TitleInfo> {
  if (key.type === "movie") {
    const d = await fetchMovieRaw(key.tmdbId);
    return { title: d.title || d.original_title || "", imdbId: d.imdb_id ?? d.external_ids?.imdb_id ?? null };
  }
  const d = await fetchTvRaw(key.tmdbId);
  const info: TitleInfo = { title: d.name || d.original_name || "", imdbId: d.external_ids?.imdb_id ?? null };
  if (key.season !== undefined) {
    const s = await getSeason(key.tmdbId, key.season).catch(() => null);
    info.seasonEpisodeCount = s?.episodes.length ?? d.seasons?.find((x) => x.season_number === key.season)?.episode_count ?? 0;
  }
  return info;
}

/**
 * Torrentio first; for movies YTS when Torrentio fails or finds nothing. An outage is never memoised as "no sources":
 * when any provider threw and none returned releases → SourcesUnavailableError (banner + "Thử lại", nothing persisted).
 */
export async function searchHashes(imdbId: string, season?: number, episode?: number): Promise<RawRelease[]> {
  const memoKey = `${imdbId}:${season ?? ""}:${episode ?? ""}`;
  const hit = searchMemo.read<RawRelease[]>(memoKey);
  if (hit) return hit.data;
  const errors: string[] = [];
  let found: RawRelease[] = [];
  for (const src of hashSources()) {
    try {
      found = await src.search(imdbId, season, episode);
    } catch (err) {
      errors.push(`${src.name}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    if (found.length) break;
  }
  if (!found.length && errors.length) throw new SourcesUnavailableError(errors.join("; "));
  searchMemo.write(memoKey, found);
  return found;
}

function summarize(best: Release | null, releases: Release[]) {
  return {
    bestClass: best?.cacheState === "cached" ? best.playClass : null,
    bestLabel: best ? `${best.qualityLabel} ${shortContainer(best.parsed)} · ${best.sizeLabel} · ${best.parsed.group}` : null,
    cachedCount: releases.filter((r) => r.cacheState === "cached").length,
    releaseCount: releases.length,
  };
}

/**
 * Writes the episode row, the title-level row and — for a cached season pack — only the episodes whose file is actually
 * inside the pack (partial packs "S04 E01-E05" never mark the rest of the season cached).
 */
function persist(key: MediaKey, ranked: Release[], best: Release | null, cached: Map<string, TorboxCachedEntry>, seasonEpisodeCount: number | undefined): void {
  const summary = summarize(best, ranked);
  upsertTitleSources(key, summary);
  if (key.season === undefined) return;
  upsertTitleSources({ type: key.type, tmdbId: key.tmdbId }, summary);
  const packs = ranked.filter((r) => r.pack && r.cacheState === "cached");
  if (!packs.length || !seasonEpisodeCount) return;
  for (let e = 1; e <= seasonEpisodeCount; e++) {
    if (e === key.episode) continue;
    const pack = packs.find((p) => {
      const files = cached.get(p.hash)?.files;
      return files?.length ? pickVideoFile(files.map((f, i) => ({ id: f.id ?? i, name: f.name, size: f.size })), key.season, e) !== null : false;
    });
    if (pack) upsertTitleSources({ ...key, episode: e }, { ...summarize(pack, [pack]), cachedCount: 1, releaseCount: 1 });
  }
}

/** Routes that look a hash up (cloud job, resolve by hash) ask for every release instead of the picker's 30. */
export const ALL_ROWS = 500;

export type GetSourcesOptions = { max?: number; /** sweeper: no checkcached call — answers come from the memo it just filled */ cacheOnly?: boolean };

export async function getSources(key: MediaKey, prefs: SourcesPrefs, scenario: Set<ScenarioFlag> = new Set(), opts: GetSourcesOptions = {}): Promise<SourcesResult> {
  const info = await titleInfo(key);
  const slots = { active: 0, limit: getEnv().MAX_CLOUD_JOBS };
  const empty = (): SourcesResult => ({ releases: [], best: null, state: "empty", slots, ...info });
  if (!info.imdbId) return empty();
  const raws = await searchHashes(info.imdbId, key.season, key.episode);
  if (!raws.length) return empty();
  const hashes = [...new Set(raws.map((r) => r.hash))];
  // dev scenarios: `all-uncached` skips TorBox entirely; `torbox-down` answers like an outage (last known entries, dimmed)
  const check = scenario.has("all-uncached")
    ? { cached: new Map<string, TorboxCachedEntry>(), down: false }
    : scenario.has("torbox-down")
      ? { cached: knownCached(hashes), down: true }
      : opts.cacheOnly
        ? { cached: knownCached(hashes), down: false }
        : await checkCachedMemo(hashes);
  const jobs = new Map<string, CloudJob>();
  for (const row of listJobsForMedia(key)) if (!jobs.has(row.hash)) jobs.set(row.hash, toCloudJob(row));
  slots.active = [...jobs.values()].filter((j) => j.state === "queued" || j.state === "downloading").length;
  const { releases, best, ranked } = buildReleaseList({ raws, cached: check.cached, jobs, prefs, season: key.season, episode: key.episode, seasonEpisodeCount: info.seasonEpisodeCount, max: opts.max });
  const simulated = scenario.size > 0 || hasSimCached(hashes);
  if (!check.down && !simulated) {
    try {
      persist(key, ranked, best, check.cached, info.seasonEpisodeCount);
    } catch (err) {
      console.warn("[sources] title_sources write failed", err instanceof Error ? err.message : err);
    }
  }
  if (check.down) markLinkReady(releases);
  const state = check.down ? "torbox-down" : releases.length ? "ok" : "empty";
  const episode = key.season !== undefined && key.episode !== undefined ? { season: key.season, episode: key.episode } : undefined;
  return { releases, best, state, slots, episode, ...info };
}

/** Outage: rows whose torrent still has a `requestdl` link in the 50-min cache stay playable (no TorBox call needed). */
function markLinkReady(releases: Release[]): void {
  for (const r of releases) {
    if (r.cacheState !== "cached") continue;
    const known = readTorrentCache(r.hash);
    if (known && hasCachedLink(known.torrentId)) r.linkReady = true;
  }
}

/** Poller / sweeper entry: refresh one title (or episode) with default prefs. */
export async function refreshTitleSources(mediaKeyOrKey: string | MediaKey, opts: GetSourcesOptions = {}): Promise<void> {
  const key = typeof mediaKeyOrKey === "string" ? parseMediaKey(mediaKeyOrKey) : mediaKeyOrKey;
  if (!key) return;
  await getSources(key, { quality: getEnv().DEFAULT_QUALITY, preferSmall: false, show4k: true }, new Set(), opts);
}

export const mediaKeyOf = (key: MediaKey) => formatMediaKey(key.type, key.tmdbId, key.season, key.episode);
