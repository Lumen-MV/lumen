import type { QuotaInfo } from "./subtitle-types";

/** Hours until the OpenSubtitles quota resets, rounded up (amber note "đặt lại sau 22 giờ"). Client-safe (no db). */
export function resetHours(q: QuotaInfo, now = Date.now()): number {
  if (q.resetAt === null) return 24;
  return Math.max(1, Math.ceil((q.resetAt - now) / 3_600_000));
}
