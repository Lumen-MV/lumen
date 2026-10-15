import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { getSetting, setSetting } from "@/lib/settings/app-settings";
import { fetchTvRaw } from "@/lib/tmdb/tmdb-detail-fetch";

/**
 * "Tập mới" notifications: once a day, every series on anyone's My List is checked (cached TMDB detail, 3 d) — when its
 * `last_episode_to_air` aired within the last `RECENT_DAYS` and that user has no `new_episode` row for it yet, one is
 * written. Runs 30 s after boot and every 24 h; `settings.new_episode_checked_at` skips a re-run within 20 h (restarts).
 */
export const RECENT_DAYS = 7;
const KEY_CHECKED = "new_episode_checked_at";
const MIN_GAP_MS = 20 * 3_600_000;
const DAY_MS = 86_400_000;
const BOOT_DELAY_MS = 30_000;
const g = globalThis as unknown as { __hcNewEpTimer?: ReturnType<typeof setInterval> };

export type LastEpisode = { season_number: number; episode_number: number; air_date?: string | null };

/** Pure: should this episode notify? Aired (not in the future) within the window, no prior row. */
export function isNotifiableEpisode(ep: LastEpisode | null | undefined, now = new Date()): ep is LastEpisode {
  if (!ep?.air_date || ep.season_number <= 0) return false;
  const t = Date.parse(ep.air_date);
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= 0 && age <= RECENT_DAYS * DAY_MS;
}

function alreadyNotified(userId: number, tmdbId: number, ep: LastEpisode): boolean {
  return Boolean(getDb().select({ id: schema.notifications.id }).from(schema.notifications).where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.type, "new_episode"), eq(schema.notifications.tmdbId, tmdbId), eq(schema.notifications.season, ep.season_number), eq(schema.notifications.episode, ep.episode_number))).get());
}

export async function checkNewEpisodes(now = new Date()): Promise<number> {
  const db = getDb();
  const rows = db.select({ userId: schema.myList.userId, tmdbId: schema.myList.tmdbId }).from(schema.myList).where(eq(schema.myList.mediaType, "tv")).all();
  const bySeries = new Map<number, number[]>();
  for (const r of rows) bySeries.set(r.tmdbId, [...(bySeries.get(r.tmdbId) ?? []), r.userId]);
  let written = 0;
  for (const [tmdbId, userIds] of bySeries) {
    let d;
    try {
      d = await fetchTvRaw(tmdbId);
    } catch (err) {
      console.warn("[new-episode] detail failed", tmdbId, err instanceof Error ? err.message : err);
      continue;
    }
    const ep = d.last_episode_to_air;
    if (!isNotifiableEpisode(ep, now)) continue;
    for (const userId of userIds) {
      if (alreadyNotified(userId, tmdbId, ep)) continue;
      db.insert(schema.notifications).values({ userId, type: "new_episode", title: d.name, mediaType: "tv", tmdbId, season: ep.season_number, episode: ep.episode_number }).run();
      written++;
    }
  }
  setSetting(KEY_CHECKED, now.getTime());
  return written;
}

async function tick(): Promise<void> {
  const last = getSetting<number>(KEY_CHECKED, 0);
  if (Date.now() - last < MIN_GAP_MS) return;
  try {
    const n = await checkNewEpisodes();
    if (n > 0) console.log(`[new-episode] ${n} notification(s) written`);
  } catch (err) {
    console.error("[new-episode] check failed", err instanceof Error ? err.message : err);
  }
}

export function startNewEpisodeChecker(): void {
  if (g.__hcNewEpTimer) return;
  setTimeout(() => void tick(), BOOT_DELAY_MS).unref();
  g.__hcNewEpTimer = setInterval(() => void tick(), DAY_MS);
  g.__hcNewEpTimer.unref();
}
