import "server-only";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { copy } from "@/lib/copy-vi";
import { logActivity } from "@/lib/activity/log-activity";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { getTorrent, isTorboxUnreachable, listTorrents } from "@/lib/torbox/torbox-client";
import { forgetCacheCheck, markCached } from "@/lib/torbox/torbox-cache-check";
import { writeTorrentCache } from "@/lib/torbox/torbox-ensure-torrent";
import { pickVideoFile } from "@/lib/torbox/torbox-pick-video-file";
import type { TorboxTorrent } from "@/lib/torbox/torbox-types";
import { type CloudJobRow, listActiveJobs, rowMediaKey, torboxQueue, updateJob } from "./cloud-jobs-store";
import { applyTorboxStatus } from "./cloud-job-state-machine";
import { startNextQueued, simSpecs } from "./cloud-queue";
import { isSimTorrentId, markSimCached, simGetTorrent } from "./cloud-sim-torbox";

/**
 * The ONE server-side poller: every 5 s while any job is active, `mylist?id=` per started job (sim jobs read the dev fake);
 * TorBox-queued jobs (row: queued, no app position, no torrent id — reconciled from the DB alone, so a restart loses
 * nothing) are matched against one `mylist` list call every LIST_EVERY_TICKS ticks. Consecutive unreachable ticks back
 * off 5 s → 30 s. Finished → ready + torrent_cache + title_sources refresh + `cloud_ready` notification + activity row,
 * then app-queued jobs are promoted. Never polled from clients.
 */
export const POLL_INTERVAL_MS = 5000;
export const BACKOFF_MAX_MS = 30_000;
export const LIST_EVERY_TICKS = 6;
type PollerState = { backoffMs: number; nextAt: number; tick: number };
const g = globalThis as unknown as { __hcPoller?: ReturnType<typeof setInterval>; __hcStalled?: Map<number, number>; __hcPollerBusy?: boolean; __hcPollerState?: PollerState };
const stalledSince = (): Map<number, number> => (g.__hcStalled ??= new Map());
export const pollerState = (): PollerState => (g.__hcPollerState ??= { backoffMs: 0, nextAt: 0, tick: 0 });
/** sources-service hook (set by boot-tasks to avoid a circular import) */
let refreshTitle: ((mediaKey: string) => Promise<void>) | null = null;
export const setTitleRefresher = (fn: (mediaKey: string) => Promise<void>) => void (refreshTitle = fn);

async function readTorrent(job: CloudJobRow): Promise<TorboxTorrent | null | "unreachable"> {
  const id = job.torboxTorrentId!;
  if (isSimTorrentId(id)) {
    const t = simGetTorrent(id);
    // dev fake lost on restart (process memory) → the row can never progress: fail it so Thử lại / Huỷ work
    if (!t) updateJob(job.id, { state: "error", speedBps: 0, etaS: 0, errorMsg: copy.picker.failed });
    return t;
  }
  try {
    return await getTorrent(id);
  } catch (err) {
    if (isTorboxUnreachable(err)) return "unreachable";
    console.warn("[cloud] mylist failed", job.id, err instanceof Error ? err.message : err);
    return null;
  }
}

async function onReady(job: CloudJobRow, t: TorboxTorrent): Promise<void> {
  const key = parseMediaKey(rowMediaKey(job));
  const file = pickVideoFile(t.files ?? [], key?.season, key?.episode);
  const fileName = file?.short_name ?? file?.name.split("/").pop() ?? job.fileName;
  updateJob(job.id, { state: "ready", progress: 100, speedBps: 0, etaS: 0, finishedAt: new Date(), fileName, errorMsg: null });
  const sim = isSimTorrentId(t.id);
  if (sim) markSimCached(job.hash);
  else writeTorrentCache(job.hash, t.id, t.files ?? [], t.download_state);
  forgetCacheCheck(job.hash);
  markCached(job.hash, { hash: job.hash, name: t.name, size: t.size, files: (t.files ?? []).map((f) => ({ id: f.id, name: f.name, size: f.size, short_name: f.short_name })) });
  getDb().insert(schema.notifications).values({ userId: job.userId, type: "cloud_ready", title: job.title, mediaType: job.mediaType, tmdbId: job.tmdbId, season: job.season, episode: job.episode }).run();
  logActivity("cloud", copy.cloud.activityReady(job.title), job.userId);
  simSpecs().delete(job.id);
  if (!sim && refreshTitle) await refreshTitle(rowMediaKey(job)).catch((err) => console.warn("[cloud] title refresh failed", err instanceof Error ? err.message : err));
}

