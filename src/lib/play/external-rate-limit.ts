/**
 * Hand-off link rate limit (`GET /api/play/external`): 10 calls / minute / user, in-memory sliding window. Lives on
 * `globalThis` so Next's dev module reloads keep one bucket map; `clearExternalRateBuckets` is the dev fixture hook
 * (`reset-rate-limit`) that makes the QA chain deterministic.
 */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const g = globalThis as unknown as { __hcExternalRate?: Map<number, number[]> };
const buckets = (): Map<number, number[]> => (g.__hcExternalRate ??= new Map());

export function externalRateLimited(userId: number, now = Date.now()): boolean {
  const list = (buckets().get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_LIMIT) return true;
  list.push(now);
  buckets().set(userId, list);
  return false;
}

export function clearExternalRateBuckets(): void {
  buckets().clear();
}
