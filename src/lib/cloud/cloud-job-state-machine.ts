import type { TorboxTorrent } from "@/lib/torbox/torbox-types";

/**
 * Pure poller logic: one TorBox `mylist` answer → the patch to apply to a cloud job (tested against recorded fixtures in
 * tests/cloud-job-state-machine.test.ts). Dead torrent = stalled with 0 seeds for > 10 min, or TorBox `error`/`missingFiles`.
 */
export type JobSnapshot = { state: "queued" | "downloading" | "ready" | "error"; progress: number; stalledSince: number | null };
export type JobPatch = {
  state: "queued" | "downloading" | "ready" | "error";
  /** 0–100 */
  progress: number;
  speedBps: number;
  etaS: number;
  stalledSince: number | null;
  dead: boolean;
};

export const DEAD_STALL_MS = 10 * 60_000;
const STALLED_STATES = new Set(["stalled", "stalledDL", "metaDL", "paused"]);
const ERROR_STATES = new Set(["error", "missingFiles"]);

export const isTorrentFinished = (t: TorboxTorrent): boolean => Boolean(t.download_finished && t.download_present);

export function applyTorboxStatus(job: JobSnapshot, t: TorboxTorrent, now: number): JobPatch {
  const progress = Math.max(0, Math.min(100, Math.round((t.progress ?? 0) * 100)));
  const speedBps = Math.max(0, Math.round(t.download_speed ?? 0));
  const etaS = Math.max(0, Math.round(t.eta ?? 0));
  if (isTorrentFinished(t)) return { state: "ready", progress: 100, speedBps: 0, etaS: 0, stalledSince: null, dead: false };
  if (ERROR_STATES.has(t.download_state)) return { state: "error", progress, speedBps: 0, etaS: 0, stalledSince: null, dead: true };
  const stalledNoSeeds = STALLED_STATES.has(t.download_state) && (t.seeds ?? 0) === 0;
  const stalledSince = stalledNoSeeds ? (job.stalledSince ?? now) : null;
  if (stalledSince !== null && now - stalledSince >= DEAD_STALL_MS) return { state: "error", progress, speedBps: 0, etaS: 0, stalledSince, dead: true };
  return { state: "downloading", progress, speedBps, etaS, stalledSince, dead: false };
}

/** Minutes left for the "~N phút" tag (≥ 1 while downloading). */
export const etaMinutes = (etaS: number): number | undefined => (etaS > 0 ? Math.max(1, Math.ceil(etaS / 60)) : undefined);
