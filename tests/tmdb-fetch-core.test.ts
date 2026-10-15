import { describe, expect, it, vi } from "vitest";
import { createLimiter } from "@/lib/tmdb/limit-concurrency";
import { createMemoryCacheStore } from "@/lib/tmdb/memory-cache-store";
import { createTmdbCore, TmdbError, type TmdbCacheStore } from "@/lib/tmdb/tmdb-fetch-core";

const HOUR = 3_600_000;
const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function memStore(): TmdbCacheStore & { map: Map<string, { data: unknown; fetchedAt: Date }> } {
  const map = new Map<string, { data: unknown; fetchedAt: Date }>();
  return { map, read: <T,>(k: string) => (map.get(k) as { data: T; fetchedAt: Date } | undefined) ?? null, write: (k, data) => void map.set(k, { data, fetchedAt: new Date(clock.now) }) };
}
const clock = { now: 1_700_000_000_000 };

function makeCore(fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createTmdbCore>[0]> = {}) {
  const warn = vi.fn();
  const sleep = vi.fn(async () => undefined);
  const core = createTmdbCore({ token: () => "secret-token", timeoutMs: 8000, maxInFlight: 6, retryAfterCapMs: 5000, expiredFallbackMaxMs: 7 * 24 * HOUR, fetchImpl, sleep, now: () => clock.now, warn, ...extra });
  return { core, warn, sleep };
}

describe("tmdb fetch core", () => {
  it("sends the bearer token, caches the answer and serves it while fresh", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
      return jsonResponse({ ok: 1 });
    });
    const store = memStore();
    const { core } = makeCore(fetchImpl as unknown as typeof fetch);
    expect(await core.cachedFetch(store, "k", "/movie/1", { language: "vi-VN" }, HOUR)).toEqual({ ok: 1 });
    expect(await core.cachedFetch(store, "k", "/movie/1", { language: "vi-VN" }, HOUR)).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://api.themoviedb.org/3/movie/1?language=vi-VN");
  });

  it("stale (TTL < age ≤ 2×TTL): serves the cached copy and revalidates in the background", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ v: 2 }));
    const store = memStore();
    store.map.set("k", { data: { v: 1 }, fetchedAt: new Date(clock.now - HOUR - 1) });
    const { core } = makeCore(fetchImpl as unknown as typeof fetch);
    expect(await core.cachedFetch(store, "k", "/p", {}, HOUR)).toEqual({ v: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.map.get("k")?.data).toEqual({ v: 2 });
  });

  it("expired (> 2×TTL): refetches; on failure serves the expired row only within the fallback bound", async () => {
    const failing = vi.fn(async () => jsonResponse({ code: "x" }, 503));
    const store = memStore();
    store.map.set("k", { data: { old: true }, fetchedAt: new Date(clock.now - 3 * HOUR) });
    const { core, warn } = makeCore(failing as unknown as typeof fetch);
    expect(await core.cachedFetch(store, "k", "/p", {}, HOUR)).toEqual({ old: true });
    expect(warn).toHaveBeenCalledWith("[tmdb] serving expired cache after fetch failure", "k");
    store.map.set("k", { data: { ancient: true }, fetchedAt: new Date(clock.now - 8 * 24 * HOUR) });
    await expect(core.cachedFetch(store, "k", "/p", {}, HOUR)).rejects.toMatchObject({ name: "TmdbError", status: 503 });
  });

  it("404 is never masked by a cached copy", async () => {
    const notFound = vi.fn(async () => jsonResponse({}, 404));
    const store = memStore();
    store.map.set("k", { data: { old: true }, fetchedAt: new Date(clock.now - 3 * HOUR) });
    const { core } = makeCore(notFound as unknown as typeof fetch);
    await expect(core.cachedFetch(store, "k", "/movie/9", {}, HOUR)).rejects.toMatchObject({ status: 404 });
  });

  it("429: waits Retry-After (0.5–5 s clamp) and retries exactly once", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "2" })).mockResolvedValueOnce(jsonResponse({ ok: true }));
    const { core, sleep } = makeCore(fetchImpl as unknown as typeof fetch);
    expect(await core.cachedFetch(memStore(), "k", "/p", {}, HOUR)).toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledWith(2000);
    const twice = vi.fn().mockResolvedValue(jsonResponse({}, 429, { "retry-after": "99" }));
    const second = makeCore(twice as unknown as typeof fetch);
    await expect(second.core.cachedFetch(memStore(), "k", "/p", {}, HOUR)).rejects.toMatchObject({ status: 429 });
    expect(second.sleep).toHaveBeenCalledWith(5000);
    expect(twice).toHaveBeenCalledTimes(2);
  });

  it("aborts a hung request after timeoutMs and reports it as a TmdbError (status 0)", async () => {
    const hung = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))));
    const { core } = makeCore(hung as unknown as typeof fetch, { timeoutMs: 20 });
    const err = await core.cachedFetch(memStore(), "k", "/p", {}, HOUR).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TmdbError);
    expect((err as TmdbError).status).toBe(0);
    expect((err as TmdbError).message).toContain("TimeoutError");
  });

  it("de-duplicates in-flight requests per key", async () => {
    let resolve!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    const store = memStore();
    const { core } = makeCore(fetchImpl as unknown as typeof fetch);
    const a = core.cachedFetch(store, "k", "/p", {}, HOUR);
    const b = core.cachedFetch(store, "k", "/p", {}, HOUR);
    resolve(jsonResponse({ once: true }));
    expect(await Promise.all([a, b])).toEqual([{ once: true }, { once: true }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("caps concurrent network calls at maxInFlight", async () => {
    let active = 0, peak = 0;
    const fetchImpl = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return jsonResponse({});
    });
    const { core } = makeCore(fetchImpl as unknown as typeof fetch, { maxInFlight: 2 });
    await Promise.all(Array.from({ length: 7 }, (_, i) => core.cachedFetch(memStore(), `k${i}`, `/p/${i}`, {}, HOUR)));
    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(peak).toBe(2);
  });

  it("fails fast without a token", async () => {
    const fetchImpl = vi.fn();
    const { core } = makeCore(fetchImpl as unknown as typeof fetch, { token: () => undefined });
    await expect(core.cachedFetch(memStore(), "k", "/p", {}, HOUR)).rejects.toMatchObject({ name: "TmdbError", status: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("createLimiter", () => {
  it("never runs more than max at once and keeps FIFO order", async () => {
    const limit = createLimiter(2);
    const order: number[] = [];
    let active = 0, peak = 0;
    await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        limit(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 3));
          order.push(i);
          active--;
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(order).toEqual([1, 2, 3, 4, 5]);
    expect(() => createLimiter(0)).toThrow();
  });
});

describe("memory cache store (search LRU)", () => {
  it("evicts the least recently used entry past maxEntries and expires by age", () => {
    let t = 0;
    const store = createMemoryCacheStore(2, 1000, () => t);
    store.write("a", 1);
    store.write("b", 2);
    store.read("a"); // a becomes most recently used
    store.write("c", 3); // evicts b
    expect(store.read("b")).toBeNull();
    expect(store.read("a")?.data).toBe(1);
    expect(store.size?.()).toBe(2);
    t = 1001;
    expect(store.read("a")).toBeNull();
    expect(store.size?.()).toBe(1);
  });
});
