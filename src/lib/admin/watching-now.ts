import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { copy } from "@/lib/copy-vi";
import type { MediaKey } from "@/lib/catalog/media-key";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { formatClock } from "@/lib/format/time-format";
import { shortDeviceName } from "./device-short-name";
import { titleLabel } from "./title-label";

/**
 * "Đang xem lúc này": one row per user with a `views` beat inside the last 90 s (direct player heartbeats every ~15 s,
 * Stremio / app hand-offs beat once at play). Position comes from the viewer's progress row; a Stremio play shows "Stremio".
 */
export const WATCHING_WINDOW_MS = 90_000;
export type WatchingNow = { userId: number; name: string; title: string; mode: "direct" | "app" | "stremio"; /** "1:02" · "Stremio" · "iPad" */ detail: string };

type LiveRow = { userId: number; name: string; key: MediaKey; mode: "direct" | "app" | "stremio"; deviceLabel: string };

/** Newest live beat per user (a user watching on two devices still counts once). */
export function liveViewRows(now = new Date()): LiveRow[] {
  const fresh = new Date(now.getTime() - WATCHING_WINDOW_MS);
  const rows = getDb()
    .select({ userId: schema.views.userId, name: schema.users.displayName, mediaType: schema.views.mediaType, tmdbId: schema.views.tmdbId, season: schema.views.season, episode: schema.views.episode, mode: schema.views.mode, deviceLabel: schema.views.deviceLabel, lastBeatAt: schema.views.lastBeatAt })
    .from(schema.views)
    .innerJoin(schema.users, eq(schema.views.userId, schema.users.id))
    .where(gt(schema.views.lastBeatAt, fresh))
    .all()
    .sort((a, b) => b.lastBeatAt.getTime() - a.lastBeatAt.getTime());
  const seen = new Set<number>();
  const out: LiveRow[] = [];
  for (const r of rows) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    const key: MediaKey = { type: r.mediaType as MediaKey["type"], tmdbId: r.tmdbId };
    if (r.season !== null && r.episode !== null) Object.assign(key, { season: r.season, episode: r.episode });
    out.push({ userId: r.userId, name: r.name, key, mode: r.mode, deviceLabel: r.deviceLabel });
  }
  return out;
}

function positionOf(userId: number, key: MediaKey): number | null {
  const row = getDb().select({ positionS: schema.progress.positionS }).from(schema.progress).where(and(eq(schema.progress.userId, userId), eq(schema.progress.mediaType, key.type), eq(schema.progress.tmdbId, key.tmdbId), eq(schema.progress.season, key.season ?? 0), eq(schema.progress.episode, key.episode ?? 0))).get();
  return row ? row.positionS : null;
}

export async function listWatchingNow(now = new Date()): Promise<WatchingNow[]> {
  return Promise.all(
    liveViewRows(now).map(async (r) => {
      const title = await titleLabel(r.key);
      const pos = r.mode === "direct" ? positionOf(r.userId, r.key) : null;
      const detail = r.mode === "stremio" ? copy.stremio.app : pos !== null && pos > 0 ? formatClock(pos) : shortDeviceName(r.deviceLabel);
      return { userId: r.userId, name: r.name, title, mode: r.mode, detail };
    }),
  );
}
