import type { ScenarioFlag } from "@/lib/dev/scenario-flags-shared";
import { getSetting, setSetting } from "@/lib/settings/app-settings";
import { OS_DAILY_QUOTA, type QuotaInfo } from "./subtitle-types";

/**
 * OpenSubtitles download quota bookkeeping in `settings` (`os_quota_remaining`, `os_quota_reset_at` as epoch ms).
 * Every real download answers `remaining` + `reset_time`; once the reset moment has passed the quota is assumed full
 * again (the next download corrects it). Scenario `os-quota-zero` reports 0 with a reset in 22 h (mockup copy).
 */
export const KEY_REMAINING = "os_quota_remaining";
export const KEY_RESET_AT = "os_quota_reset_at";
const SIM_RESET_HOURS = 22;

export function readOsQuota(scenario: Set<ScenarioFlag>, now = Date.now()): QuotaInfo {
  if (scenario.has("os-quota-zero")) return { remaining: 0, resetAt: now + SIM_RESET_HOURS * 3_600_000 };
  const remaining = getSetting<number | null>(KEY_REMAINING, null);
  const resetAt = getSetting<number | null>(KEY_RESET_AT, null);
  if (remaining === null) return { remaining: OS_DAILY_QUOTA, resetAt: null };
  if (resetAt !== null && resetAt <= now) return { remaining: OS_DAILY_QUOTA, resetAt: null };
  return { remaining, resetAt };
}

/** Called after each successful download with the API's own counters (`reset_time` is "HH:MM:SS" until reset or an ISO date). */
export function recordOsQuota(remaining: number, resetTime: string | null | undefined, now = Date.now()): QuotaInfo {
  const resetAt = parseResetTime(resetTime, now);
  setSetting(KEY_REMAINING, Math.max(0, Math.floor(remaining)));
  setSetting(KEY_RESET_AT, resetAt);
  return { remaining, resetAt };
}

/** A 406 / 429 from `/download` means the quota is gone even if the body carried no counters. */
export function recordOsQuotaExhausted(now = Date.now()): void {
  setSetting(KEY_REMAINING, 0);
  if (getSetting<number | null>(KEY_RESET_AT, null) === null) setSetting(KEY_RESET_AT, now + 24 * 3_600_000);
}

export function parseResetTime(raw: string | null | undefined, now = Date.now()): number | null {
  if (!raw) return null;
  const hms = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hms) return now + ((Number(hms[1]) * 60 + Number(hms[2])) * 60 + Number(hms[3])) * 1000;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

export { resetHours } from "./quota-format";
