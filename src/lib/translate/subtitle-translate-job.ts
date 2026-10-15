import "server-only";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { parseScenarioCookie, type ScenarioFlag } from "@/lib/dev/scenario-flags-shared";
import { simStateFor } from "@/lib/subtitles/subtitle-sim";
import { findAiRowFor, findSubRow, readVtt, type SubRow } from "@/lib/subtitles/subtitle-store";
import { ensureVtt } from "@/lib/subtitles/subtitle-vtt-ensure";
import { parseVtt } from "@/lib/subtitles/vtt-parser";
import { getMovie, getSeries } from "@/lib/tmdb/catalog-queries-detail";
import { simulatedOutage } from "./fake-translator";
import { pickTranslator } from "./pick-translator";
import { assembleCues, CONCURRENCY, contextFor, makeBatches, percentOf } from "./translate-batching";
import { translateBatchResilient } from "./translate-batch-runner";
import { addUsage } from "./translate-cost";
import { finishTranslateJob } from "./translate-job-finish";
import { addRequester, createJob, DAILY_JOB_LIMIT, failedJobForSource, jobsTodayCount, loadPersistedJobs, releaseJobText, runningJobFor, runningJobForSource, saveJob, type TranslateJob } from "./translate-job-registry";
import { TranslationShapeError, TranslatorUnavailableError, type Translator } from "./translator-interface";

/**
 * `POST /api/subs/translate`: one translation per source file, shared by everyone — a second viewer attaches to the
 * running job (409 JOB_RUNNING with the same id), "Thử lại" resumes the failed job (same id, finished batches kept,
 * no extra daily slot). Otherwise one running job per user and 5 finished per day. Batches of 50 cues run 4 at a
 * time, each result persisted (resumable), progress polled by the client. Dev: `subs-sim=popover-translating`
 * freezes a memory-only job at 42 %; `kie-down` / `subs-sim` swap the backend for the fake one.
 */
export type StartOutcome = { kind: "exists"; subId: number } | { kind: "started" | "running"; jobId: string } | { kind: "limit" } | { kind: "bad"; reason: "NOT_FOUND" | "NOT_ENGLISH" | "SOURCE_UNAVAILABLE" | "NO_TRANSLATOR" };
type StartInput = { userId: number; mediaKey: string; sourceSubId: number; scenario: Set<ScenarioFlag>; params: Map<ScenarioFlag, string> };
const SIM_FROZEN_PERCENT = 42;
const KIE_DOWN_PERCENT = 40;
const ERROR_INTERNAL = "internal error";

async function titleFor(mediaKey: string): Promise<string> {
  const key = parseMediaKey(mediaKey);
  if (!key) return mediaKey;
  try {
    return (key.type === "movie" ? await getMovie(key.tmdbId) : await getSeries(key.tmdbId)).title;
  } catch {
    return mediaKey;
  }
}

/** Client-facing error text: provider / shape messages only (no paths, no stack), everything else is generic. */
export function publicErrorMessage(err: unknown): string {
  if (err instanceof TranslatorUnavailableError || err instanceof TranslationShapeError) return err.message.replace(/[A-Za-z]:\\\S+|\/\S*\/\S+/g, "<path>").slice(0, 160);
  return ERROR_INTERNAL;
}

