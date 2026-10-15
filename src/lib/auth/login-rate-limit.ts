/** In-memory login throttle: 5 failures per IP per 5 minutes → 429 with retryAfterS. */
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function live(ip: string, now: number): Bucket | undefined {
  const b = buckets.get(ip);
  if (b && b.resetAt <= now) {
    buckets.delete(ip);
    return undefined;
  }
  return b;
}

/** Seconds the caller must wait, or 0 when allowed. */
export function loginBlockedForS(ip: string, now = Date.now()): number {
  const b = live(ip, now);
  if (!b || b.count < RATE_LIMIT_MAX) return 0;
  return Math.max(1, Math.ceil((b.resetAt - now) / 1000));
}

export function recordLoginFailure(ip: string, now = Date.now()): void {
  const b = live(ip, now);
  if (b) b.count += 1;
  else buckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
}

export function resetLoginFailures(ip: string): void {
  buckets.delete(ip);
}

/** Dev fixture helper. */
export function clearAllLoginFailures(): void {
  buckets.clear();
}
