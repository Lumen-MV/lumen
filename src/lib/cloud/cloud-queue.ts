import "server-only";
import type { MediaKey } from "@/lib/catalog/media-key";
import { getEnv } from "@/lib/config/env";
import { copy } from "@/lib/copy-vi";
import { logActivity } from "@/lib/activity/log-activity";
import type { Release } from "@/lib/sources/sources-types";
import { controlTorrent, createTorrent, isTorboxUnreachable } from "@/lib/torbox/torbox-client";
import { dropTorrentCache } from "@/lib/torbox/torbox-ensure-torrent";
import { buildMagnet } from "@/lib/torbox/torbox-pick-video-file";
import { type CloudJobRow, deleteJob, findLiveJobByHash, insertJob, listActiveJobs, torboxQueue, updateJob } from "./cloud-jobs-store";
import { type CloudSimSpec, isSimTorrentId, simCreateTorrent, simDeleteTorrent } from "./cloud-sim-torbox";

/**
 * App-side cloud queue: at most MAX_CLOUD_JOBS torrents are added to TorBox at once; later requests wait with
 * `app_queue_pos` ("Xếp hàng") and start when a slot frees (poller calls `startNextQueued`). TorBox's own slot queue
 * (`queued_id`) is tracked in memory for the slot counts only — the poller reconciles queued rows from the DB alone.
 */
const g = globalThis as unknown as { __hcCloudSimSpecs?: Map<number, CloudSimSpec> };
/** jobId → sim spec (dev only), kept for retries */
export const simSpecs = (): Map<number, CloudSimSpec> => (g.__hcCloudSimSpecs ??= new Map());

const countStarted = () => listActiveJobs().filter((j) => j.appQueuePos === null).length;

/** Adds the magnet to TorBox (or the dev sim) and moves the row to downloading / torbox-queued / error. Never throws. */
export async function startJob(job: CloudJobRow, release?: Pick<Release, "title" | "fileName"> & { sources?: string[] }): Promise<CloudJobRow> {
  const sim = simSpecs().get(job.id);
  try {
    const name = release?.title ?? job.releaseLabel ?? job.title;
    const res = sim ? simCreateTorrent(sim, job.hash, job.fileName || name) : await createTorrent(buildMagnet(job.hash, name, release?.sources), { addOnlyIfCached: false });
    // the sim knows its starting point right away; a real torrent reports progress on the poller's first tick
    const initial = sim ? { progress: sim.start, etaS: sim.kind === "downloading" ? 60 : 0, speedBps: 12_500_000 } : {};
    if (res.torrent_id) return updateJob(job.id, { state: "downloading", torboxTorrentId: res.torrent_id, appQueuePos: null, errorMsg: null, ...initial })!;
    if (res.queued_id) {
      torboxQueue().set(job.id, { queuedId: res.queued_id, active: res.current_active_downloads ?? res.active_limit ?? 0, limit: res.active_limit ?? 0 });
      return updateJob(job.id, { state: "queued", appQueuePos: null, errorMsg: null })!;
    }
    throw new Error("createtorrent returned neither torrent_id nor queued_id");
  } catch (err) {
    console.warn("[cloud] start failed", job.id, err instanceof Error ? err.message : err);
    // network / 5xx / 429 → "Không kết nối được Torbox"; a TorBox refusal (4xx) → "Tải thất bại (ít seed)"
    const msg = isTorboxUnreachable(err) ? copy.toastSamples.torboxDown : copy.picker.failed;
    return updateJob(job.id, { state: "error", errorMsg: msg })!;
  }
}

export type CreateJobInput = { userId: number; userName: string; key: MediaKey; release: Release; title: string; sim?: CloudSimSpec | null };

/** Dedupes by hash per title; starts immediately when a slot is free, else queues app-side. */
export async function createCloudJob(input: CreateJobInput): Promise<{ job: CloudJobRow; created: boolean }> {
  const existing = findLiveJobByHash(input.key, input.release.hash);
  if (existing) return { job: existing, created: false };
  const limit = getEnv().MAX_CLOUD_JOBS;
  const started = countStarted();
  const queuePos = started >= limit ? listActiveJobs().filter((j) => j.appQueuePos !== null).length + 1 : null;
  const row = insertJob({
    userId: input.userId,
    hash: input.release.hash,
    mediaType: input.key.type,
    tmdbId: input.key.tmdbId,
    season: input.key.season ?? null,
    episode: input.key.episode ?? null,
    title: input.title,
    releaseLabel: input.release.title,
    fileName: input.release.fileName ?? input.release.title,
    sizeBytes: input.release.sizeBytes,
    state: "queued",
    appQueuePos: queuePos,
  });
  if (input.sim) simSpecs().set(row.id, input.sim);
  logActivity("cloud", copy.cloud.activityStarted(input.userName, input.title), input.userId);
  if (queuePos !== null) return { job: row, created: true };
  return { job: await startJob(row, input.release), created: true };
}

/** Called by the poller after a job finished / was cancelled: promote app-queued jobs while slots are free. */
export async function startNextQueued(): Promise<void> {
  const limit = getEnv().MAX_CLOUD_JOBS;
  // dev admin-queue fixture rows flagged `holdQueue` stay app-queued on purpose ("Xếp hàng" + "Ưu tiên" screenshot / QA)
  const waiting = listActiveJobs().filter((j) => j.appQueuePos !== null && !simSpecs().get(j.id)?.holdQueue).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let free = limit - countStarted();
  for (const job of waiting) {
    if (free <= 0) break;
    await startJob(job);
    free--;
  }
}

/** Deletes the torrent the job added (sim: forgets it) — only for jobs that never finished; a ready torrent stays shared. */
async function deleteJobTorrent(job: CloudJobRow): Promise<void> {
  if (!job.torboxTorrentId) return;
  if (isSimTorrentId(job.torboxTorrentId)) {
    simDeleteTorrent(job.torboxTorrentId);
    return;
  }
  try {
    await controlTorrent(job.torboxTorrentId, "delete");
  } catch (err) {
    console.warn("[cloud] delete torrent failed", job.torboxTorrentId, err instanceof Error ? err.message : err);
  }
  dropTorrentCache(job.hash);
}

/**
 * Cancel semantics: queued / downloading / error → the torrent we added is deleted and the row dropped; `ready` → only the
 * row goes (the cached torrent is what every member's resolve relies on). Promotes the app queue afterwards.
 */
export async function cancelJob(job: CloudJobRow): Promise<void> {
  if (job.state !== "ready") await deleteJobTorrent(job);
  torboxQueue().delete(job.id);
  simSpecs().delete(job.id);
  deleteJob(job.id);
  await startNextQueued();
}

/** Account lock / delete: cancel the member's queued / downloading jobs (their torrents are removed, slots freed) before the row cascade. */
export async function cancelUserJobs(userId: number): Promise<number> {
  const mine = listActiveJobs().filter((j) => j.userId === userId);
  for (const job of mine) await cancelJob(job);
  return mine.length;
}

/** Only from `error`: the dead torrent is deleted first so the account does not collect failed copies. */
export async function retryJob(job: CloudJobRow): Promise<CloudJobRow> {
  await deleteJobTorrent(job);
  const fresh = updateJob(job.id, { state: "queued", progress: 0, speedBps: 0, etaS: 0, errorMsg: null, torboxTorrentId: null, appQueuePos: null })!;
  return startJob(fresh);
}
