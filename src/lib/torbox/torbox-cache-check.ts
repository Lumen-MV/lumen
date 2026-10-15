import "server-only";
import { checkCached, isTorboxUnreachable } from "./torbox-client";
import type { TorboxCachedEntry } from "./torbox-types";

/**
 * 10-minute per-hash memo over `checkcached` (process-local, survives HMR via globalThis), bounded to the 500 most
 * recently touched hashes (LRU). Only unknown / expired hashes go to TorBox (batched ≤ 100). When TorBox is unreachable
 * the last known answers (any age, still in the LRU) are returned with `down:true` so the picker can dim rows instead of
 * losing them ("Vẫn xem được bản đã lấy link trong 50 phút").
 */
export const CACHE_CHECK_TTL_MS = 10 * 60_000;
export const CACHE_CHECK_MAX_ENTRIES = 500;
type Entry = { cached: TorboxCachedEntry | null; at: number };
const g = globalThis as unknown as { __hcCacheCheck?: Map<string, Entry> };
const memo = (): Map<string, Entry> => (g.__hcCacheCheck ??= new Map());

/** Re-insert = most recently used; evict the oldest past the cap. */
function remember(hash: string, entry: Entry): void {
  const m = memo();
  m.delete(hash);
  m.set(hash, entry);
  while (m.size > CACHE_CHECK_MAX_ENTRIES) {
    const oldest = m.keys().next().value;
    if (oldest === undefined) break;
    m.delete(oldest);
  }
}

export type CacheCheckResult = { cached: Map<string, TorboxCachedEntry>; down: boolean };

export async function checkCachedMemo(hashes: string[], now = Date.now()): Promise<CacheCheckResult> {
  const m = memo();
  const result = new Map<string, TorboxCachedEntry>();
  const stale: string[] = [];
  for (const h of hashes) {
    const e = m.get(h);
    if (e && now - e.at < CACHE_CHECK_TTL_MS) {
      remember(h, e);
      if (e.cached) result.set(h, e.cached);
    } else stale.push(h);
  }
  if (stale.length === 0) return { cached: result, down: false };
  try {
    const fresh = await checkCached(stale);
    for (const h of stale) {
      const c = fresh.get(h) ?? null;
      remember(h, { cached: c, at: now });
      if (c) result.set(h, c);
    }
    return { cached: result, down: false };
  } catch (err) {
    if (!isTorboxUnreachable(err)) throw err;
    // keep whatever we knew (even expired) for the dimmed list
    for (const h of stale) {
      const c = m.get(h)?.cached;
      if (c) result.set(h, c);
    }
    return { cached: result, down: true };
  }
}

/** Last known answers (any age) without touching TorBox — the `torbox-down` scenario, the dimmed list and the sweeper. */
export function knownCached(hashes: string[]): Map<string, TorboxCachedEntry> {
  const out = new Map<string, TorboxCachedEntry>();
  for (const h of hashes) {
    const c = memo().get(h)?.cached;
    if (c) out.set(h, c);
  }
  return out;
}

/** A finished cloud job makes its hash cached: drop the memo so the next sources call re-checks. */
export function forgetCacheCheck(hash: string): void {
  memo().delete(hash);
}

/** Dev scenario `all-uncached` / tests. */
export function markCached(hash: string, entry: TorboxCachedEntry | null, now = Date.now()): void {
  remember(hash, { cached: entry, at: now });
}

/** Tests / dev fixtures. */
export const cacheCheckMemoSize = (): number => memo().size;
export const resetCacheCheckMemo = (): void => memo().clear();
