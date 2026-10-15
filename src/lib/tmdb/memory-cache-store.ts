import type { CachedEntry, TmdbCacheStore } from "./tmdb-fetch-core";

/**
 * Bounded in-memory LRU for short-lived, high-cardinality TMDB answers (`/search/*`: every typed prefix is a key).
 * Entries older than `maxAgeMs` read as a miss; the least recently used entry is dropped past `maxEntries`.
 */
export function createMemoryCacheStore(maxEntries: number, maxAgeMs: number, now: () => number = Date.now): TmdbCacheStore {
  const map = new Map<string, CachedEntry<unknown>>();
  return {
    read<T>(key: string): CachedEntry<T> | null {
      const entry = map.get(key);
      if (!entry) return null;
      if (now() - entry.fetchedAt.getTime() > maxAgeMs) {
        map.delete(key);
        return null;
      }
      map.delete(key); // re-insert = most recently used
      map.set(key, entry);
      return entry as CachedEntry<T>;
    },
    write(key: string, data: unknown): void {
      map.delete(key);
      map.set(key, { data, fetchedAt: new Date(now()) });
      while (map.size > maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    size: () => map.size,
  };
}
