import { describe, expect, it } from "vitest";
import type { RawRelease } from "@/lib/sources/hash-source-interface";
import { buildReleaseList, capWithReserve, MAX_ROWS, PREF_RES_RESERVE } from "@/lib/sources/sources-build-release";

/** "Hiện bản 4K" SHOWS 2160p rows; the order and `best` stay score-based (fix round 1, P1-5 / D3). */
const GB = 1024 ** 3;
const H = (n: number) => n.toString(16).padStart(40, "0");
const raw = (n: number, title: string, sizeGb: number, seeders: number): RawRelease => ({ hash: H(n), title, sizeBytes: sizeGb * GB, seeders, tracker: "" });
const cachedEntry = (r: RawRelease) => ({ hash: r.hash, name: r.title, size: r.sizeBytes, files: [{ id: 0, name: r.title, size: r.sizeBytes }] });
const jobs = new Map();

const MP4_1080 = raw(1, "Movie.2021.1080p.BluRay.x264.AAC5.1-[YTS.MX].mp4", 2.7, 100);
const MKV_DDP_4K = raw(2, "Movie.2021.2160p.UHD.BluRay.x265.10bit.HDR.DDP5.1.Atmos-RARBG.mkv", 9.1, 300);
const MP4_4K_UNCACHED = raw(3, "Movie.2021.2160p.BluRay.x265.10bit.AAC5.1-[YTS.MX].mp4", 6.1, 500);

describe("4K semantics", () => {
  it("pref 1080p + show4k: a cached 1080p MP4 (direct) beats a cached 2160p MKV DDP (app) and stays best/.rec", () => {
    const cached = new Map([MP4_1080, MKV_DDP_4K].map((r) => [r.hash, cachedEntry(r)]));
    const { releases, best } = buildReleaseList({ raws: [MKV_DDP_4K, MP4_1080], cached, jobs, prefs: { quality: "1080p", preferSmall: false, show4k: true } });
    expect(best?.hash).toBe(MP4_1080.hash);
    expect(best?.recommended).toBe(true);
    expect(releases.map((r) => r.qualityLabel)).toEqual(["1080p", "2160p"]);
  });
  it("show4k off hides 2160p rows entirely; on shows them in score order", () => {
    const off = buildReleaseList({ raws: [MKV_DDP_4K, MP4_1080, MP4_4K_UNCACHED], cached: new Map(), jobs, prefs: { quality: "1080p", preferSmall: false, show4k: false } });
    expect(off.releases.every((r) => r.parsed.resolution !== "2160p")).toBe(true);
    const on = buildReleaseList({ raws: [MKV_DDP_4K, MP4_1080, MP4_4K_UNCACHED], cached: new Map(), jobs, prefs: { quality: "1080p", preferSmall: false, show4k: true } });
    expect(on.releases.some((r) => r.parsed.resolution === "2160p")).toBe(true);
    expect(on.releases.map((r) => r.score)).toEqual([...on.releases.map((r) => r.score)].sort((a, b) => b - a));
  });
  it("best is never an uncached row when a cached direct release exists (even a high-seed 2160p one)", () => {
    const cached = new Map([[MP4_1080.hash, cachedEntry(MP4_1080)]]);
    const { best } = buildReleaseList({ raws: [MP4_4K_UNCACHED, MP4_1080], cached, jobs, prefs: { quality: "2160p", preferSmall: false, show4k: true } });
    expect(best?.hash).toBe(MP4_1080.hash);
    expect(best?.cacheState).toBe("cached");
  });
  it("cap 30 after ranking keeps ≥ 8 rows of the preferred resolution when 2160p rows would crowd them out", () => {
    // 40 uncached 2160p rows with many seeders outrank 12 uncached 1080p rows with few seeders
    const raws: RawRelease[] = [];
    for (let i = 0; i < 40; i++) raws.push(raw(100 + i, `Movie.2021.2160p.WEB-DL.x265.AAC-G${i}.mkv`, 8, 250));
    for (let i = 0; i < 12; i++) raws.push(raw(200 + i, `Movie.2021.1080p.WEB-DL.x264.AAC-H${i}.mkv`, 3, 1));
    const { releases, ranked } = buildReleaseList({ raws, cached: new Map(), jobs, prefs: { quality: "1080p", preferSmall: false, show4k: true } });
    expect(ranked.length).toBe(52);
    expect(buildReleaseList({ raws, cached: new Map(), jobs, prefs: { quality: "1080p", preferSmall: false, show4k: false } }).ranked.length).toBe(52); // counts ignore the toggle
    expect(releases.length).toBe(MAX_ROWS);
    expect(releases.filter((r) => r.parsed.resolution === "1080p").length).toBeGreaterThanOrEqual(PREF_RES_RESERVE);
    expect(releases.map((r) => r.score)).toEqual([...releases.map((r) => r.score)].sort((a, b) => b - a)); // still ranked
    expect(releases[0].hash).toBe(ranked[0].hash);
  });
  it("show4k on with pref 1080p: ≥ 8 2160p rows survive the cap even when every 1080p row outscores them (the toggle always shows 4K)", () => {
    const raws: RawRelease[] = [];
    for (let i = 0; i < 40; i++) raws.push(raw(300 + i, `Movie.2021.1080p.WEB-DL.x264.AAC-H${i}.mp4`, 3, 250));
    for (let i = 0; i < 12; i++) raws.push(raw(400 + i, `Movie.2021.2160p.WEB-DL.x265.DDP5.1-G${i}.mkv`, 12, 1));
    const { releases, ranked } = buildReleaseList({ raws, cached: new Map(), jobs, prefs: { quality: "1080p", preferSmall: false, show4k: true } });
    expect(releases.length).toBe(MAX_ROWS);
    expect(releases.filter((r) => r.parsed.resolution === "2160p").length).toBe(PREF_RES_RESERVE);
    expect(releases[0].hash).toBe(ranked[0].hash);
    expect(releases.map((r) => r.score)).toEqual([...releases.map((r) => r.score)].sort((a, b) => b - a));
  });
  it("capWithReserve: no-op under the cap; reserve never exceeds the available rows of a resolution", () => {
    const { ranked } = buildReleaseList({ raws: [MKV_DDP_4K, MP4_1080, MP4_4K_UNCACHED], cached: new Map(), jobs, prefs: { quality: "1080p", preferSmall: false, show4k: true } });
    expect(capWithReserve(ranked, 30, ["1080p"])).toBe(ranked);
    expect(capWithReserve(ranked, 2, ["1080p"]).filter((r) => r.parsed.resolution === "1080p").length).toBe(1);
  });
});
