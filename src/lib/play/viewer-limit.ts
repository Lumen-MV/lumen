import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import { getEnv } from "@/lib/config/env";
import { getDb, schema } from "@/lib/db/sqlite-client";
import type { MediaKey } from "@/lib/catalog/media-key";

/**
 * `views` rows double as viewer heartbeats: `POST /api/progress` beats the viewer's direct view (one row per user +
 * title); a view is active while its last beat is < 60 s old. The manifest refuses a NEW viewer once MAX_CONCURRENT_VIEWERS
 * distinct users are active (429 LIMIT_5). App hand-off rows (`mode:'app'`) are logged but never counted.
 */
export const VIEW_ACTIVE_WINDOW_MS = 60_000;
const VIEW_RETENTION_MS = 30 * 86_400_000;

export type ViewMode = "direct" | "app" | "stremio";

export function beatView(userId: number, key: MediaKey, mode: ViewMode, releaseHash: string, deviceLabel: string, now = new Date()): void {
  const db = getDb();
  const fresh = new Date(now.getTime() - VIEW_ACTIVE_WINDOW_MS);
  const existing = db
    .select({ id: schema.views.id })
    .from(schema.views)
    .where(and(eq(schema.views.userId, userId), eq(schema.views.mediaType, key.type), eq(schema.views.tmdbId, key.tmdbId), eq(schema.views.mode, mode), gt(schema.views.lastBeatAt, fresh)))
    .get();
  if (existing) {
    db.update(schema.views).set({ lastBeatAt: now, season: key.season ?? null, episode: key.episode ?? null }).where(eq(schema.views.id, existing.id)).run();
    return;
  }
  db.insert(schema.views).values({ userId, mediaType: key.type, tmdbId: key.tmdbId, season: key.season ?? null, episode: key.episode ?? null, releaseHash, mode, deviceLabel, startedAt: now, lastBeatAt: now }).run();
  // keep the table small: old rows stay 30 days for the admin's "lượt xem tháng" (Phase 6)
  db.delete(schema.views).where(lt(schema.views.lastBeatAt, new Date(now.getTime() - VIEW_RETENTION_MS))).run();
}

/** Distinct users with a direct view beat inside the window. */
export function activeViewerIds(now = new Date()): Set<number> {
  const fresh = new Date(now.getTime() - VIEW_ACTIVE_WINDOW_MS);
  const rows = getDb().select({ userId: schema.views.userId }).from(schema.views).where(and(eq(schema.views.mode, "direct"), gt(schema.views.lastBeatAt, fresh))).all();
  return new Set(rows.map((r) => r.userId));
}

/** `ok` when the user already counts among the active viewers or a seat is free. */
export function checkViewerLimit(userId: number, now = new Date()): { ok: boolean; active: number; limit: number } {
  const active = activeViewerIds(now);
  const limit = getEnv().MAX_CONCURRENT_VIEWERS;
  return { ok: active.has(userId) || active.size < limit, active: active.size, limit };
}
