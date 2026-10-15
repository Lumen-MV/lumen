import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { formatMediaKey, type MediaKey, type MediaType } from "@/lib/catalog/media-key";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { getEnv } from "@/lib/config/env";
import type { CloudJob } from "@/lib/sources/sources-types";
import { etaMinutes } from "./cloud-job-state-machine";

/** `cloud_jobs` CRUD + row → API mapping. Active = queued | downloading. */
export type CloudJobRow = typeof schema.cloudJobs.$inferSelect;
export const ACTIVE_STATES = ["queued", "downloading"] as const;

export function rowMediaKey(r: CloudJobRow): string {
  return formatMediaKey(r.mediaType as MediaType, r.tmdbId, r.season ?? undefined, r.episode ?? undefined);
}

/** TorBox-side queue info (`queued_id`, slot counts) is process memory: the row has no torrent id until the download starts. */
export type TorboxQueueInfo = { queuedId: number; active: number; limit: number };
const g = globalThis as unknown as { __hcTorboxQueue?: Map<number, TorboxQueueInfo> };
export const torboxQueue = (): Map<number, TorboxQueueInfo> => (g.__hcTorboxQueue ??= new Map());

export function toCloudJob(r: CloudJobRow): CloudJob {
  const limit = getEnv().MAX_CLOUD_JOBS;
  const job: CloudJob = { id: r.id, hash: r.hash, mediaKey: rowMediaKey(r), userId: r.userId, state: r.state, progress: Math.round(r.progress), fileName: r.fileName, title: r.title };
  if (r.state === "downloading") {
    job.etaMin = etaMinutes(r.etaS);
    job.speedBps = r.speedBps;
  }
  if (r.state === "queued") {
    const tb = torboxQueue().get(r.id);
    job.queuedSlots = tb ? { active: tb.active, limit: tb.limit } : { active: limit, limit };
  }
  if (r.state === "error" && r.errorMsg) job.errorMsg = r.errorMsg;
  return job;
}

export function getJob(id: number): CloudJobRow | null {
  return getDb().select().from(schema.cloudJobs).where(eq(schema.cloudJobs.id, id)).get() ?? null;
}

export function listJobsForMedia(key: MediaKey): CloudJobRow[] {
  const where = [eq(schema.cloudJobs.mediaType, key.type), eq(schema.cloudJobs.tmdbId, key.tmdbId)];
  if (key.season !== undefined && key.episode !== undefined) where.push(eq(schema.cloudJobs.season, key.season), eq(schema.cloudJobs.episode, key.episode));
  return getDb().select().from(schema.cloudJobs).where(and(...where)).orderBy(desc(schema.cloudJobs.createdAt)).all();
}

/** Jobs for every episode of a season (chips) + title-level packs stored under episode rows. */
export function listJobsForSeason(tmdbId: number, season: number): CloudJobRow[] {
  return getDb().select().from(schema.cloudJobs).where(and(eq(schema.cloudJobs.mediaType, "tv"), eq(schema.cloudJobs.tmdbId, tmdbId), eq(schema.cloudJobs.season, season))).all();
}

export function listJobsForUser(userId: number): CloudJobRow[] {
  return getDb().select().from(schema.cloudJobs).where(eq(schema.cloudJobs.userId, userId)).orderBy(desc(schema.cloudJobs.createdAt)).limit(50).all();
}

export function listActiveJobs(): CloudJobRow[] {
  return getDb().select().from(schema.cloudJobs).where(inArray(schema.cloudJobs.state, [...ACTIVE_STATES])).orderBy(schema.cloudJobs.createdAt).all();
}

/** Same hash already queued/downloading/ready for the same title → reuse (dedupe by hash per title). */
export function findLiveJobByHash(key: MediaKey, hash: string): CloudJobRow | null {
  return listJobsForMedia({ type: key.type, tmdbId: key.tmdbId }).find((j) => j.hash === hash && j.state !== "error") ?? null;
}

export function insertJob(values: typeof schema.cloudJobs.$inferInsert): CloudJobRow {
  const id = Number(getDb().insert(schema.cloudJobs).values(values).run().lastInsertRowid);
  return getJob(id)!;
}

export function updateJob(id: number, patch: Partial<typeof schema.cloudJobs.$inferInsert>): CloudJobRow | null {
  getDb().update(schema.cloudJobs).set(patch).where(eq(schema.cloudJobs.id, id)).run();
  return getJob(id);
}

export function deleteJob(id: number): void {
  getDb().delete(schema.cloudJobs).where(eq(schema.cloudJobs.id, id)).run();
}

/** For /api/me: how many of the user's jobs are active + the newest one (title + %) for the logout dialog. */
export function activeJobsSummary(userId: number): { activeCloudJobs: number; activeJob: { title: string; progress: number } | null } {
  const active = getDb()
    .select()
    .from(schema.cloudJobs)
    .where(and(eq(schema.cloudJobs.userId, userId), inArray(schema.cloudJobs.state, [...ACTIVE_STATES])))
    .orderBy(desc(schema.cloudJobs.createdAt))
    .all();
  return { activeCloudJobs: active.length, activeJob: active[0] ? { title: active[0].title, progress: Math.round(active[0].progress) } : null };
}
