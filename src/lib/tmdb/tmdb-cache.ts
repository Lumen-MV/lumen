import "server-only";
import { eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import type { CachedEntry } from "./tmdb-fetch-core";

/** tmdb_cache row IO (policy lives in tmdb-cache-policy.ts). JSON is stored as text; parse errors count as a miss. */
export type { CachedEntry };

export function readTmdbCache<T>(key: string): CachedEntry<T> | null {
  const row = getDb().select().from(schema.tmdbCache).where(eq(schema.tmdbCache.key, key)).get();
  if (!row) return null;
  try {
    return { data: JSON.parse(row.json) as T, fetchedAt: row.fetchedAt };
  } catch (err) {
    console.error("[tmdb-cache] corrupt row", key, err);
    return null;
  }
}

export function writeTmdbCache(key: string, data: unknown): void {
  const json = JSON.stringify(data);
  const fetchedAt = new Date();
  getDb()
    .insert(schema.tmdbCache)
    .values({ key, json, fetchedAt })
    .onConflictDoUpdate({ target: schema.tmdbCache.key, set: { json, fetchedAt } })
    .run();
}

/** Delete rows fetched more than `olderThanMs` ago (at-rest bound, TMDB ToS ≤ 6 months). Returns the row count. */
export function purgeTmdbCache(olderThanMs: number, now: number = Date.now()): number {
  return getDb().delete(schema.tmdbCache).where(lt(schema.tmdbCache.fetchedAt, new Date(now - olderThanMs))).run().changes;
}

/** Dev/test helper: drop every cached TMDB response. */
export function clearTmdbCache(): void {
  getDb().delete(schema.tmdbCache).run();
}
