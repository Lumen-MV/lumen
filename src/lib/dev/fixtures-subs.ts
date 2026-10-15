import { z } from "zod";
import { deleteSetting, setSetting } from "@/lib/settings/app-settings";
import { ensureSimRows } from "@/lib/subtitles/subtitle-sim";
import { deleteSubRowsFor, storeVtt, upsertCandidate } from "@/lib/subtitles/subtitle-store";
import { forgetSubtitleSearch } from "@/lib/subtitles/subtitle-search-service";
import type { Cue } from "@/lib/subtitles/subtitle-types";
import { clearJobsFor, seedFinishedJobs } from "@/lib/translate/translate-job-registry";
import { KEY_RESET_AT, KEY_REMAINING } from "@/lib/subtitles/os-quota-store";

/**
 * Dev-only Phase 5 fixtures (POST /api/dev/seed): `subs` resets a title's subtitle rows / files / prefs / jobs and
 * re-seeds the sim rows (deterministic popover states), `clear-subs` only wipes, `translate-jobs` seeds N finished jobs
 * for the admin (daily-limit check), `os-quota` writes the stored counters, `subs-row` adds one ready row with given
 * cues (or N generated English lines) for QA scripts (multi-batch jobs, crafted markup / overlap cues).
 */
const mediaKey = z.string().min(4).max(40);
const cue = z.object({ start: z.number().int().min(0), end: z.number().int().min(1), text: z.string().min(1).max(500) });
export const subsFixtureSchemas = [
  z.object({ fixture: z.literal("subs"), mediaKey }),
  z.object({ fixture: z.literal("clear-subs"), mediaKey }),
  z.object({ fixture: z.literal("translate-jobs"), mediaKey, count: z.number().int().min(0).max(10) }),
  z.object({ fixture: z.literal("os-quota"), remaining: z.number().int().min(0).max(1000).nullable(), resetInHours: z.number().min(0).max(48).optional() }),
  z.object({ fixture: z.literal("subs-row"), mediaKey, lang: z.enum(["vi", "en"]), source: z.enum(["os", "subdl", "embedded"]).default("os"), label: z.string().max(120).optional(), cues: z.union([z.number().int().min(1).max(5000), z.array(cue).min(1).max(5000)]) }),
] as const;

export function seedSubs(key: string, adminId: number): { rows: number } {
  deleteSubRowsFor(key);
  forgetSubtitleSearch(key);
  clearJobsFor(adminId);
  return { rows: ensureSimRows(key).length };
}

export function clearSubs(key: string, adminId: number): { deleted: number } {
  const deleted = deleteSubRowsFor(key);
  forgetSubtitleSearch(key);
  clearJobsFor(adminId);
  return { deleted };
}

export function seedTranslateJobs(key: string, adminId: number, count: number): { jobs: number } {
  clearJobsFor(adminId);
  seedFinishedJobs(adminId, key, count);
  return { jobs: count };
}

export function seedOsQuota(remaining: number | null, resetInHours = 22): { remaining: number | null } {
  if (remaining === null) {
    deleteSetting(KEY_REMAINING);
    deleteSetting(KEY_RESET_AT);
    return { remaining: null };
  }
  setSetting(KEY_REMAINING, remaining);
  setSetting(KEY_RESET_AT, Date.now() + resetInHours * 3_600_000);
  return { remaining };
}

export function seedSubRow(input: { mediaKey: string; lang: "vi" | "en"; source: "os" | "subdl" | "embedded"; label?: string; cues: number | Cue[] }): { id: number; cues: number } {
  const cues = typeof input.cues === "number" ? Array.from({ length: input.cues }, (_, i) => ({ start: i * 2000, end: i * 2000 + 1500, text: `English line ${i}` })) : input.cues;
  const row = upsertCandidate({ mediaKey: input.mediaKey, lang: input.lang, source: input.source, label: input.label ?? `qa.${input.lang}.${input.source}`, sourceFileId: `qa:${input.lang}-${input.source}`, downloads: 100 });
  storeVtt(row.id, cues);
  return { id: row.id, cues: cues.length };
}
