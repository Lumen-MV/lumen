import { describe, expect, it } from "vitest";
import { containerFromName, isSeasonPack, parseGroup, parseRelease } from "@/lib/sources/release-parser";
import { audioLabel, formatLabel, formatSize, parseSizeToBytes, shortContainer } from "@/lib/sources/release-labels";

/** 10 fixture names from the mockup rows + live Torrentio answers (tests/fixtures/torrentio-*.json). */
const YTS = "Spider-Man.No.Way.Home.2021.1080p.BluRay.x264.AAC5.1-[YTS.MX].mp4";
const YTS4K = "Spider-Man.No.Way.Home.2021.2160p.BluRay.x265.10bit.AAC5.1-[YTS.MX].mp4";
const GYPSY = "Spider.Man.No.Way.Home.2021.1080p.BluRay.x265.AAC5.1-GYPSY.mkv";
const GALAXY = "Spider-Man.No.Way.Home.2021.1080p.BluRay.DDP5.1.x265.10bit-GalaxyRG265.mkv";
const UH = "Spiderman No Way Home 2021 Bluray 1080p AV1 10bit HDR AC3 5.1-UH.mkv";
const NF_PACK = "Stranger.Things.S04.2160p.NF.WEB-DL.x265.10bit.HDR.DDP5.1.Atmos-SiC[rartv]";
const NF_EP = "Stranger.Things.S04E01.2160p.NF.WEB-DL.DDP5.1.Atmos.DV.HEVC-FLUX.mkv";
const REMUX = "Spider-Man No Way Home 2021 UHD BluRay 2160p TrueHD Atmos 7 1 DV HEVC REMUX-FraMeSToR";
const CAM = "Spider-Man.No.Way.Home.2021.HDCAM.x264-Will1869";
const QXR = "Spider-Man - No Way Home (2021) (2160p BluRay x265 HEVC 10bit HDR AAC 7.1 Tigole) [QxR]";

