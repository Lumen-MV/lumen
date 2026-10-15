/**
 * Generic in-memory sliding-window limiter: `limit` hits per `windowMs` per key. Callers keep their own bucket map on
 * `globalThis` (so Next dev reloads keep one map) and expose a clear hook for the dev `reset-rate-limit` fixture.
 */
export type RateBuckets = Map<string, number[]>;

/** True when the key already used its allowance; otherwise records the hit and returns false. */
export function slidingWindowLimited(buckets: RateBuckets, key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    buckets.set(key, list);
    return true;
  }
  list.push(now);
  buckets.set(key, list);
  return false;
}
