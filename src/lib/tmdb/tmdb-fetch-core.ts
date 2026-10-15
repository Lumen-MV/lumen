import { createLimiter } from "./limit-concurrency";
import { cacheFreshness } from "./tmdb-cache-policy";

/**
 * Pure TMDB fetch core (no Next, no SQLite, no env): cache store + stale-while-revalidate, 8 s timeout,
 * 429 Retry-After (one retry), in-flight de-duplication, global in-flight cap, bounded expired-row fallback.
 * `tmdb-client.ts` wires it to the env token, dev scenarios and the SQLite / memory stores; tests inject fakes.
 */
export type TmdbParams = Record<string, string | number | boolean | undefined>;
export type CachedEntry<T> = { data: T; fetchedAt: Date };
export type TmdbCacheStore = { read<T>(key: string): CachedEntry<T> | null; write(key: string, data: unknown): void; size?: () => number };

export class TmdbError extends Error {
  constructor(message: string, public readonly status: number, public readonly path: string) {
    super(message);
    this.name = "TmdbError";
  }
}
export const isTmdbNotFound = (err: unknown): boolean => err instanceof TmdbError && err.status === 404;

export type TmdbCoreDeps = {
  token: () => string | undefined;
  timeoutMs: number;
  maxInFlight: number;
  retryAfterCapMs: number;
  expiredFallbackMaxMs: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  baseUrl?: string;
  warn?: (...args: unknown[]) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createTmdbCore(deps: TmdbCoreDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const warn = deps.warn ?? console.warn;
  const baseUrl = deps.baseUrl ?? "https://api.themoviedb.org/3";
  const limit = createLimiter(deps.maxInFlight);
  const inflight = new Map<string, Promise<unknown>>();

  async function fetchOnce<T>(path: string, params: TmdbParams, retried = false): Promise<T> {
    const token = deps.token();
    if (!token) throw new TmdbError("TMDB_READ_TOKEN missing", 0, path);
    const url = new URL(baseUrl + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(deps.timeoutMs) });
    } catch (err) {
      // timeout (TimeoutError) or network failure → one TmdbError so routes answer 502 instead of 500 (message never carries the token)
      throw new TmdbError(`TMDB unreachable ${path}: ${err instanceof Error ? err.name : "error"}`, 0, path);
    }
    if (res.status === 429 && !retried) {
      const retryAfterS = Number(res.headers.get("retry-after") ?? "1");
      await sleep(Math.min(deps.retryAfterCapMs, Math.max(500, (Number.isFinite(retryAfterS) ? retryAfterS : 1) * 1000)));
      return fetchOnce<T>(path, params, true);
    }
    if (!res.ok) throw new TmdbError(`TMDB ${res.status} ${path}`, res.status, path);
    return (await res.json()) as T;
  }

  /** Fetch + write cache, de-duplicated per key so parallel callers (hero + Top 10) share one request; network calls are capped. */
  function fetchAndStore<T>(store: TmdbCacheStore, key: string, path: string, params: TmdbParams): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p = limit(() => fetchOnce<T>(path, params))
      .then((data) => {
        store.write(key, data);
        return data;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  async function cachedFetch<T>(store: TmdbCacheStore, key: string, path: string, params: TmdbParams, ttlMs: number): Promise<T> {
    const cached = store.read<T>(key);
    const state = cacheFreshness(cached?.fetchedAt, ttlMs, now());
    if (cached && state === "fresh") return cached.data;
    if (cached && state === "stale") {
      // serve stale now, refresh in the background (errors only logged; the stale copy stays valid up to 2×TTL)
      fetchAndStore<T>(store, key, path, params).catch((err) => warn("[tmdb] revalidate failed", key, err instanceof Error ? err.message : err));
      return cached.data;
    }
    try {
      return await fetchAndStore<T>(store, key, path, params);
    } catch (err) {
      if (isTmdbNotFound(err)) throw err;
      // an expired copy beats an error page when TMDB is unreachable — but never one older than the fallback bound
      if (cached && now() - cached.fetchedAt.getTime() <= deps.expiredFallbackMaxMs) {
        warn("[tmdb] serving expired cache after fetch failure", key);
        return cached.data;
      }
      throw err;
    }
  }

  return { cachedFetch };
}
