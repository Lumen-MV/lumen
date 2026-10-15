import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { preferredFields, preferredIsStale, primaryRelease, selectPreferredRelease } from "@/lib/sources/release-pref-select";
import { buildStreams } from "@/lib/stremio/stremio-stream-builder";
import type { Release, SourcesResponse } from "@/lib/sources/sources-types";

/** "Lần trước": pure selection (cached / uncached / missing, series group + quality fallback, never uncached) + the SQLite store CRUD + Stremio ordering. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-prefs-"));
process.env.DATA_DIR = tmp;
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "admin-pass-123";
process.env.APP_URL = "http://localhost:3000";

const H = (n: number) => n.toString(16).padStart(40, "0");
const parsed = (resolution: Release["parsed"]["resolution"], group: string, container: Release["parsed"]["container"] = "mp4"): Release["parsed"] => ({ resolution, codec: "x264", audio: ["AAC"], hdr: [], source: "WEB-DL", group, container, bad: false });
const rel = (n: number, o: { res?: Release["parsed"]["resolution"]; group?: string; cached?: boolean; playClass?: Release["playClass"]; score?: number; job?: Release["job"] } = {}): Release => ({
  hash: H(n),
  title: `Movie.2021.${o.res ?? "1080p"}.WEB-DL-${o.group ?? "GRP"}.mp4`,
  parsed: parsed(o.res ?? "1080p", o.group ?? "GRP"),
  qualityLabel: o.res ?? "1080p",
  formatLabel: "MP4 · H.264",
  sizeBytes: 2 * 1024 ** 3,
  sizeLabel: "2.0 GB",
  audioLabel: "AAC",
  seeders: 10,
  cacheState: o.cached === false ? "uncached" : "cached",
  playClass: o.playClass ?? "direct",
  playReason: "",
  score: o.score ?? 100,
  recommended: false,
  job: o.job,
});
const pref = (n: number, quality = "1080p", releaseGroup = "GRP") => ({ hash: H(n), quality, releaseGroup });

describe("selectPreferredRelease", () => {
  const best = rel(1, { group: "YTS" });
  const list = [best, rel(2, { res: "2160p", group: "RARBG", playClass: "app" }), rel(3, { group: "RARBG", cached: false }), rel(4, { res: "2160p", group: "FLUX" })];
  it("no pref → nothing", () => {
    expect(selectPreferredRelease(list, null, false)).toEqual({ release: null, applies: false, preferredHash: null });
  });
  it("cached pref in the list → that row (even when it is not the best / an app row)", () => {
    const sel = selectPreferredRelease(list, pref(2, "2160p", "RARBG"), false);
    expect(sel.applies).toBe(true);
    expect(sel.release?.hash).toBe(H(2));
    expect(sel.preferredHash).toBe(H(2));
  });
  it("uncached pref never applies (would start a cloud download silently) — hash kept for the picker tag", () => {
    const sel = selectPreferredRelease(list, pref(3, "1080p", "RARBG"), false);
    expect(sel).toEqual({ release: null, applies: false, preferredHash: H(3) });
  });
  it("pref missing from the current list → does not apply (movie: exact hash only)", () => {
    const sel = selectPreferredRelease(list, pref(99, "2160p", "FLUX"), false);
    expect(sel.applies).toBe(false);
    expect(sel.preferredHash).toBe(H(99));
  });
  it("series: exact hash gone → same group AND quality first, else same quality, never uncached", () => {
    const byGroup = selectPreferredRelease(list, pref(99, "2160p", "flux"), true);
    expect(byGroup.release?.hash).toBe(H(4));
    const byQuality = selectPreferredRelease(list, pref(99, "2160p", "NOPE"), true);
    expect(byQuality.release?.hash).toBe(H(2)); // first cached 2160p in rank order
    const uncachedOnly = selectPreferredRelease([rel(3, { group: "RARBG", cached: false })], pref(99, "1080p", "RARBG"), true);
    expect(uncachedOnly.applies).toBe(false);
    const noQuality = selectPreferredRelease(list, pref(99, "720p", "YTS"), true);
    expect(noQuality.applies).toBe(false);
  });
  it("series: an uncached exact row still falls back to the group / quality match", () => {
    const sel = selectPreferredRelease(list, pref(3, "1080p", "RARBG"), true);
    expect(sel.release?.hash).toBe(H(1)); // same quality (1080p), group RARBG only has the uncached row
    expect(sel.applies).toBe(true);
  });
});

describe("primaryRelease / preferredIsStale / preferredFields", () => {
  const best = rel(1);
  const other = rel(2, { res: "2160p" });
  const data = (extra: Partial<SourcesResponse>): SourcesResponse => ({ releases: [best, other, rel(3, { cached: false })], best, state: "ok", slots: { active: 0, limit: 3 }, ...extra });
  it("primary = applied pref row, else best", () => {
    expect(primaryRelease(data({ preferredHash: H(2), preferredApplies: true }))?.hash).toBe(H(2));
    expect(primaryRelease(data({ preferredHash: H(3), preferredApplies: false }))?.hash).toBe(H(1));
    expect(primaryRelease(data({}))?.hash).toBe(H(1));
    expect(primaryRelease(null)).toBeNull();
  });
  it("stale only when a stored pref neither applies nor is downloading", () => {
    expect(preferredIsStale(data({ preferredHash: H(3), preferredApplies: false }))).toBe(true);
    expect(preferredIsStale(data({ preferredHash: H(99), preferredApplies: false }))).toBe(true);
    expect(preferredIsStale(data({ preferredHash: H(2), preferredApplies: true }))).toBe(false);
    expect(preferredIsStale(data({ preferredHash: null }))).toBe(false);
    const downloading = data({ releases: [best, rel(3, { cached: false, job: { id: 1, hash: H(3), mediaKey: "movie:1", userId: 1, state: "downloading", progress: 40, fileName: "", title: "" } })], preferredHash: H(3), preferredApplies: false });
    expect(preferredIsStale(downloading)).toBe(false);
  });
  it("preferredFields mirrors the selection", () => {
    expect(preferredFields([best, other], pref(2, "2160p"), false)).toEqual({ preferredHash: H(2), preferredApplies: true });
    expect(preferredFields([best, other], null, false)).toEqual({ preferredHash: null, preferredApplies: false });
  });
});

describe("Stremio stream order", () => {
  const releases = [rel(1, { group: "YTS" }), rel(2, { res: "2160p", group: "RARBG" }), rel(3, { cached: false })];
  it("preferred cached row first with the ⭐ line; order untouched without a pref", () => {
    const base = { base: "https://x", token: "t", mediaKey: "movie:1", quality: "1080p" as const };
    const plain = buildStreams({ releases, ...base });
    expect(plain.map((s) => s.url?.includes(H(1)) || s.infoHash === H(3))).toEqual([true, false, true]);
    expect(plain.some((s) => s.title.includes("Lần trước"))).toBe(false);
    const withPref = buildStreams({ releases, ...base, preferredHash: H(2) });
    expect(withPref[0].url).toContain(H(2));
    expect(withPref[0].title).toContain("⭐ Lần trước");
    expect(withPref[1].title).not.toContain("Lần trước");
    expect(buildStreams({ releases, ...base, preferredHash: H(3) })[0].url).toContain(H(1)); // uncached pref ignored
  });
});

describe("release_prefs store (real SQLite)", () => {
  type Mods = { users: typeof import("@/lib/users/user-service"); store: typeof import("@/lib/sources/release-prefs-store"); db: typeof import("@/lib/db/sqlite-client") };
  let m: Mods;
  let userId: number;
  beforeAll(async () => {
    m = { users: await import("@/lib/users/user-service"), store: await import("@/lib/sources/release-prefs-store"), db: await import("@/lib/db/sqlite-client") };
    await m.users.seedAdminFromEnv();
    userId = m.users.findUserByUsername("owner")!.id;
  });
  afterAll(() => {
    m.db.closeDb();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  it("upsert stores the title-level key, label / quality / group / class; episode key recorded separately", () => {
    const row = m.store.upsertReleasePref(userId, { type: "tv", tmdbId: 66732, season: 4, episode: 1 }, rel(7, { res: "2160p", group: "FLUX", playClass: "maybe" }));
    expect(row.mediaKey).toBe("tv:66732");
    expect(row.episodeMediaKey).toBe("tv:66732:4:1");
    expect(row.hash).toBe(H(7));
    expect(row.quality).toBe("2160p");
    expect(row.releaseGroup).toBe("FLUX");
    expect(row.playClass).toBe("maybe");
    expect(row.label).toBe("2160p MP4 · 2.0 GB · FLUX");
    expect(m.store.getReleasePref(userId, "tv:66732")?.hash).toBe(H(7));
    expect(m.store.getReleasePref(userId, "tv:66732:4:1")).toBeNull();
  });
  it("upsert replaces the previous pick of the same title (one row per user × title)", () => {
    m.store.upsertReleasePref(userId, { type: "tv", tmdbId: 66732, season: 4, episode: 2 }, rel(8, { group: "YTS" }));
    const row = m.store.getReleasePref(userId, "tv:66732");
    expect(row?.hash).toBe(H(8));
    expect(row?.episodeMediaKey).toBe("tv:66732:4:2");
    expect(m.db.getDb().select().from(m.db.schema.releasePrefs).all().filter((r) => r.mediaKey === "tv:66732")).toHaveLength(1);
  });
  it("movie key stays as is; delete answers whether a row existed; another user sees nothing", () => {
    m.store.upsertReleasePref(userId, { type: "movie", tmdbId: 634649 }, rel(9));
    expect(m.store.getReleasePref(userId, "movie:634649")?.episodeMediaKey).toBeNull();
    expect(m.store.getReleasePref(userId + 1, "movie:634649")).toBeNull();
    expect(m.store.deleteReleasePref(userId, "movie:634649")).toBe(true);
    expect(m.store.deleteReleasePref(userId, "movie:634649")).toBe(false);
    expect(m.store.getReleasePref(userId, "movie:634649")).toBeNull();
  });
});
