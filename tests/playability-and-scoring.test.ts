import { describe, expect, it } from "vitest";
import { classifyPlayability } from "@/lib/sources/playability-classifier";
import { parseRelease } from "@/lib/sources/release-parser";
import { scoreRelease, sortReleases } from "@/lib/sources/release-scorer";
import { buildReleaseList } from "@/lib/sources/sources-build-release";
import type { RawRelease } from "@/lib/sources/hash-source-interface";

const GB = 1024 ** 3;
const raw = (hash: string, title: string, sizeGb: number, seeders: number, extra: Partial<RawRelease> = {}): RawRelease => ({ hash, title, sizeBytes: sizeGb * GB, seeders, tracker: "", ...extra });
const H = (n: number) => n.toString(16).padStart(40, "0");

const YTS = raw(H(1), "Spider-Man.No.Way.Home.2021.1080p.BluRay.x264.AAC5.1-[YTS.MX].mp4", 2.7, 100);
const GYPSY = raw(H(2), "Spider.Man.No.Way.Home.2021.1080p.BluRay.x265.AAC5.1-GYPSY.mkv", 1.7, 41);
const GALAXY = raw(H(3), "Spider-Man.No.Way.Home.2021.1080p.BluRay.DDP5.1.x265.10bit-GalaxyRG265.mkv", 2.5, 60);
const UH = raw(H(4), "Spiderman No Way Home 2021 Bluray 1080p AV1 10bit HDR AC3 5.1-UH.mkv", 3.5, 272);
const YTS4K = raw(H(5), "Spider-Man.No.Way.Home.2021.2160p.BluRay.x265.10bit.AAC5.1-[YTS.MX].mp4", 6.1, 54);
const CAM = raw(H(6), "Spider-Man.No.Way.Home.2021.HDCAM.x264-Will1869", 1.2, 500);
const prefs = { quality: "1080p" as const, preferSmall: false, show4k: false };
const cachedEntry = (r: RawRelease) => ({ hash: r.hash, name: r.title, size: r.sizeBytes, files: [{ id: 0, name: r.title, size: r.sizeBytes }] });

describe("classifyPlayability", () => {
  it("MP4 + AAC → direct", () => expect(classifyPlayability(parseRelease(YTS.title))).toEqual({ playClass: "direct", playReason: "" }));
  it("MKV x265 AAC → maybe (Chrome / Android)", () => expect(classifyPlayability(parseRelease(GYPSY.title)).playClass).toBe("maybe"));
  it("MKV DDP → app with reason 'MKV DDP'", () => expect(classifyPlayability(parseRelease(GALAXY.title))).toEqual({ playClass: "app", playReason: "MKV DDP" }));
  it("AV1 + AC3 → app with both reasons", () => expect(classifyPlayability(parseRelease(UH.title)).playReason).toBe("MKV AV1 AC3"));
  it("DTS → app 'MKV DTS' (mockup app-only facts)", () => expect(classifyPlayability(parseRelease("Movie.2020.1080p.BluRay.DTS.x264-GRP.mkv")).playReason).toBe("MKV DTS"));
  it("REMUX / unknown container → app", () => {
    expect(classifyPlayability(parseRelease("Movie 2020 UHD BluRay 2160p TrueHD Atmos 7 1 DV HEVC REMUX-FraMeSToR")).playClass).toBe("app");
    expect(classifyPlayability(parseRelease("Movie.2020.1080p.WEBRip")).playClass).toBe("app");
  });
});

describe("scoreRelease / sortReleases", () => {
  const sc = (r: RawRelease, cached: boolean) => {
    const parsed = parseRelease(r.title);
    const { playClass } = classifyPlayability(parsed);
    return scoreRelease({ parsed, cacheState: cached ? "cached" : "uncached", playClass, sizeBytes: r.sizeBytes, seeders: r.seeders }, prefs);
  };
  it("cached direct YTS 1080p ranks first with pref 1080p", () => {
    const scores = { yts: sc(YTS, true), gypsy: sc(GYPSY, true), galaxy: sc(GALAXY, true), uh: sc(UH, false) };
    expect(scores.yts).toBeGreaterThan(scores.gypsy);
    expect(scores.gypsy).toBeGreaterThan(scores.galaxy);
    expect(scores.galaxy).toBeGreaterThan(scores.uh);
    expect(scores.yts).toBe(50 + 40 + 20 + 10); // cached + direct + pref res + min(100,50)/5
  });
  it("CAM is penalised below everything, > 40 GB loses 15, DV without HDR10 loses 10", () => {
    expect(sc(CAM, true)).toBeLessThan(sc(UH, false));
    const big = raw(H(7), "Movie.2020.1080p.BluRay.x264.AAC-GRP.mp4", 45, 10);
    const small = raw(H(8), "Movie.2020.1080p.BluRay.x264.AAC-GRP.mp4", 4, 10);
    expect(sc(small, false) - sc(big, false)).toBe(15);
    const dv = raw(H(9), "Movie.2020.1080p.WEB-DL.DV.x265.AAC-GRP.mkv", 4, 10);
    const dvHdr = raw(H(10), "Movie.2020.1080p.WEB-DL.DV.HDR10.x265.AAC-GRP.mkv", 4, 10);
    expect(sc(dvHdr, false) - sc(dv, false)).toBe(10);
  });
  it("prefer_small adds 10 for 1080p between 1.5 and 6 GB", () => {
    const parsed = parseRelease(YTS.title);
    const base = { parsed, cacheState: "cached" as const, playClass: "direct" as const, sizeBytes: YTS.sizeBytes, seeders: 0 };
    expect(scoreRelease(base, { ...prefs, preferSmall: true }) - scoreRelease(base, prefs)).toBe(10);
  });
  it("sort keys: size and seeders fall back to score on ties", () => {
    const list = [
      { score: 1, sizeBytes: 5, seeders: 10 },
      { score: 9, sizeBytes: 5, seeders: 50 },
      { score: 5, sizeBytes: 9, seeders: 10 },
    ];
    expect(sortReleases(list, "size").map((x) => x.score)).toEqual([5, 9, 1]);
    expect(sortReleases(list, "seeders").map((x) => x.score)).toEqual([9, 5, 1]);
    expect(sortReleases(list, "recommended").map((x) => x.score)).toEqual([9, 5, 1]);
  });
});

