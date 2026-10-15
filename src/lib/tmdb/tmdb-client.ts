import "server-only";
import { getEnv } from "@/lib/config/env";
import { currentScenario } from "@/lib/dev/scenario-flags-server";
import { createMemoryCacheStore } from "./memory-cache-store";
import { readTmdbCache, writeTmdbCache } from "./tmdb-cache";
import { TMDB_EXPIRED_FALLBACK_MAX_MS, TMDB_FETCH_TIMEOUT_MS, TMDB_MAX_IN_FLIGHT, TMDB_RETRY_AFTER_CAP_MS, TMDB_SEARCH_CACHE_ENTRIES, TMDB_TTL, tmdbCacheKey, type TmdbTtlClass } from "./tmdb-cache-policy";
import { createTmdbCore, TmdbError, type TmdbCacheStore, type TmdbParams } from "./tmdb-fetch-core";

export { TmdbError, isTmdbNotFound, type TmdbParams } from "./tmdb-fetch-core";

/**
 * Server-only TMDB fetch: the pure core (tmdb-fetch-core.ts) wired to the env token, the SQLite cache
 * (lists/details/genres/seasons) or a memory LRU (`/search/*`), and the dev scenario hooks
 * (`tmdb-down` throws, `tmdb-row-down` throws for calls tagged "row", `slow-net` adds 2 s).
 * The Bearer token never leaves this module graph.
 */
const SLOW_NET_MS = 2000;

export type TmdbFetchOptions = { ttl: TmdbTtlClass; scenarioTag?: string; language?: string };

const core = createTmdbCore({
  token: () => getEnv().TMDB_READ_TOKEN,
  timeoutMs: TMDB_FETCH_TIMEOUT_MS,
  maxInFlight: TMDB_MAX_IN_FLIGHT,
  retryAfterCapMs: TMDB_RETRY_AFTER_CAP_MS,
  expiredFallbackMaxMs: TMDB_EXPIRED_FALLBACK_MAX_MS,
});
const sqliteStore: TmdbCacheStore = { read: readTmdbCache, write: writeTmdbCache };
/** Every typed prefix is a distinct search key → memory-only LRU (200 entries, 1 h), never persisted. */
const searchStore = createMemoryCacheStore(TMDB_SEARCH_CACHE_ENTRIES, TMDB_TTL.search);
const isSearchPath = (path: string) => path.startsWith("/search/");

export async function tmdbFetch<T>(path: string, params: TmdbParams = {}, opts: TmdbFetchOptions): Promise<T> {
  const scenario = await currentScenario();
  if (scenario.has("tmdb-down")) throw new TmdbError("scenario tmdb-down", 503, path);
  if (scenario.has("tmdb-row-down") && opts.scenarioTag === "row") throw new TmdbError("scenario tmdb-row-down", 503, path);
  if (scenario.has("slow-net")) await new Promise((r) => setTimeout(r, SLOW_NET_MS));

  const fullParams: TmdbParams = { language: opts.language ?? "vi-VN", ...params };
  const key = tmdbCacheKey(path, fullParams);
  const search = isSearchPath(path);
  return core.cachedFetch<T>(search ? searchStore : sqliteStore, key, path, fullParams, search ? TMDB_TTL.search : TMDB_TTL[opts.ttl]);
}
