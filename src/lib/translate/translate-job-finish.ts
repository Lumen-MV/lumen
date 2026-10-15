import "server-only";
import { logActivity } from "@/lib/activity/log-activity";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { copy } from "@/lib/copy-vi";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { getSetting, incrementSetting, setSetting } from "@/lib/settings/app-settings";
import { aiSourceFileId, storeVtt, upsertCandidate } from "@/lib/subtitles/subtitle-store";
import type { Cue } from "@/lib/subtitles/subtitle-types";
import { costVnd, monthKey } from "./translate-cost";
import type { TranslateJob } from "./translate-job-registry";

/**
 * A finished job becomes a `subtitle_cache` row (`source: ai`, `source_file_id: ai:<sourceSubId>` — one translation per
 * source file, reused by everyone), one `subtitle_ready` notification per requester (owner + attached viewers), a
 * `translate` activity line and a bump of `settings.ai_month_cost_vnd` (reset when the month rolls over).
 */
export const KEY_MONTH_COST = "ai_month_cost_vnd";
export const KEY_MONTH = "ai_month_cost_month";

export function addMonthCost(vnd: number, now = new Date()): number {
  const month = monthKey(now);
  if (getSetting<string | null>(KEY_MONTH, null) !== month) {
    setSetting(KEY_MONTH, month);
    setSetting(KEY_MONTH_COST, 0);
  }
  return incrementSetting(KEY_MONTH_COST, vnd);
}

export function finishTranslateJob(job: TranslateJob, cues: Cue[]): number {
  const cost = costVnd(job.translator, job.usage);
  const row = upsertCandidate({ mediaKey: job.mediaKey, lang: "vi", source: "ai", label: copy.subs.viAi, sourceFileId: aiSourceFileId(job.sourceSubId), downloads: 0 });
  storeVtt(row.id, cues, cost);
  const key = parseMediaKey(job.mediaKey);
  for (const userId of new Set([job.userId, ...job.requesters])) {
    try {
      getDb().insert(schema.notifications).values({ userId, type: "subtitle_ready", title: job.title, mediaType: key?.type ?? null, tmdbId: key?.tmdbId ?? null, season: key?.season ?? null, episode: key?.episode ?? null }).run();
    } catch (err) {
      console.error("[translate] notification failed", userId, err instanceof Error ? err.message : err);
    }
  }
  logActivity("translate", copy.subs.activityTranslate(job.title, cues.length, cost), job.userId);
  if (!job.sim) addMonthCost(cost);
  return row.id;
}
