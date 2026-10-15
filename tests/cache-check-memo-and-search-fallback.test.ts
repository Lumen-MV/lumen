import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRelease } from "@/lib/sources/hash-source-interface";

/** checkCachedMemo (TTL, LRU bound, outage → last known) and searchHashes (Torrentio → YTS fallback, outage never memoised). */
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "admin-pass-123";

const mocks = vi.hoisted(() => ({ checkCached: vi.fn() }));
vi.mock("@/lib/torbox/torbox-client", () => {
  class TorboxError extends Error {
    constructor(message: string, public readonly status: number, public readonly detail: string, public readonly path: string) {
      super(message);
      this.name = "TorboxError";
    }
  }
  return { TorboxError, checkCached: mocks.checkCached, isTorboxUnreachable: (e: unknown) => e instanceof TorboxError && (e.status === 0 || e.status >= 500 || e.status === 429), isTorrentGone: () => false, requestDownloadLink: vi.fn(), torboxStats: {} };
});

type Memo = typeof import("@/lib/torbox/torbox-cache-check");
type Svc = typeof import("@/lib/sources/sources-service");
let memo: Memo;
let svc: Svc;
const H = (n: number) => n.toString(16).padStart(40, "0");
const NOW = 1_800_000_000_000;

beforeAll(async () => {
  memo = await import("@/lib/torbox/torbox-cache-check");
  svc = await import("@/lib/sources/sources-service");
});
beforeEach(() => {
  mocks.checkCached.mockReset();
  memo.resetCacheCheckMemo();
});

describe("checkCachedMemo", () => {
  it("fresh hashes go to TorBox once; inside the 10-min TTL nothing is re-asked", async () => {
    mocks.checkCached.mockResolvedValueOnce(new Map([[H(1), { hash: H(1), files: [] }]]));
    const a = await memo.checkCachedMemo([H(1), H(2)], NOW);
    expect(a.cached.has(H(1)) && !a.cached.has(H(2)) && !a.down).toBe(true);
    const b = await memo.checkCachedMemo([H(1), H(2)], NOW + memo.CACHE_CHECK_TTL_MS - 1);
    expect(b.cached.has(H(1))).toBe(true);
    expect(mocks.checkCached).toHaveBeenCalledTimes(1);
    mocks.checkCached.mockResolvedValueOnce(new Map());
    await memo.checkCachedMemo([H(1)], NOW + memo.CACHE_CHECK_TTL_MS + 1);
    expect(mocks.checkCached).toHaveBeenCalledTimes(2);
  });
  it("TorBox unreachable → last known answers (even expired) with down:true; a 4xx still throws", async () => {
    mocks.checkCached.mockResolvedValueOnce(new Map([[H(1), { hash: H(1) }]]));
    await memo.checkCachedMemo([H(1)], NOW);
    const { TorboxError } = await import("@/lib/torbox/torbox-client");
    mocks.checkCached.mockRejectedValueOnce(new TorboxError("down", 0, "network", "/p"));
    const r = await memo.checkCachedMemo([H(1), H(3)], NOW + memo.CACHE_CHECK_TTL_MS * 2);
    expect(r.down).toBe(true);
    expect(r.cached.has(H(1))).toBe(true);
    expect(memo.knownCached([H(1), H(3)]).size).toBe(1);
    mocks.checkCached.mockRejectedValueOnce(new TorboxError("bad", 400, "bad hashes", "/p"));
    await expect(memo.checkCachedMemo([H(4)], NOW)).rejects.toMatchObject({ status: 400 });
  });
  it("is bounded: the 500 most recently touched hashes survive, older ones are evicted", async () => {
    for (let i = 0; i < memo.CACHE_CHECK_MAX_ENTRIES + 50; i++) memo.markCached(H(1000 + i), null, NOW);
    expect(memo.cacheCheckMemoSize()).toBe(memo.CACHE_CHECK_MAX_ENTRIES);
    memo.markCached(H(1000), { hash: H(1000) }, NOW); // touch an evicted one → back in, newest
    expect(memo.knownCached([H(1000)]).size).toBe(1);
    expect(memo.knownCached([H(1001)]).size).toBe(0);
  });
});

describe("searchHashes fallback + outage handling", () => {
  const rel = (n: number): RawRelease => ({ hash: H(n), title: `X.S04E01.1080p.WEB.x264.AAC-G${n}.mp4`, sizeBytes: 1, seeders: 1, tracker: "" });
  it("Torrentio throws + YTS n/a (series) → SourcesUnavailableError, NOT a memoised empty list; recovery is immediate", async () => {
    let calls = 0;
    const failing = { name: "torrentio", async search() { calls++; throw new Error("Torrentio 502"); } };
    const emptyYts = { name: "yts", async search() { calls++; return []; } };
    svc.setHashSources([failing, emptyYts]);
    await expect(svc.searchHashes("tt0000001", 4, 1)).rejects.toBeInstanceOf(svc.SourcesUnavailableError);
    const working = { name: "torrentio", async search() { calls++; return [rel(1)]; } };
    svc.setHashSources([working, emptyYts]);
    expect((await svc.searchHashes("tt0000001", 4, 1)).length).toBe(1);
    expect(calls).toBe(3);
    svc.setHashSources(null);
  });
  it("Torrentio throws but YTS returns releases (movie) → the YTS rows are used and memoised", async () => {
    let torrentio = 0;
    const failing = { name: "torrentio", async search() { torrentio++; throw new Error("Torrentio unreachable"); } };
    const yts = { name: "yts", async search() { return [rel(7), rel(8)]; } };
    svc.setHashSources([failing, yts]);
    expect((await svc.searchHashes("tt0000002")).length).toBe(2);
    expect((await svc.searchHashes("tt0000002")).length).toBe(2);
    expect(torrentio).toBe(1); // memo hit on the second call
    svc.setHashSources(null);
  });
  it("Torrentio finds nothing and YTS finds nothing without errors → genuine empty (memoised, no throw)", async () => {
    const empty = { name: "torrentio", async search() { return []; } };
    const emptyYts = { name: "yts", async search() { return []; } };
    svc.setHashSources([empty, emptyYts]);
    expect(await svc.searchHashes("tt0000003")).toEqual([]);
    svc.setHashSources(null);
  });
  it("Torrentio finds releases → YTS is never asked", async () => {
    let yts = 0;
    svc.setHashSources([{ name: "torrentio", async search() { return [rel(9)]; } }, { name: "yts", async search() { yts++; return []; } }]);
    await svc.searchHashes("tt0000004");
    expect(yts).toBe(0);
    svc.setHashSources(null);
  });
});