describe("parseRelease", () => {
  it("YTS 1080p → mp4 x264 AAC 5.1 BluRay group YTS", () => {
    const p = parseRelease(YTS);
    expect(p).toMatchObject({ resolution: "1080p", codec: "x264", audio: ["AAC", "5.1"], hdr: [], source: "BluRay", group: "YTS", container: "mp4", bad: false });
    expect(formatLabel(p, YTS)).toBe("MP4 · H.264");
    expect(audioLabel(p)).toBe("AAC 5.1");
  });
  it("YTS 2160p x265 → MP4 · x265", () => {
    const p = parseRelease(YTS4K);
    expect(p.resolution).toBe("2160p");
    expect(formatLabel(p, YTS4K)).toBe("MP4 · x265");
  });
  it("GYPSY mkv x265 AAC → MKV · x265, group GYPSY", () => {
    const p = parseRelease(GYPSY);
    expect(p).toMatchObject({ container: "mkv", codec: "x265", group: "GYPSY", audio: ["AAC", "5.1"] });
    expect(formatLabel(p, GYPSY)).toBe("MKV · x265");
  });
  it("GalaxyRG DDP 5.1 → audio DDP, group GalaxyRG265", () => {
    const p = parseRelease(GALAXY);
    expect(p.audio).toEqual(["DDP", "5.1"]);
    expect(p.group).toBe("GalaxyRG265");
    expect(audioLabel(p)).toBe("DDP 5.1");
  });
  it("UH AV1 HDR AC3 → codec av1, hdr HDR, label MKV · HDR", () => {
    const p = parseRelease(UH);
    expect(p).toMatchObject({ codec: "av1", hdr: ["HDR"], audio: ["AC3", "5.1"], group: "UH", container: "mkv" });
    expect(formatLabel(p, UH)).toBe("MKV · HDR");
  });
  it("NF season pack: WEB-DL, DDP Atmos, HDR, x265; detected as pack", () => {
    const p = parseRelease(NF_PACK);
    expect(p).toMatchObject({ source: "WEB-DL", codec: "x265", hdr: ["HDR"], audio: ["DDP", "5.1", "Atmos"], resolution: "2160p" });
    expect(isSeasonPack(NF_PACK)).toBe(true);
    expect(isSeasonPack(NF_EP)).toBe(false);
  });
  it("NF episode DV HEVC → hdr [DV], label MKV · HEVC, container from file name", () => {
    const p = parseRelease(NF_EP, NF_EP);
    expect(p.hdr).toEqual(["DV"]);
    expect(formatLabel(p, NF_EP)).toBe("MKV · HEVC");
    expect(p.group).toBe("FLUX");
  });
  it("REMUX TrueHD Atmos DV → source REMUX, audio TrueHD", () => {
    const p = parseRelease(REMUX);
    expect(p.source).toBe("REMUX");
    expect(p.audio).toEqual(["TrueHD", "7.1", "Atmos"]);
    expect(p.container).toBe("unknown");
  });
  it("HDCAM → bad", () => {
    expect(parseRelease(CAM).bad).toBe(true);
  });
  it("[QxR] bracket group + AAC 7.1", () => {
    const p = parseRelease(QXR);
    expect(p.group).toBe("QxR");
    expect(p.audio).toEqual(["AAC", "7.1"]);
  });
  it("file name hint decides the container over the release name", () => {
    expect(parseRelease("Some.Movie.2020.1080p.WEB-DL.x264-GRP", "Some.Movie.2020.1080p.WEB-DL.x264-GRP.mp4").container).toBe("mp4");
    expect(containerFromName("x.m4v")).toBe("mp4");
    expect(containerFromName(undefined)).toBe("unknown");
  });
  it("parseGroup ignores numeric suffixes", () => {
    expect(parseGroup("Movie.2020.1080p-1")).toBe("");
    expect(parseGroup("Movie.2020.1080p.x264-RARBG")).toBe("RARBG");
  });
});

describe("size labels", () => {
  it("parses Torrentio sizes and formats them back", () => {
    expect(parseSizeToBytes("💾 2.7 GB")).toBe(Math.round(2.7 * 1024 ** 3));
    expect(parseSizeToBytes("💾 850 MB")).toBe(850 * 1024 ** 2);
    expect(formatSize(2.7 * 1024 ** 3)).toBe("2.7 GB");
    expect(formatSize(850 * 1024 ** 2)).toBe("850 MB");
    expect(formatSize(0)).toBe("?");
  });
  it("shortContainer for the kv label", () => {
    expect(shortContainer(parseRelease(YTS))).toBe("MP4");
    expect(shortContainer(parseRelease(GALAXY))).toBe("MKV");
  });
});

describe("parser nits (fix round 1)", () => {
  it("Italian packs: Stagione / COMPLETA are season packs", () => {
    expect(isSeasonPack("Stranger Things - Stagione 04 (2022) 1080p H264 ITA ENG AC3 [COMPLETA] [Pir8]")).toBe(true);
    expect(isSeasonPack("Stranger Things - Stagione 4 - S04x01 ITA.mkv")).toBe(false);
  });
  it("a `-TS` / `-CAM` release group is not a telesync / cam tag; real TS / CAM tokens still are", () => {
    const grp = parseRelease("Movie.2021.1080p.WEB-DL.x265-TS.mkv");
    expect(grp.group).toBe("TS");
    expect(grp.bad).toBe(false);
    expect(parseRelease("Movie.2021.1080p.BluRay.x264-CAM.mkv").bad).toBe(false);
    expect(parseRelease("Movie.2021.1080p.HDTS.x264-GRP").bad).toBe(true);
    expect(parseRelease("Movie.2021.TS.x264-GRP").bad).toBe(true);
    expect(parseRelease("Movie.2021.HDCAM.x264-Will1869").bad).toBe(true);
  });
});
