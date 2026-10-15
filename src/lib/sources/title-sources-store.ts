import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { MediaKey, MediaType } from "@/lib/catalog/media-key";
import { formatMediaKey } from "@/lib/catalog/media-key";
import { getDb, schema } from "@/lib/db/sqlite-client";
import type { CacheState, PlayClass } from "./sources-types";

/**
 * `title_sources`: the one place home / browse / episode chips read cache state from (no Torrentio per card).
 * Written by the sources service (detail open, picker), the poller (job finished) and the 6 h sweeper.
 */
export type TitleSourcesRow = typeof schema.titleSources.$inferSelect;
export type TitleSourcesSummary = { bestClass: PlayClass | null; bestLabel: string | null; cachedCount: number; releaseCount: number };

const DAY_MS = 86_400_000;

export function upsertTitleSources(key: MediaKey, s: TitleSourcesSummary, now = new Date()): void {
  const db = getDb();
  const season = key.season ?? 0;
  const episode = key.episode ?? 0;
  const existing = db
    .select({ firstCachedAt: schema.titleSources.firstCachedAt })
    .from(schema.titleSources)
    .where(and(eq(schema.titleSources.mediaType, key.type), eq(schema.titleSources.tmdbId, key.tmdbId), eq(schema.titleSources.season, season), eq(schema.titleSources.episode, episode)))
    .get();
  const firstCachedAt = s.cachedCount > 0 ? (existing?.firstCachedAt ?? now) : null;
  const values = { bestClass: s.bestClass, bestLabel: s.bestLabel, cachedCount: s.cachedCount, releaseCount: s.releaseCount, firstCachedAt, checkedAt: now };
  db.insert(schema.titleSources)
    .values({ mediaType: key.type, tmdbId: key.tmdbId, season, episode, ...values })
    .onConflictDoUpdate({ target: [schema.titleSources.mediaType, schema.titleSources.tmdbId, schema.titleSources.season, schema.titleSources.episode], set: values })
    .run();
}

export function getTitleSources(key: MediaKey): TitleSourcesRow | null {
  return (
    getDb()
      .select()
      .from(schema.titleSources)
      .where(and(eq(schema.titleSources.mediaType, key.type), eq(schema.titleSources.tmdbId, key.tmdbId), eq(schema.titleSources.season, key.season ?? 0), eq(schema.titleSources.episode, key.episode ?? 0)))
      .get() ?? null
  );
}

/** Title-level cache state for a list of cards (one query). Missing row → undefined (slot stays empty). */
export function cacheStatesFor(keys: Array<{ type: MediaType; tmdbId: number }>): Map<string, CacheState> {
  const out = new Map<string, CacheState>();
  const ids = [...new Set(keys.map((k) => k.tmdbId))];
  if (!ids.length) return out;
  const rows = getDb().select().from(schema.titleSources).where(and(inArray(schema.titleSources.tmdbId, ids), eq(schema.titleSources.season, 0), eq(schema.titleSources.episode, 0))).all();
  for (const r of rows) out.set(formatMediaKey(r.mediaType as MediaType, r.tmdbId), r.cachedCount > 0 ? "cached" : "uncached");
  return out;
}

/** Stamps `cacheState` on cards from title_sources. */
export function withCacheState<T extends { mediaKey: string; type: MediaType; tmdbId: number }>(items: T[]): Array<T & { cacheState?: CacheState }> {
  const states = cacheStatesFor(items);
  return items.map((it) => (states.has(it.mediaKey) ? { ...it, cacheState: states.get(it.mediaKey) } : it));
}

/** Titles whose first cached release was seen within `days` (newest first) → "Mới thêm vào cache". */
export function newInCache(days = 7, limit = 20, now = new Date()): TitleSourcesRow[] {
  return getDb()
    .select()
    .from(schema.titleSources)
    .where(and(eq(schema.titleSources.season, 0), eq(schema.titleSources.episode, 0), gt(schema.titleSources.firstCachedAt, new Date(now.getTime() - days * DAY_MS))))
    .orderBy(desc(schema.titleSources.firstCachedAt))
    .limit(limit)
    .all();
}

/** All cached titles of one type (newest cached first) → "Chỉ phim đã cache" browse source list. */
export function cachedTitles(type: MediaType): TitleSourcesRow[] {
  return getDb()
    .select()
    .from(schema.titleSources)
    .where(and(eq(schema.titleSources.mediaType, type), eq(schema.titleSources.season, 0), eq(schema.titleSources.episode, 0), gt(schema.titleSources.cachedCount, 0)))
    .orderBy(desc(schema.titleSources.firstCachedAt))
    .all();
}

/** Episode rows of one season (chips) keyed by episode number. */
export function seasonSources(tmdbId: number, season: number): Map<number, TitleSourcesRow> {
  const rows = getDb()
    .select()
    .from(schema.titleSources)
    .where(and(eq(schema.titleSources.mediaType, "tv"), eq(schema.titleSources.tmdbId, tmdbId), eq(schema.titleSources.season, season), sql`${schema.titleSources.episode} > 0`))
    .all();
  return new Map(rows.map((r) => [r.episode, r]));
}

/** Rows older than `maxAgeMs` (sweeper refresh candidates) */
export const isStale = (row: TitleSourcesRow | null, maxAgeMs: number, now = Date.now()): boolean => !row || now - row.checkedAt.getTime() > maxAgeMs;
