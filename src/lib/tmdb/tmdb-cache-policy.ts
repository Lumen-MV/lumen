/**
 * Pure cache policy for TMDB responses (no DB, no env) so it is unit-testable.
 * TTL classes from the plan: lists 3h, details 3d, genres 30d, season 1d; stale-while-revalidate up to 2×TTL.
 * `/search/*` lives in a memory LRU (1h, never SQLite); SQLite rows older than 60 d are purged (ToS ≤ 6 months).
 */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const TMDB_TTL = { list: 3 * HOUR, detail: 3 * DAY, genres: 30 * DAY, season: DAY, search: HOUR } as const;
export type TmdbTtlClass = keyof typeof TMDB_TTL;

/** Network bounds: one TMDB request may take 8 s at most; at most 6 requests in flight (cold home ≈ 50 calls). */
export const TMDB_FETCH_TIMEOUT_MS = 8_000;
export const TMDB_MAX_IN_FLIGHT = 6;
export const TMDB_RETRY_AFTER_CAP_MS = 5_000;
/** After a fetch failure an expired SQLite row is still served, but only up to this age. */
export const TMDB_EXPIRED_FALLBACK_MAX_MS = 7 * DAY;
/** At-rest bound: rows older than this are deleted at boot and once a day. */
export const TMDB_CACHE_PURGE_AGE_MS = 60 * DAY;
export const TMDB_CACHE_PURGE_INTERVAL_MS = DAY;
export const TMDB_SEARCH_CACHE_ENTRIES = 200;

export type CacheFreshness = "fresh" | "stale" | "expired" | "miss";

/** fresh: age ≤ TTL · stale: TTL < age ≤ 2×TTL (serve + revalidate) · expired: older (must refetch) · miss: no row. */
export function cacheFreshness(fetchedAt: Date | number | null | undefined, ttlMs: number, now: number = Date.now()): CacheFreshness {
  if (fetchedAt == null) return "miss";
  const age = now - (typeof fetchedAt === "number" ? fetchedAt : fetchedAt.getTime());
  if (age <= ttlMs) return "fresh";
  if (age <= 2 * ttlMs) return "stale";
  return "expired";
}

/** Deterministic key: path + sorted query params (so param order never splits the cache). */
export function tmdbCacheKey(path: string, params: Record<string, string | number | boolean | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return pairs.length ? `${path}?${pairs.map(([k, v]) => `${k}=${v}`).join("&")}` : path;
}
