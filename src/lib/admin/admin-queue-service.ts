import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { copy } from "@/lib/copy-vi";
import { ACTIVE_STATES, getJob, updateJob, type CloudJobRow } from "@/lib/cloud/cloud-jobs-store";
import { getDb, schema } from "@/lib/db/sqlite-client";
import type { ScenarioFlag } from "@/lib/dev/scenario-flags-shared";
import { formatSize } from "@/lib/sources/release-labels";
import { parseRelease } from "@/lib/sources/release-parser";
import { planLabel, slotLimit, torboxPlan } from "@/lib/torbox/torbox-plan";

/** GET /api/admin/queue — active (downloading / queued) + failed + "Hoàn thành hôm nay" rows, slots a/b. */
export type QueueRow = {
  id: number;
  title: string;
  /** "1080p MP4 YTS 2.1 GB" */
  release: string;
  requestedBy: string;
  state: CloudJobRow["state"];
  progress: number;
  speedLabel: string;
  etaLabel: string;
  /** app-side queue position (null = already handed to TorBox) → "Ưu tiên" button */
  appQueuePos: number | null;
  finishedLabel: string;
};
export type AdminQueue = { active: QueueRow[]; failed: QueueRow[]; doneToday: QueueRow[]; slots: { active: number; limit: number; plan: string } };

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Pure: cloud job row → table row. */
export function toQueueRow(r: CloudJobRow, requestedBy: string): QueueRow {
  const q = copy.admin.queue;
  const p = parseRelease(r.releaseLabel || r.fileName, r.fileName);
  const container = p.container === "unknown" ? "" : p.container.toUpperCase();
  const release = [p.resolution, container, p.group, formatSize(r.sizeBytes)].filter((x) => x && x !== "?").join(" ");
  const pack = r.season !== null && r.episode === null ? ` S${r.season} ${q.pack}` : r.season !== null && r.episode !== null ? ` ${copy.stremio.episode(r.season, r.episode)}` : "";
  const downloading = r.state === "downloading";
  const mb = r.speedBps / 1_048_576;
  return {
    id: r.id,
    title: `${r.title}${pack}`,
    release,
    requestedBy,
    state: r.state,
    progress: Math.round(r.progress),
    speedLabel: downloading && r.speedBps > 0 ? q.speed(mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1)) : q.dash,
    etaLabel: downloading && r.etaS > 0 ? q.eta(Math.max(1, Math.round(r.etaS / 60))) : q.dash,
    appQueuePos: r.appQueuePos,
    finishedLabel: r.finishedAt ? `${pad2(r.finishedAt.getHours())}:${pad2(r.finishedAt.getMinutes())}` : q.dash,
  };
}

export async function getAdminQueue(scenario: Set<ScenarioFlag>, now = new Date()): Promise<AdminQueue> {
  const db = getDb();
  const names = new Map(db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).all().map((u) => [u.id, u.displayName]));
  const nameOf = (id: number) => names.get(id) ?? "?";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const active = db.select().from(schema.cloudJobs).where(inArray(schema.cloudJobs.state, [...ACTIVE_STATES])).orderBy(schema.cloudJobs.createdAt).all();
  const failed = db.select().from(schema.cloudJobs).where(eq(schema.cloudJobs.state, "error")).orderBy(desc(schema.cloudJobs.createdAt)).all();
  const done = db.select().from(schema.cloudJobs).where(and(eq(schema.cloudJobs.state, "ready"), gte(schema.cloudJobs.finishedAt, today))).orderBy(desc(schema.cloudJobs.finishedAt)).all();
  const plan = scenario.has("torbox-down") ? null : await torboxPlan(now.getTime());
  // downloading first, then TorBox-queued, then the app queue in position order (mockup: progress rows above "Xếp hàng")
  const order = (r: CloudJobRow) => (r.state === "downloading" ? 0 : r.appQueuePos === null ? 1 : 2);
  const activeRows = active.sort((a, b) => order(a) - order(b) || (a.appQueuePos ?? 0) - (b.appQueuePos ?? 0) || a.createdAt.getTime() - b.createdAt.getTime());
  return {
    active: activeRows.map((r) => toQueueRow(r, nameOf(r.userId))),
    failed: failed.map((r) => toQueueRow(r, nameOf(r.userId))),
    doneToday: done.map((r) => toQueueRow(r, nameOf(r.userId))),
    slots: { active: active.filter((r) => r.appQueuePos === null).length, limit: slotLimit(plan), plan: planLabel(plan) },
  };
}

/** "Ưu tiên": app-queued job jumps to position 1 (TorBox has no priority API; rows already handed to TorBox are untouched). */
export function prioritizeJob(id: number): CloudJobRow | null {
  const job = getJob(id);
  if (!job || job.appQueuePos === null) return null;
  const waiting = getDb().select().from(schema.cloudJobs).where(inArray(schema.cloudJobs.state, [...ACTIVE_STATES])).all().filter((j) => j.appQueuePos !== null && j.id !== id).sort((a, b) => (a.appQueuePos ?? 0) - (b.appQueuePos ?? 0));
  updateJob(id, { appQueuePos: 1 });
  waiting.forEach((j, i) => updateJob(j.id, { appQueuePos: i + 2 }));
  return getJob(id);
}
