import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/admin/activity-filter-rules";
import { PASSWORD_CHANGE_PATH, passwordChangeBlocks } from "@/lib/auth/password-change-gate";
import { slidingWindowLimited } from "@/lib/http/sliding-window-rate-limit";
import { mapWithConcurrency } from "@/lib/stremio/map-with-concurrency";
import { splitCatalogPath } from "@/lib/stremio/stremio-ids";
import { clearStremioRateBuckets, STREMIO_PLAY_RATE_LIMIT, STREMIO_RATE_LIMIT, stremioRateLimited } from "@/lib/stremio/stremio-rate-limit";
import { buildStreams, orderByQualityPref } from "@/lib/stremio/stremio-stream-builder";
import type { Release } from "@/lib/sources/sources-types";

/** Fix round 1 pure rules: temp-password gate, CSV formula escape, Stremio per-token limits, 4K-first stream order, catalog decode, season concurrency. */

describe("temp-password gate", () => {
  it("blocks every page but /settings and every API but /api/me, /api/me/password, logout", () => {
    expect(PASSWORD_CHANGE_PATH).toBe("/settings?tab=profile");
    for (const p of ["/", "/movie/1", "/admin", "/my-list", "/watch/abc", "/api/me/sessions", "/api/sources", "/api/admin/users", "/api/me/profile", "/api/me/device-token"]) expect(passwordChangeBlocks(true, p)).toBe(true);
    for (const p of ["/settings", "/api/me", "/api/me/password", "/api/auth/logout"]) expect(passwordChangeBlocks(true, p)).toBe(false);
    expect(passwordChangeBlocks(false, "/admin")).toBe(false);
  });
});

describe("CSV formula escape", () => {
  it("prefixes = + - @ tab/CR-leading cells with an apostrophe and still quotes commas / quotes / newlines", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+84 912")).toBe("'+84 912");
    expect(csvCell("-foo")).toBe("'-foo");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell('=HYPERLINK("x"),y')).toBe("\"'=HYPERLINK(\"\"x\"\"),y\"");
    expect(csvCell("Bảo")).toBe("Bảo");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("line\r\nbreak")).toBe('"line\r\nbreak"');
  });
});

describe("Stremio per-token rate limit", () => {
  it("sliding window: limit hits per window per key, then frees as old hits age out", () => {
    const b = new Map<string, number[]>();
    for (let i = 0; i < 3; i++) expect(slidingWindowLimited(b, "k", 3, 1000, 1000 + i)).toBe(false);
    expect(slidingWindowLimited(b, "k", 3, 1000, 1500)).toBe(true);
    expect(slidingWindowLimited(b, "other", 3, 1000, 1500)).toBe(false);
    expect(slidingWindowLimited(b, "k", 3, 1000, 2001)).toBe(false); // the hit at t=1000 aged out
  });
  it("60/min general and 10/min play, independent per scope and token; the dev clear hook resets", () => {
    clearStremioRateBuckets();
    const t = "a".repeat(32), now = 5_000_000;
    for (let i = 0; i < STREMIO_RATE_LIMIT; i++) expect(stremioRateLimited(t, "general", now + i)).toBe(false);
    expect(stremioRateLimited(t, "general", now + 100)).toBe(true);
    expect(stremioRateLimited("b".repeat(32), "general", now + 100)).toBe(false);
    for (let i = 0; i < STREMIO_PLAY_RATE_LIMIT; i++) expect(stremioRateLimited(t, "play", now + i)).toBe(false);
    expect(stremioRateLimited(t, "play", now + 100)).toBe(true);
    expect(stremioRateLimited(t, "general", now + 60_000 + 1)).toBe(false);
    clearStremioRateBuckets();
    expect(stremioRateLimited(t, "play", now + 200)).toBe(false);
  });
});

const rel = (hash: string, resolution: Release["parsed"]["resolution"], playClass: Release["playClass"], cacheState: Release["cacheState"] = "cached"): Release =>
  ({ hash, title: `t-${hash}`, qualityLabel: resolution, formatLabel: "MKV", sizeLabel: "4 GB", cacheState, playClass, parsed: { resolution, group: "G", bad: false } } as unknown as Release);

describe("stream list honours the quality pref", () => {
  const releases = [rel("1".repeat(40), "1080p", "direct"), rel("2".repeat(40), "2160p", "maybe"), rel("3".repeat(40), "1080p", "maybe"), rel("4".repeat(40), "2160p", "app"), rel("5".repeat(40), "720p", "direct"), rel("6".repeat(40), "2160p", "maybe"), rel("7".repeat(40), "1080p", "direct", "uncached")];
  it("2160p pref → every 2160p row first (score order kept inside), 1080p pref → 1080p first; max 5 cached", () => {
    expect(orderByQualityPref(releases.slice(0, 6), "2160p").map((r) => r.parsed.resolution)).toEqual(["2160p", "2160p", "2160p", "1080p", "1080p", "720p"]);
    const four = buildStreams({ releases, base: "https://x", token: "t".repeat(32), mediaKey: "movie:1", quality: "2160p" });
    expect(four.filter((s) => s.url).map((s) => s.name)).toEqual(["Lumen\n2160p", "Lumen\n2160p", "Lumen\n2160p", "Lumen\n1080p", "Lumen\n1080p"]);
    expect(four.filter((s) => s.url)).toHaveLength(5);
    const hd = buildStreams({ releases, base: "https://x", token: "t".repeat(32), mediaKey: "movie:1", quality: "1080p" });
    expect(hd.filter((s) => s.url).map((s) => s.name)[0]).toBe("Lumen\n1080p");
    expect(hd.filter((s) => s.url).map((s) => s.name)[1]).toBe("Lumen\n1080p");
    expect(hd.filter((s) => s.infoHash)).toHaveLength(1);
  });
});

describe("catalog path decode", () => {
  it("parses skip extras and throws URIError on malformed percent-encoding (route answers 400)", () => {
    expect(splitCatalogPath(["lumen-anime", "skip=20.json"])).toEqual({ id: "lumen-anime", extra: { skip: "20" } });
    expect(() => splitCatalogPath(["lumen-anime", "skip=%E0.json"])).toThrow(URIError);
  });
});

describe("mapWithConcurrency", () => {
  it("never exceeds the cap, keeps order, maps rejections to null", async () => {
    let inFlight = 0, peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (n === 3) throw new Error("boom");
      return n * 2;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
    expect(out).toEqual([2, 4, null, 8, 10, 12, 14, 16, 18]);
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