describe("buildReleaseList", () => {
  const jobs = new Map();
  it("mockup picker order: YTS (rec) > GYPSY > GalaxyRG > UH; 4K hidden; CAM dropped", () => {
    const cached = new Map([YTS, GYPSY, GALAXY].map((r) => [r.hash, cachedEntry(r)]));
    const { releases, best } = buildReleaseList({ raws: [UH, CAM, YTS4K, GALAXY, GYPSY, YTS], cached, jobs, prefs });
    expect(releases.map((r) => r.parsed.group)).toEqual(["YTS", "GYPSY", "GalaxyRG265", "UH"]);
    expect(best?.hash).toBe(YTS.hash);
    expect(best?.recommended).toBe(true);
    expect(releases[3]).toMatchObject({ cacheState: "uncached", playClass: "app", formatLabel: "MKV · HDR" });
  });
  it("show4k puts the 2160p YTS first (cached + direct + pref 2160p)", () => {
    const cached = new Map([YTS, YTS4K].map((r) => [r.hash, cachedEntry(r)]));
    const { releases } = buildReleaseList({ raws: [YTS, YTS4K], cached, jobs, prefs: { ...prefs, show4k: true, quality: "2160p" } });
    expect(releases[0].qualityLabel).toBe("2160p");
  });
  it("all uncached → best is not recommended (no .rec row) and stays uncached", () => {
    const { releases, best } = buildReleaseList({ raws: [YTS, GYPSY], cached: new Map(), jobs, prefs });
    expect(best?.recommended).toBe(false);
    expect(releases.every((r) => r.cacheState === "uncached")).toBe(true);
  });
  it("season pack: file name from the cached file list (S04E01) and pack label data", () => {
    const pack = raw(H(11), "Stranger.Things.S04.1080p.NF.WEB-DL.DDP5.1.x265-GRP", 18, 210, { fileIdx: 0, pack: true });
    const files = [1, 2, 3].map((e) => ({ id: e, name: `Stranger.Things.S04E0${e}.1080p.NF.WEB-DL.DDP5.1.x265-GRP.mkv`, size: 6 * GB }));
    const cached = new Map([[pack.hash, { hash: pack.hash, files }]]);
    const { releases } = buildReleaseList({ raws: [pack], cached, jobs, prefs, season: 4, episode: 2, seasonEpisodeCount: 9 });
    expect(releases[0].fileName).toBe("Stranger.Things.S04E02.1080p.NF.WEB-DL.DDP5.1.x265-GRP.mkv");
    expect(releases[0].pack).toMatchObject({ season: 4, episodes: 9, sizeIsFile: false });
    expect(releases[0].sizeBytes).toBe(18 * GB); // whole pack = sum of the known files
  });
  it("a ready job makes the row cached; an active job rides on the row", () => {
    const job = { id: 1, hash: YTS.hash, mediaKey: "movie:1", userId: 1, state: "downloading" as const, progress: 73, fileName: "x", title: "t" };
    const { releases } = buildReleaseList({ raws: [YTS], cached: new Map(), jobs: new Map([[YTS.hash, job]]), prefs });
    expect(releases[0].job?.progress).toBe(73);
    const ready = buildReleaseList({ raws: [YTS], cached: new Map(), jobs: new Map([[YTS.hash, { ...job, state: "ready" as const, progress: 100 }]]), prefs });
    expect(ready.releases[0].cacheState).toBe("cached");
    expect(ready.releases[0].job).toBeUndefined();
  });
});