/** Promote TorBox-queued rows whose torrent now appears in the account list (DB state only — no in-memory gate). */
async function resolveTorboxQueued(jobs: CloudJobRow[], force: boolean): Promise<boolean> {
  // dev sim "queued" rows (picker-progress fixture) stay queued on purpose and must never cost a real list call
  const waiting = jobs.filter((j) => j.state === "queued" && j.appQueuePos === null && !j.torboxTorrentId && !simSpecs().has(j.id));
  if (!waiting.length) return true;
  const st = pollerState();
  if (!force && st.tick % LIST_EVERY_TICKS !== 0) return true;
  let list: TorboxTorrent[];
  try {
    list = await listTorrents();
  } catch (err) {
    console.warn("[cloud] list failed", err instanceof Error ? err.message : err);
    return !isTorboxUnreachable(err);
  }
  for (const job of waiting) {
    const t = list.find((x) => x.hash?.toLowerCase() === job.hash);
    if (t) {
      torboxQueue().delete(job.id);
      updateJob(job.id, { state: "downloading", torboxTorrentId: t.id });
    }
  }
  return true;
}

/** One tick. `force` skips the list-call throttle (first tick after boot / tests). Returns false when TorBox was unreachable. */
export async function pollOnce(now = Date.now(), force = false): Promise<boolean> {
  const st = pollerState();
  if (!force && now < st.nextAt) return true;
  const active = listActiveJobs();
  if (!active.length) return true;
  st.tick++;
  let reachable = await resolveTorboxQueued(active, force || st.tick === 1);
  if (reachable) {
    for (const job of listActiveJobs()) {
      if (!job.torboxTorrentId) continue;
      const t = await readTorrent(job);
      if (t === "unreachable") {
        reachable = false;
        break; // nothing else to do while TorBox is down
      }
      if (!t) continue;
      const patch = applyTorboxStatus({ state: job.state, progress: job.progress, stalledSince: stalledSince().get(job.id) ?? null }, t, now);
      if (patch.stalledSince === null) stalledSince().delete(job.id);
      else stalledSince().set(job.id, patch.stalledSince);
      if (patch.state === "ready") await onReady(job, t);
      else if (patch.state === "error") updateJob(job.id, { state: "error", progress: patch.progress, speedBps: 0, etaS: 0, errorMsg: copy.picker.failed });
      else updateJob(job.id, { state: "downloading", progress: patch.progress, speedBps: patch.speedBps, etaS: patch.etaS });
    }
  }
  if (reachable) {
    st.backoffMs = 0;
    st.nextAt = 0;
    await startNextQueued();
  } else {
    st.backoffMs = Math.min(BACKOFF_MAX_MS, Math.max(POLL_INTERVAL_MS, st.backoffMs * 2));
    st.nextAt = now + st.backoffMs;
  }
  return reachable;
}

/** Boot: one interval per process (HMR-safe), unref'd so it never keeps a test runner alive. */
export function startCloudJobPoller(): void {
  if (g.__hcPoller) return;
  g.__hcPoller = setInterval(() => {
    if (g.__hcPollerBusy) return;
    g.__hcPollerBusy = true;
    pollOnce()
      .catch((err) => console.error("[cloud] poll failed", err instanceof Error ? err.message : err))
      .finally(() => (g.__hcPollerBusy = false));
  }, POLL_INTERVAL_MS);
  g.__hcPoller.unref();
}
