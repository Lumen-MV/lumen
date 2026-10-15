import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Release } from "@/lib/sources/sources-types";

/** Device-token signing / rotation / revocation on a real SQLite + the pure Stremio builders (manifest, ids, streams, subtitles). */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-p6a-"));
process.env.DATA_DIR = tmp;
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "admin-pass-123";
process.env.APP_URL = "https://phim.example.com";

type Mods = { users: typeof import("@/lib/users/user-service"); device: typeof import("@/lib/auth/device-token"); db: typeof import("@/lib/db/sqlite-client") };
let m: Mods;
let adminId = 0;

beforeAll(async () => {
  m = { users: await import("@/lib/users/user-service"), device: await import("@/lib/auth/device-token"), db: await import("@/lib/db/sqlite-client") };
  await m.users.seedAdminFromEnv();
  adminId = m.users.findUserByUsername("owner")!.id;
});
afterAll(() => {
  m.db.closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("device tokens", () => {
  it("issues once, masks the URL, resolves the user, rotates and revokes", () => {
    const first = m.device.describeDeviceToken(adminId);
    expect(first.revoked).toBe(false);
    expect(first.url).toMatch(/^https:\/\/phim\.example\.com\/stremio\/[A-Za-z0-9_-]{32}\/manifest\.json$/);
    expect(first.masked).toMatch(/^https:\/\/phim\.example\.com\/stremio\/[A-Za-z0-9_-]{4}…[A-Za-z0-9_-]{2}\/manifest\.json$/);
    expect(m.device.describeDeviceToken(adminId).token).toBe(first.token);
    expect(m.device.ensureDeviceToken(adminId).token).toBe(first.token);
    const resolved = m.device.resolveDeviceToken(first.token!);
    expect(resolved?.user.id).toBe(adminId);
    expect(m.device.resolveDeviceToken("junk")).toBeNull();
    expect(m.device.resolveDeviceToken("x".repeat(32))).toBeNull();

    const rotated = m.device.rotateDeviceToken(adminId);
    expect(rotated.token).not.toBe(first.token);
    expect(m.device.resolveDeviceToken(first.token!)).toBeNull();
    expect(m.device.resolveDeviceToken(rotated.token!)?.user.id).toBe(adminId);

    expect(m.device.revokeDeviceTokens(adminId)).toBe(1);
    const revoked = m.device.describeDeviceToken(adminId);
    expect(revoked).toMatchObject({ revoked: true, url: null, masked: null, token: null });
    expect(m.device.resolveDeviceToken(rotated.token!)).toBeNull();
    // "Tạo link mới" after revoke
    expect(m.device.rotateDeviceToken(adminId).revoked).toBe(false);
  });

  it("a disabled user's token stops resolving", async () => {
    const u = await m.users.createUser({ username: "tv_user", displayName: "TV", password: "TvPass1234", disabled: true });
    const t = m.device.ensureDeviceToken(u.id).token;
    expect(m.device.resolveDeviceToken(t)).toBeNull();
  });
});

describe("stremio builders (pure)", async () => {
  const { buildManifest, CATALOG_IDS, isCatalogId } = await import("@/lib/stremio/stremio-manifest");
  const { parseStremioId, stremioIdFor, splitCatalogPath, mediaKeyStringOfParsed } = await import("@/lib/stremio/stremio-ids");
  const { buildStreams, playUrl } = await import("@/lib/stremio/stremio-stream-builder");
  const { buildSubtitles } = await import("@/lib/stremio/stremio-subtitles-builder");

  it("manifest has the resources, catalogs and id prefixes Stremio expects", () => {
    const mf = buildManifest({ appUrl: "https://phim.example.com", version: "1.0", tokenPrefix: "abc123" });
    expect(mf.id).toBe("vn.lumen.abc123");
    expect(mf.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(mf.types).toEqual(["movie", "series"]);
    expect(mf.resources).toContain("catalog");
    expect(mf.resources).toContain("meta");
    expect(mf.resources).toContainEqual({ name: "stream", types: ["movie", "series"], idPrefixes: ["lumen:", "tt"] });
    expect(mf.catalogs.map((c) => `${c.type}/${c.id}`)).toEqual(["movie/lumen-trending-movie", "series/lumen-trending-series", "series/lumen-anime", "movie/lumen-my-list", "series/lumen-my-list"]);
    expect(mf.catalogs.every((c) => c.name.length > 0)).toBe(true);
    expect(isCatalogId(CATALOG_IDS.anime)).toBe(true);
    expect(isCatalogId("nope")).toBe(false);
  });

  it("ids round-trip and IMDb ids are accepted", () => {
    expect(stremioIdFor("movie", 634649)).toBe("lumen:tmdbm634649");
    expect(stremioIdFor("tv", 66732, 4, 1)).toBe("lumen:tmdbt66732:4:1");
    expect(parseStremioId("lumen:tmdbt66732:4:1.json")).toEqual({ kind: "tmdb", type: "tv", tmdbId: 66732, season: 4, episode: 1 });
    expect(parseStremioId("lumen%3Atmdbm634649.json")).toEqual({ kind: "tmdb", type: "movie", tmdbId: 634649 });
    expect(parseStremioId("tt10872600.json")).toEqual({ kind: "imdb", imdbId: "tt10872600" });
    expect(parseStremioId("tt4574334:4:1.json")).toEqual({ kind: "imdb", imdbId: "tt4574334", season: 4, episode: 1 });
    expect(parseStremioId("evil:1")).toBeNull();
    expect(mediaKeyStringOfParsed({ kind: "tmdb", type: "tv", tmdbId: 66732, season: 4, episode: 1 })).toBe("tv:66732:4:1");
    expect(splitCatalogPath(["lumen-anime", "skip=20.json"])).toEqual({ id: "lumen-anime", extra: { skip: "20" } });
    expect(splitCatalogPath(["lumen-anime.json"])).toEqual({ id: "lumen-anime", extra: {} });
  });

  const rel = (hash: string, cacheState: "cached" | "uncached", playClass: "direct" | "maybe" | "app", quality = "1080p"): Release =>
    ({ hash, title: `Movie.${quality}.${hash.slice(0, 4)}`, parsed: { resolution: quality as Release["parsed"]["resolution"], codec: "x264", audio: ["AAC"], hdr: [], source: "WEB-DL", group: "YTS", container: "mp4", bad: false }, qualityLabel: quality, formatLabel: "MP4 · H.264", sizeBytes: 2e9, sizeLabel: "1.9 GB", audioLabel: "AAC", seeders: 100, cacheState, playClass, playReason: "", score: 1, recommended: false }) as Release;

  it("streams: top 5 cached → play URL + notWebReady for non-direct, uncached → infoHash fallback", () => {
    const releases = [rel("a".repeat(40), "cached", "direct"), rel("b".repeat(40), "cached", "app"), ...[2, 3, 4, 5, 6].map((i) => rel(String(i).repeat(40), "cached", "direct")), rel("c".repeat(40), "uncached", "direct")];
    const streams = buildStreams({ releases, base: "https://phim.example.com", token: "tok", mediaKey: "movie:1" });
    expect(streams.filter((s) => s.url)).toHaveLength(5);
    expect(streams[0].url).toBe(playUrl("https://phim.example.com", "tok", "movie:1", "a".repeat(40)));
    expect(streams[0].behaviorHints?.notWebReady).toBe(false);
    expect(streams[1].behaviorHints?.notWebReady).toBe(true);
    expect(streams[0].name).toContain("1080p");
    const fallback = streams.find((s) => s.infoHash);
    expect(fallback?.infoHash).toBe("c".repeat(40));
    expect(fallback?.url).toBeUndefined();
  });

  it("subtitles: vi before en, human before AI, embedded skipped, VTT URLs under the token", () => {
    const subs = buildSubtitles(
      [
        { id: 3, lang: "en", source: "os", label: "en", ready: true },
        { id: 2, lang: "vi", source: "ai", label: "ai", ready: true },
        { id: 1, lang: "vi", source: "subdl", label: "vi", ready: false },
        { id: 9, lang: "vi", source: "embedded", label: "emb", ready: false },
      ],
      "https://phim.example.com",
      "tok",
    );
    expect(subs.map((s) => s.id)).toEqual(["lumen-1", "lumen-2", "lumen-3"]);
    expect(subs[0]).toEqual({ id: "lumen-1", lang: "vie", url: "https://phim.example.com/stremio/tok/subs/1.vtt" });
    expect(subs[1].lang).toMatch(/^vie/);
    expect(subs[2].lang).toBe("eng");
  });
});
