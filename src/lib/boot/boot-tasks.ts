import "server-only";
import { setTitleRefresher, startCloudJobPoller } from "@/lib/cloud/cloud-job-poller";
import { getEnv } from "@/lib/config/env";
import { refreshTitleSources } from "@/lib/sources/sources-service";
import { startTitleSourcesSweeper } from "@/lib/sources/title-sources-sweeper";
import { resumeTranslateJobs } from "@/lib/translate/subtitle-translate-job";
import { startNewEpisodeChecker } from "@/lib/ops/new-episode-checker";
import { startNightlyBackup } from "@/lib/ops/sqlite-backup";

/**
 * Phase 3 background work + Phase 5 translation-job resume + Phase 6 daily tasks (new-episode notifications, nightly
 * SQLite backup), started once per server process from instrumentation-node.ts. `LUMEN_SWEEPER=0` keeps the title_sources
 * sweeper off (dev / QA runs that must not touch TorBox in the background); the daily tasks follow the same switch so a
 * QA server never spends TMDB calls or writes backups behind the scripts.
 */
export function startBootTasks(): void {
  setTitleRefresher(refreshTitleSources);
  startCloudJobPoller();
  if (getEnv().LUMEN_SWEEPER === "1") {
    startTitleSourcesSweeper();
    startNewEpisodeChecker();
    startNightlyBackup();
  } else console.log("[boot] title_sources sweeper + daily tasks disabled (LUMEN_SWEEPER=0)");
  try {
    resumeTranslateJobs();
  } catch (err) {
    console.error("[boot] translate resume failed", err instanceof Error ? err.message : err);
  }
}
