import "server-only";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getEnv } from "@/lib/config/env";
import type { TranslateStatusDto } from "@/lib/subtitles/subtitle-types";
import type { TranslateUsage } from "./translator-interface";

/**
 * Translation jobs: in-memory map (HMR-safe) + one JSON per real job under `DATA_DIR/jobs/<id>.json` (written after
 * every batch → resumable after a restart or a "Thử lại"; dev sim jobs are memory-only). One job per source file is
 * shared by every viewer who asks for it (`requesters` get their own notification). Limits per user: one running job
 * at a time, 5 FINISHED jobs per rolling 24 h — failed jobs and retries never consume a slot. Finished jobs drop the
 * translated text from memory (the file keeps it).
 */
export type TranslateJob = {
  id: string;
  userId: number;
  /** other users who attached to this job while it ran (notified on completion; may poll its status) */
  requesters: number[];
  mediaKey: string;
  sourceSubId: number;
  title: string;
  fileName: string;
  translator: string;
  state: "running" | "done" | "error";
  percent: number;
  subId?: number;
  errorMsg?: string;
  total: number;
  done: Record<number, string[]>;
  usage: TranslateUsage;
  scenario: string[];
  sim: boolean;
  createdAt: number;
  updatedAt: number;
};
export const DAILY_JOB_LIMIT = 5;
const DAY_MS = 24 * 3_600_000;
const SHOW_ERROR_MS = 3_600_000;
const g = globalThis as unknown as { __hcTranslateJobs?: Map<string, TranslateJob> };
const jobs = (): Map<string, TranslateJob> => (g.__hcTranslateJobs ??= new Map());
export const jobsDir = (): string => path.resolve(process.cwd(), getEnv().DATA_DIR, "jobs");
const fileFor = (id: string) => path.join(jobsDir(), `${id}.json`);

export function createJob(input: Omit<TranslateJob, "id" | "requesters" | "state" | "percent" | "done" | "usage" | "createdAt" | "updatedAt">): TranslateJob {
  const job: TranslateJob = { ...input, id: randomBytes(8).toString("hex"), requesters: [], state: "running", percent: 0, done: {}, usage: { inputTokens: 0, outputTokens: 0 }, createdAt: Date.now(), updatedAt: Date.now() };
  jobs().set(job.id, job);
  saveJob(job);
  return job;
}

export function saveJob(job: TranslateJob): void {
  job.updatedAt = Date.now();
  jobs().set(job.id, job);
  if (job.sim) return;
  try {
    fs.mkdirSync(jobsDir(), { recursive: true });
    const tmp = `${fileFor(job.id)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(job), "utf8");
    fs.renameSync(tmp, fileFor(job.id));
  } catch (err) {
    console.error("[translate] persist failed", job.id, err instanceof Error ? err.message : err);
  }
}

/** After `saveJob` on completion: the file keeps every batch, memory only the summary. */
export const releaseJobText = (job: TranslateJob): void => void (job.done = {});

export const getJob = (id: string): TranslateJob | null => jobs().get(id) ?? null;
export const canReadJob = (job: TranslateJob, userId: number): boolean => job.userId === userId || job.requesters.includes(userId);
export function addRequester(job: TranslateJob, userId: number): void {
  if (job.userId === userId || job.requesters.includes(userId)) return;
  job.requesters.push(userId);
  saveJob(job);
}

/** Boot: load every persisted job (done / error ones for the daily count + resume; running ones are resumed by the runner). */
export function loadPersistedJobs(): TranslateJob[] {
  const dir = jobsDir();
  if (!fs.existsSync(dir)) return [];
  const out: TranslateJob[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const job = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as TranslateJob;
      if (Date.now() - job.createdAt > 7 * DAY_MS) {
        fs.rmSync(path.join(dir, f), { force: true });
        continue;
      }
      job.requesters ??= [];
      if (job.state === "done") releaseJobText(job);
      jobs().set(job.id, job);
      out.push(job);
    } catch (err) {
      console.warn("[translate] unreadable job file", f, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

export const runningJobFor = (userId: number): TranslateJob | null => [...jobs().values()].find((j) => j.userId === userId && j.state === "running") ?? null;
/** Any user's job on this source: running → attach to it; failed → resume it (same id, finished batches kept). */
export const runningJobForSource = (sourceSubId: number): TranslateJob | null => [...jobs().values()].find((j) => j.sourceSubId === sourceSubId && j.state === "running") ?? null;
export const failedJobForSource = (sourceSubId: number): TranslateJob | null => [...jobs().values()].filter((j) => j.sourceSubId === sourceSubId && j.state === "error").sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;

/** Jobs the user STARTED that are running or finished in the last 24 h (failed ones never count). */
export const jobsTodayCount = (userId: number, now = Date.now()): number => [...jobs().values()].filter((j) => j.userId === userId && !j.sim && j.state !== "error" && now - j.createdAt < DAY_MS).length;

export const toStatusDto = (j: TranslateJob): TranslateStatusDto => ({ jobId: j.id, percent: j.percent, state: j.state, ...(j.subId !== undefined ? { subId: j.subId } : {}), ...(j.errorMsg ? { errorMsg: j.errorMsg } : {}) });

/** Latest job of the user (owned or attached) for this title worth showing in the popover: running, or failed within the last hour. */
export function jobStatusForUser(userId: number, mediaKey: string, now = Date.now()): TranslateStatusDto | null {
  const mine = [...jobs().values()].filter((j) => canReadJob(j, userId) && j.mediaKey === mediaKey).sort((a, b) => b.updatedAt - a.updatedAt);
  const latest = mine[0];
  if (!latest) return null;
  if (latest.state === "running" || (latest.state === "error" && now - latest.updatedAt < SHOW_ERROR_MS)) return toStatusDto(latest);
  return null;
}

/** Dev fixtures: drop every job of a user (memory + files) or seed N fake finished ones (daily-limit test). */
export function clearJobsFor(userId: number): number {
  let n = 0;
  for (const [id, j] of jobs()) {
    if (j.userId !== userId) continue;
    jobs().delete(id);
    fs.rmSync(fileFor(id), { force: true });
    n++;
  }
  return n;
}
export function seedFinishedJobs(userId: number, mediaKey: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const job = createJob({ userId, mediaKey, sourceSubId: 0, title: "fixture", fileName: "fixture.mkv", translator: "fake", total: 1, scenario: [], sim: false });
    job.state = "done";
    job.percent = 100;
    saveJob(job);
  }
}
