import { describe, expect, it } from "vitest";
import { TMDB_TTL, cacheFreshness, tmdbCacheKey } from "@/lib/tmdb/tmdb-cache-policy";

const H = 3_600_000;

describe("tmdb cache policy", () => {
  it("has the TTL classes from the plan (lists 3h, details 3d, genres 30d, season 1d)", () => {
    expect(TMDB_TTL.list).toBe(3 * H);
    expect(TMDB_TTL.detail).toBe(72 * H);
    expect(TMDB_TTL.genres).toBe(30 * 24 * H);
    expect(TMDB_TTL.season).toBe(24 * H);
  });

  it("classifies fresh / stale (≤2×TTL, serve + revalidate) / expired / miss", () => {
    const now = 1_000_000_000_000;
    const ttl = TMDB_TTL.list;
    expect(cacheFreshness(null, ttl, now)).toBe("miss");
    expect(cacheFreshness(undefined, ttl, now)).toBe("miss");
    expect(cacheFreshness(now, ttl, now)).toBe("fresh");
    expect(cacheFreshness(now - ttl, ttl, now)).toBe("fresh");
    expect(cacheFreshness(now - ttl - 1, ttl, now)).toBe("stale");
    expect(cacheFreshness(new Date(now - 2 * ttl), ttl, now)).toBe("stale");
    expect(cacheFreshness(now - 2 * ttl - 1, ttl, now)).toBe("expired");
  });

  it("builds a deterministic key independent of param order and drops empty params", () => {
    const a = tmdbCacheKey("/discover/movie", { page: 1, language: "vi-VN", with_genres: "16,28", empty: "", undef: undefined });
    const b = tmdbCacheKey("/discover/movie", { with_genres: "16,28", language: "vi-VN", page: 1 });
    expect(a).toBe(b);
    expect(a).toBe("/discover/movie?language=vi-VN&page=1&with_genres=16,28");
    expect(tmdbCacheKey("/genre/movie/list", {})).toBe("/genre/movie/list");
    expect(tmdbCacheKey("/movie/1", { language: "en-US" })).not.toBe(tmdbCacheKey("/movie/1", { language: "vi-VN" }));
  });
});
