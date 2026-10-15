import "server-only";
import type { MediaKey } from "@/lib/catalog/media-key";
import { getEnv } from "@/lib/config/env";
import { tmdbFetch } from "@/lib/tmdb/tmdb-client";
import { fetchTvRaw } from "@/lib/tmdb/tmdb-detail-fetch";
import type { TmdbPage } from "@/lib/tmdb/tmdb-types";
import { checkCachedMemo } from "@/lib/torbox/torbox-cache-check";
import type { RawRelease } from "./hash-source-interface";
import { getSources, searchHashes, SourcesUnavailableError, titleInfo } from "./sources-service";
import { getTitleSources, isStale } from "./title-sources-store";

/**
 * Keeps the home cache markers honest without per-card Torrentio calls: hero/Top 10 (trending movies, 10) and
 * "Phim bộ thịnh hành" (trending tv, 20 → latest aired season E1) are refreshed at boot (+10 s) and every 6 h,
 * skipping rows checked within 6 h. Budget per run: ≤ 30 Torrentio calls (spaced 400 ms) and ONE checkcached pass over
 * ≤ 400 hashes (≤ 4 batches of 100); per-title failures are logged and skipped, 3 consecutive provider outages stop the run.
 */
export const SWEEP_INTERVAL_MS = 6 * 3_600_000;
export const SWEEP_MAX_HASHES = 400;
const BOOT_DELAY_MS = 10_000;
const SPACING_MS = 400;
const MOVIE_COUNT = 10;
const TV_COUNT = 20;
const MAX_CONSECUTIVE_OUTAGES = 3;
const g = globalThis as unknown as { __hcSweeper?: ReturnType<typeof setInterval>; __hcSweeping?: boolean };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function latestAiredSeason(tmdbId: number): Promise<number | null> {
  const d = await fetchTvRaw(tmdbId);
  const today = new Date().toISOString().slice(0, 10);
  const aired = (d.seasons ?? []).filter((s) => s.season_number > 0 && s.air_date && s.air_date <= today);
  return aired.length ? aired[aired.length - 1].season_number : null;
}

export async function sweepTargets(): Promise<MediaKey[]> {
  const [movies, tv] = await Promise.all([tmdbFetch<TmdbPage>("/trending/movie/day", {}, { ttl: "list" }), tmdbFetch<TmdbPage>("/trending/tv/day", {}, { ttl: "list" })]);
  const keys: MediaKey[] = movies.results.slice(0, MOVIE_COUNT).map((r) => ({ type: "movie", tmdbId: r.id }));
  for (const r of tv.results.slice(0, TV_COUNT)) {
    const season = await latestAiredSeason(r.id).catch(() => null);
    if (season) keys.push({ type: "tv", tmdbId: r.id, season, episode: 1 });
  }
  return keys;
}

/** Union of the titles' hashes, taking the same number per title so the total stays ≤ `cap` (fair share, Torrentio order). */
export function unionHashesCapped(perTitle: RawRelease[][], cap = SWEEP_MAX_HASHES): string[] {
  const lists = perTitle.map((raws) => [...new Set(raws.map((r) => r.hash))]).filter((l) => l.length);
  const out = new Set<string>();
  for (let i = 0; out.size < cap; i++) {
    let added = false;
    for (const l of lists) {
      if (i < l.length && out.size < cap) {
        out.add(l[i]);
        added = true;
      }
    }
    if (!added) break;
  }
  return [...out];
}

export type SweepStats = { checked: number; skipped: number; failed: number; batches: number };

export async function sweepOnce(): Promise<SweepStats> {
  const env = getEnv();
  const stats: SweepStats = { checked: 0, skipped: 0, failed: 0, batches: 0 };
  if (!env.TORBOX_API_KEY) return stats;
  const prefs = { quality: env.DEFAULT_QUALITY, preferSmall: false, show4k: true };
  // phase 1: Torrentio per stale title (the 1 h memo keeps phase 3 free of further provider calls)
  const found: Array<{ key: MediaKey; raws: RawRelease[] }> = [];
  let outages = 0;
  for (const key of await sweepTargets()) {
    if (!isStale(getTitleSources(key), SWEEP_INTERVAL_MS)) {
      stats.skipped++;
      continue;
    }
    try {
      const info = await titleInfo(key);
      const raws = info.imdbId ? await searchHashes(info.imdbId, key.season, key.episode) : [];
      found.push({ key, raws });
      outages = 0;
    } catch (err) {
      stats.failed++;
      console.warn("[sweep] search failed", key, err instanceof Error ? err.message : err);
      if (err instanceof SourcesUnavailableError && ++outages >= MAX_CONSECUTIVE_OUTAGES) {
        console.warn(`[sweep] stopped: ${outages} consecutive provider outages`);
        break;
      }
    }
    await sleep(SPACING_MS);
  }
  // phase 2: ONE checkcached pass over the capped hash union (≤ 4 batches)
  const hashes = unionHashesCapped(found.map((f) => f.raws));
  stats.batches = Math.ceil(hashes.length / 100);
  const check = hashes.length ? await checkCachedMemo(hashes) : { down: false };
  if (check.down) {
    console.warn("[sweep] TorBox unreachable — nothing persisted this run");
    return stats;
  }
  // phase 3: build + persist per title from the memo only (no further TorBox calls)
  for (const { key } of found) {
    try {
      await getSources(key, prefs, new Set(), { cacheOnly: true });
      stats.checked++;
    } catch (err) {
      stats.failed++;
      console.warn("[sweep] build failed", key, err instanceof Error ? err.message : err);
    }
  }
  return stats;
}

export function startTitleSourcesSweeper(): void {
  if (g.__hcSweeper) return;
  const run = () => {
    if (g.__hcSweeping) return;
    g.__hcSweeping = true;
    sweepOnce()
      .then((s) => console.log(`[sweep] title_sources: checked ${s.checked}, skipped ${s.skipped}, failed ${s.failed}, checkcached batches ${s.batches}`))
      .catch((err) => console.warn("[sweep] aborted", err instanceof Error ? err.message : err))
      .finally(() => (g.__hcSweeping = false));
  };
  setTimeout(run, BOOT_DELAY_MS).unref();
  g.__hcSweeper = setInterval(run, SWEEP_INTERVAL_MS);
  g.__hcSweeper.unref();
}
