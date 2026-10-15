import type { TorboxCreateResult, TorboxTorrent } from "@/lib/torbox/torbox-types";

/**
 * Dev-only fake TorBox for cloud jobs (LUMEN_SCENARIOS=1): no real download ever starts in the owner's account.
 * Spec (cookie `cloud-sim=<spec>` or seed fixture): `downloading[:start[:step]]` (progress % per poll; 0 = frozen),
 * `queued[:active:limit]`, `error`, `ready`. Sim torrents get NEGATIVE ids so the poller can tell them apart; the real
 * poller code path (mylist → state machine → ready/notification) runs unchanged against the fake answers.
 */
export type CloudSimSpec = { kind: "downloading" | "queued" | "error" | "ready"; start: number; step: number; active: number; limit: number; /** admin-queue fixture: reported speed / eta instead of the defaults */ speedBps?: number; etaS?: number; /** admin-queue fixture: keep the row in the app queue (never promoted) so "Ưu tiên" stays visible */ holdQueue?: boolean };
type SimTorrent = { spec: CloudSimSpec; hash: string; name: string; progress: number; polls: number };

const g = globalThis as unknown as { __hcCloudSim?: Map<number, SimTorrent>; __hcCloudSimNext?: number };
const sims = (): Map<number, SimTorrent> => (g.__hcCloudSim ??= new Map());

export function parseCloudSimSpec(raw: string | undefined): CloudSimSpec | null {
  if (!raw) return null;
  const [kind, a, b] = raw.split(":");
  if (kind !== "downloading" && kind !== "queued" && kind !== "error" && kind !== "ready") return null;
  const n = (v: string | undefined, def: number) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : def);
  return { kind, start: kind === "downloading" ? Math.min(99, n(a, 0)) : 0, step: n(b, 0), active: kind === "queued" ? n(a, 10) : 0, limit: kind === "queued" ? n(b, 10) : 0 };
}

export const isSimTorrentId = (id: number | null | undefined): id is number => typeof id === "number" && id < 0;

/** Registers a fake torrent and answers like `createtorrent` (queued specs answer with `queued_id`). */
export function simCreateTorrent(spec: CloudSimSpec, hash: string, name: string): TorboxCreateResult {
  const id = -(g.__hcCloudSimNext = (g.__hcCloudSimNext ?? 1000) + 1);
  sims().set(id, { spec, hash, name, progress: spec.start, polls: 0 });
  if (spec.kind === "queued") return { queued_id: id, active_limit: spec.limit, current_active_downloads: spec.active };
  return { torrent_id: id, hash };
}

/** Fake `mylist?id=`: advances `step` % per poll; ≥ 100 → finished with one MP4 file. */
export function simGetTorrent(id: number): TorboxTorrent | null {
  const t = sims().get(id);
  if (!t) return null;
  t.polls++;
  if (t.spec.kind === "error") return { id, hash: t.hash, download_state: "error", progress: t.progress / 100, seeds: 0, download_finished: false, download_present: false };
  if (t.spec.kind === "ready") t.progress = 100;
  else if (t.spec.kind === "downloading" && t.polls > 1) t.progress = Math.min(100, t.progress + t.spec.step);
  const finished = t.progress >= 100;
  const size = 2_933_066_258;
  return {
    id,
    hash: t.hash,
    name: t.name,
    size,
    download_state: finished ? "completed" : "downloading",
    progress: t.progress / 100,
    download_speed: finished ? 0 : (t.spec.speedBps ?? 12_500_000),
    eta: finished ? 0 : (t.spec.etaS ?? Math.round(((100 - t.progress) / 100) * 120)),
    seeds: 40,
    download_finished: finished,
    download_present: finished,
    files: [{ id: 0, name: t.name, short_name: t.name, size, mimetype: "video/mp4" }],
  };
}

export function simDeleteTorrent(id: number): void {
  sims().delete(id);
}

/** Hashes a sim job "cached": the picker shows them cached, but the sources service never persists that to title_sources. */
const simCached = (): Set<string> => ((g as { __hcSimCached?: Set<string> }).__hcSimCached ??= new Set());
export const markSimCached = (hash: string): void => void simCached().add(hash);
export const hasSimCached = (hashes: string[]): boolean => hashes.some((h) => simCached().has(h));

export function simReset(): void {
  sims().clear();
  simCached().clear();
}