export async function startTranslateJob(input: StartInput): Promise<StartOutcome> {
  const { userId, mediaKey, sourceSubId, scenario, params } = input;
  const row = findSubRow(sourceSubId);
  if (!row || row.mediaKey !== mediaKey) return { kind: "bad", reason: "NOT_FOUND" };
  if (row.lang === "vi") return { kind: "bad", reason: "NOT_ENGLISH" };
  const existing = findAiRowFor(mediaKey, sourceSubId);
  if (existing) return { kind: "exists", subId: existing.id };
  const shared = runningJobForSource(sourceSubId);
  if (shared) {
    addRequester(shared, userId);
    return { kind: "running", jobId: shared.id };
  }
  const running = runningJobFor(userId);
  if (running) return { kind: "running", jobId: running.id };
  const translator = pickTranslator(scenario);
  if (!translator) return { kind: "bad", reason: "NO_TRANSLATOR" };
  const failed = failedJobForSource(sourceSubId);
  if (failed) {
    addRequester(failed, userId);
    failed.state = "running";
    failed.errorMsg = undefined;
    failed.scenario = [...scenario];
    failed.translator = translator.name;
    saveJob(failed);
    console.log(`[translate] resuming ${failed.id} after "Thử lại" at ${failed.percent}% (${Object.keys(failed.done).length}/${failed.total} batches kept)`);
    void runJob(failed, translator);
    return { kind: "started", jobId: failed.id };
  }
  if (jobsTodayCount(userId) >= DAILY_JOB_LIMIT) return { kind: "limit" };
  const sim = simStateFor(params, null);
  const title = await titleFor(mediaKey);
  if (sim === "popover-translating") {
    const job = createJob({ userId, mediaKey, sourceSubId, title, fileName: row.label, translator: "fake", total: 1, scenario: [...scenario], sim: true });
    job.percent = SIM_FROZEN_PERCENT;
    saveJob(job);
    return { kind: "started", jobId: job.id };
  }
  let source: SubRow;
  try {
    source = await ensureVtt(row, scenario, null);
  } catch (err) {
    console.warn("[translate] source unavailable", err instanceof Error ? err.message : err);
    return { kind: "bad", reason: "SOURCE_UNAVAILABLE" };
  }
  const cues = parseVtt(readVtt(source));
  const job = createJob({ userId, mediaKey, sourceSubId, title, fileName: row.label, translator: translator.name, total: makeBatches(cues).length, scenario: [...scenario], sim: sim !== null });
  void runJob(job, translator);
  return { kind: "started", jobId: job.id };
}

async function runJob(job: TranslateJob, translator: Translator): Promise<void> {
  const started = Date.now();
  try {
    const source = findSubRow(job.sourceSubId);
    if (!source) throw new Error("source row gone");
    const cues = parseVtt(readVtt(source));
    const batches = makeBatches(cues);
    job.total = batches.length;
    const pending = batches.map((_, k) => k).filter((k) => !job.done[k]);
    // dev `kie-down`: the provider "goes down" at 40 % — the batch that would take the job past 40 % fails
    const kieDown = job.scenario.includes("kie-down");
    let failed: unknown = null;
    const worker = async () => {
      while (pending.length && !failed) {
        const k = pending.shift()!;
        try {
          if (kieDown && ((k + 1) / job.total) * 100 > KIE_DOWN_PERCENT) throw simulatedOutage();
          const r = await translateBatchResilient(translator, batches[k], { previous: contextFor(batches, k, job.done), fileName: job.fileName });
          job.done[k] = r.lines;
          job.usage = addUsage(job.usage, r.usage);
          job.percent = percentOf(Object.keys(job.done).length, job.total);
          saveJob(job);
        } catch (err) {
          failed ??= err;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length || 1) }, worker));
    if (failed) throw failed;
    job.subId = finishTranslateJob(job, assembleCues(cues, batches, job.done));
    job.state = "done";
    job.percent = 100;
    saveJob(job);
    releaseJobText(job);
    console.log(`[translate] ${job.id} done: ${cues.length} cues, ${job.total} batches, ${((Date.now() - started) / 1000).toFixed(1)} s, ${translator.name}`);
  } catch (err) {
    job.state = "error";
    job.errorMsg = publicErrorMessage(err);
    saveJob(job);
    console.warn(`[translate] ${job.id} failed at ${job.percent}%: ${err instanceof Error ? err.message : err}`);
  }
}

/** Boot: continue every job that was still running when the process stopped (done batches are kept). */
export function resumeTranslateJobs(): void {
  for (const job of loadPersistedJobs()) {
    if (job.state !== "running") continue;
    const translator = pickTranslator(parseScenarioCookie(job.scenario.join(",")));
    if (!translator) {
      job.state = "error";
      job.errorMsg = "no translator configured";
      saveJob(job);
      continue;
    }
    console.log(`[translate] resuming ${job.id} at ${job.percent}%`);
    void runJob(job, translator);
  }
}
