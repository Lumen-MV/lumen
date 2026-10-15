import { slidingWindowLimited, type RateBuckets } from "@/lib/http/sliding-window-rate-limit";

/**
 * Per-device-token limits for the addon routes (a leaked manifest URL must not burn the TorBox / OpenSubtitles budgets):
 * 60 requests / minute across manifest / catalog / meta / stream / subtitles / subs, and 10 `play` resolves / minute.
 * The proxy `file` pipe is exempt (its handle is minted by the limited `play` route; players issue many Range requests).
 */
export const STREMIO_RATE_LIMIT = 60;
export const STREMIO_PLAY_RATE_LIMIT = 10;
export const STREMIO_RATE_WINDOW_MS = 60_000;
export type StremioRateScope = "general" | "play";

const g = globalThis as unknown as { __hcStremioRate?: RateBuckets };
const buckets = (): RateBuckets => (g.__hcStremioRate ??= new Map());

export function stremioRateLimited(token: string, scope: StremioRateScope, now = Date.now()): boolean {
  return slidingWindowLimited(buckets(), `${scope}:${token}`, scope === "play" ? STREMIO_PLAY_RATE_LIMIT : STREMIO_RATE_LIMIT, STREMIO_RATE_WINDOW_MS, now);
}

/** Dev fixture hook (`reset-rate-limit`). */
export function clearStremioRateBuckets(): void {
  buckets().clear();
}
