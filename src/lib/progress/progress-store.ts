import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import type { MediaKey } from "@/lib/catalog/media-key";
import { isCompleted, percentOf, resumeOffered } from "./progress-rules";
import type { EpisodeProgressRow } from "./series-progress-rules";

/** `progress` table access (per user · title · season/episode; movies use season = episode = 0). */
export type ProgressRow = typeof schema.progress.$inferSelect;

const titleWhere = (userId: number, key: MediaKey) => and(eq(schema.progress.userId, userId), eq(schema.progress.mediaType, key.type), eq(schema.progress.tmdbId, key.tmdbId));
const rowWhere = (userId: number, key: MediaKey) => and(titleWhere(userId, key), eq(schema.progress.season, key.season ?? 0), eq(schema.progress.episode, key.episode ?? 0));

export function getProgress(userId: number, key: MediaKey): ProgressRow | null {
  return getDb().select().from(schema.progress).where(rowWhere(userId, key)).get() ?? null;
}

/**
 * Heartbeat upsert: position/duration + device; `completed` follows the 92 % rule and is sticky — a replay ("↺ Xem lại",
 * a rewatch from the detail page) moves the position but never removes "Đã xem ✓"; only the ⋯ "Đánh dấu chưa xem" does.
 */
export function upsertProgress(userId: number, key: MediaKey, positionS: number, durationS: number, deviceLabel: string, now = new Date()): ProgressRow {
  const db = getDb();
  const completed = Boolean(getProgress(userId, key)?.completed) || isCompleted(positionS, durationS);
  const values = { userId, mediaType: key.type, tmdbId: key.tmdbId, season: key.season ?? 0, episode: key.episode ?? 0, positionS, durationS, completed, deviceLabel, updatedAt: now };
  db.insert(schema.progress)
    .values(values)
    .onConflictDoUpdate({ target: [schema.progress.userId, schema.progress.mediaType, schema.progress.tmdbId, schema.progress.season, schema.progress.episode], set: { positionS, durationS, completed: values.completed, deviceLabel, updatedAt: now } })
    .run();
  return getProgress(userId, key)!;
}

/** "Xoá khỏi Tiếp tục xem": drops the in-progress rows of the title; completed ("Đã xem ✓") marks survive. */
export function removeFromContinue(userId: number, key: MediaKey): void {
  getDb().delete(schema.progress).where(and(titleWhere(userId, key), eq(schema.progress.completed, false))).run();
}

export function clearHistory(userId: number): number {
  return getDb().delete(schema.progress).where(eq(schema.progress.userId, userId)).run().changes;
}

/** ⋯ menu: watched → completed row at 100 % (duration kept when known); unwatched → row deleted. */
export function markWatched(userId: number, key: MediaKey, watched: boolean, deviceLabel: string, now = new Date()): void {
  const db = getDb();
  if (!watched) {
    db.delete(schema.progress).where(rowWhere(userId, key)).run();
    return;
  }
  const existing = getProgress(userId, key);
  const durationS = existing?.durationS ?? 0;
  const values = { userId, mediaType: key.type, tmdbId: key.tmdbId, season: key.season ?? 0, episode: key.episode ?? 0, positionS: durationS, durationS, completed: true, deviceLabel, updatedAt: now };
  db.insert(schema.progress)
    .values(values)
    .onConflictDoUpdate({ target: [schema.progress.userId, schema.progress.mediaType, schema.progress.tmdbId, schema.progress.season, schema.progress.episode], set: { positionS: durationS, completed: true, deviceLabel, updatedAt: now } })
    .run();
}

/** Every row of one series, newest first (series summary + episode bars). */
export function seriesRows(userId: number, tmdbId: number): EpisodeProgressRow[] {
  return getDb()
    .select()
    .from(schema.progress)
    .where(and(eq(schema.progress.userId, userId), eq(schema.progress.mediaType, "tv"), eq(schema.progress.tmdbId, tmdbId)))
    .orderBy(desc(schema.progress.updatedAt))
    .all()
    .map((r) => ({ season: r.season, episode: r.episode, positionS: r.positionS, durationS: r.durationS, completed: r.completed, updatedAt: r.updatedAt.getTime() }));
}

/** All rows of a user, newest first (continue list builds on it). */
export function userRows(userId: number): ProgressRow[] {
  return getDb().select().from(schema.progress).where(eq(schema.progress.userId, userId)).orderBy(desc(schema.progress.updatedAt)).all();
}

/** Resume payload for the manifest / detail primary (null outside the 30 s … 95 % window). */
export function resumeInfo(row: ProgressRow | null): { positionS: number; percent: number; device: string; updatedAt: Date } | null {
  if (!row || row.completed || !resumeOffered(row.positionS, row.durationS)) return null;
  return { positionS: row.positionS, percent: percentOf(row.positionS, row.durationS), device: row.deviceLabel, updatedAt: row.updatedAt };
}
