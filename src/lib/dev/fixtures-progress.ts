import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { parseMediaKey, type MediaKey } from "@/lib/catalog/media-key";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { getSeason, getSeries } from "@/lib/tmdb/catalog-queries-detail";
import { createUser, findUserByUsername } from "@/lib/users/user-service";

/**
 * Dev-only Phase 4 fixtures (POST /api/dev/seed): progress rows (continue row, detail resume, series hero states),
 * my_list rows with staggered `added_at` ("N ngày trước"), and N fake active viewers for the limit-5 dialog.
 */
const mediaKey = z.string().min(4).max(40);
export const progressFixtureSchemas = [
  z.object({
    fixture: z.literal("progress"),
    username: z.string().optional(),
    /** replace every progress row of the user first (default true) */
    reset: z.boolean().optional(),
    rows: z
      .array(z.object({ mediaKey, positionS: z.number().min(0).optional(), durationS: z.number().min(0).optional(), completed: z.boolean().optional(), device: z.string().max(60).optional(), agoMs: z.number().int().nonnegative().optional(), /** `tv:id` only: mark every aired episode of every season completed */ allEpisodes: z.boolean().optional() }))
      .max(200),
  }),
  z.object({ fixture: z.literal("my-list"), username: z.string().optional(), items: z.array(z.object({ mediaKey, daysAgo: z.number().int().nonnegative().optional() })).max(100) }),
  z.object({ fixture: z.literal("viewers"), count: z.number().int().min(0).max(20), keep: z.boolean().optional() }),
  z.object({ fixture: z.literal("clear-views") }),
] as const;

type ProgressInput = z.infer<(typeof progressFixtureSchemas)[0]>;
type MyListInput = z.infer<(typeof progressFixtureSchemas)[1]>;

function userIdFor(username: string | undefined, adminId: number): number {
  if (!username) return adminId;
  const u = findUserByUsername(username);
  if (!u) throw new Error(`unknown user ${username}`);
  return u.id;
}

async function expandAllEpisodes(key: MediaKey): Promise<Array<{ season: number; episode: number }>> {
  const series = await getSeries(key.tmdbId);
  const out: Array<{ season: number; episode: number }> = [];
  for (const s of series.seasons) {
    const season = await getSeason(key.tmdbId, s.n).catch(() => ({ episodes: [] as Array<{ n: number; aired: boolean }> }));
    for (const e of season.episodes) if (e.aired) out.push({ season: s.n, episode: e.n });
  }
  return out;
}

export async function seedProgress(input: ProgressInput, adminId: number): Promise<{ rows: number }> {
  const db = getDb();
  const userId = userIdFor(input.username, adminId);
  if (input.reset !== false) db.delete(schema.progress).where(eq(schema.progress.userId, userId)).run();
  let n = 0;
  const now = Date.now();
  for (const r of input.rows) {
    const key = parseMediaKey(r.mediaKey);
    if (!key) throw new Error(`bad mediaKey ${r.mediaKey}`);
    const updatedAt = new Date(now - (r.agoMs ?? 0));
    const targets = r.allEpisodes && key.type === "tv" ? await expandAllEpisodes(key) : [{ season: key.season ?? 0, episode: key.episode ?? 0 }];
    for (const t of targets) {
      const durationS = r.durationS ?? 0;
      const completed = r.completed ?? false;
      db.insert(schema.progress)
        .values({ userId, mediaType: key.type, tmdbId: key.tmdbId, season: t.season, episode: t.episode, positionS: completed && r.positionS === undefined ? durationS : (r.positionS ?? 0), durationS, completed, deviceLabel: r.device ?? "Chrome · Windows", updatedAt })
        .onConflictDoUpdate({ target: [schema.progress.userId, schema.progress.mediaType, schema.progress.tmdbId, schema.progress.season, schema.progress.episode], set: { positionS: completed && r.positionS === undefined ? durationS : (r.positionS ?? 0), durationS, completed, deviceLabel: r.device ?? "Chrome · Windows", updatedAt } })
        .run();
      n++;
    }
  }
  return { rows: n };
}

export function seedMyList(input: MyListInput, adminId: number): { rows: number } {
  const db = getDb();
  const userId = userIdFor(input.username, adminId);
  db.delete(schema.myList).where(eq(schema.myList.userId, userId)).run();
  const now = Date.now();
  for (const it of input.items) {
    const key = parseMediaKey(it.mediaKey);
    if (!key) throw new Error(`bad mediaKey ${it.mediaKey}`);
    db.insert(schema.myList).values({ userId, mediaType: key.type, tmdbId: key.tmdbId, addedAt: new Date(now - (it.daysAgo ?? 0) * 86_400_000) }).onConflictDoNothing().run();
  }
  return { rows: input.items.length };
}

/** N members `viewer1..N` with a fresh direct view each (limit-5); 0 just clears the rows; `keep` leaves existing direct views (e.g. the admin's own seat). */
export async function seedViewers(count: number, keep = false): Promise<{ viewers: number }> {
  const db = getDb();
  if (!keep) db.delete(schema.views).where(eq(schema.views.mode, "direct")).run();
  for (let i = 1; i <= count; i++) {
    const username = `viewer${i}`;
    // dev-only accounts (LUMEN_SCENARIOS + admin): a random password per run so a seeded viewer is never a login-able fixed credential
    const u = findUserByUsername(username) ?? (await createUser({ username, displayName: `Viewer ${i}`, password: randomBytes(18).toString("base64url"), onboarded: true }));
    db.insert(schema.views).values({ userId: u.id, mediaType: "movie", tmdbId: 634649, releaseHash: "", mode: "direct", deviceLabel: "fixture", startedAt: new Date(), lastBeatAt: new Date() }).run();
  }
  return { viewers: count };
}

export function clearViews(): void {
  getDb().delete(schema.views).where(and(eq(schema.views.mode, "direct"))).run();
}
