import { describe, expect, it } from "vitest";
import { MATCH_CAM_PENALTY, MATCH_EXACT, MATCH_GROUP, MATCH_RESOLUTION, MATCH_SOURCE, releaseMatchScore, releaseTag } from "@/lib/subtitles/subtitle-release-match";
import { autoSelectTrack } from "@/lib/subtitles/subtitle-auto-select";
import { MAX_PER_LANG, MAX_PER_SLOT, rankTracks } from "@/lib/subtitles/subtitle-track-ranking";
import type { SubTrack } from "@/lib/subtitles/subtitle-types";

/** Subtitles are timed per release: the file for the torrent being played must outrank the most-downloaded one. */
const url = (id: number) => `/api/subs/${id}.vtt`;
const quota = { remaining: 19, resetAt: null };
const row = (id: number, lang: string, source: SubTrack["source"], label: string, downloads = 0, ready = true) => ({ id, lang, source, label, downloads, ready });
const PLAYING = { title: "Spider-Man.No.Way.Home.2021.1080p.WEB-DL.DDP5.1.Atmos.x264-CMRG", fileName: "Spider-Man.No.Way.Home.2021.1080p.WEB-DL.DDP5.1.Atmos.x264-CMRG.mkv" };

describe("releaseMatchScore", () => {
  it("same group → confident; same source family + resolution → partial; different source → nothing", () => {
    expect(releaseMatchScore("Spider-Man.No.Way.Home.2021.1080p.WEB-DL.DDP5.1.Atmos.x264-CMRG.vi.srt", PLAYING)).toBe(MATCH_EXACT + MATCH_GROUP + MATCH_SOURCE + MATCH_RESOLUTION);
    expect(releaseMatchScore("Spider-Man.No.Way.Home.2021.720p.WEB-DL.x264-CMRG", PLAYING)).toBe(MATCH_GROUP + MATCH_SOURCE);
    expect(releaseMatchScore("Spider-Man.No.Way.Home.2021.1080p.WEBRip.x264-RARBG", PLAYING)).toBe(MATCH_SOURCE + MATCH_RESOLUTION);
    expect(releaseMatchScore("Spider-Man.No.Way.Home.2021.1080p.BluRay.x264-SPARKS", PLAYING)).toBe(MATCH_RESOLUTION);
    expect(releaseMatchScore("Spider-Man No Way Home 2021 Vietnamese", PLAYING)).toBe(0);
    expect(releaseMatchScore("anything", null)).toBe(0);
  });
  it("CAM / TS subtitles sink below unknown ones for a proper release (real OpenSubtitles data: 23k-download CAMRip vi file)", () => {
    expect(releaseMatchScore("Spider-Man.No.Way.Home.2021.720p.CAMRip.HINDI.ENG.Vietsub.by.SonSubblow", PLAYING)).toBe(MATCH_CAM_PENALTY);
    expect(releaseMatchScore("Spider-Man: No way home 720p Cam Vietsub", PLAYING)).toBe(MATCH_CAM_PENALTY);
    expect(releaseMatchScore("Spider-Man.No.Way.Home.2021.720p.CAMRip.vi", { title: "Spider-Man.No.Way.Home.2021.720p.HDCAM.x264-XYZ" })).toBe(MATCH_SOURCE + MATCH_RESOLUTION);
    const ranked = rankTracks([row(1, "vi", "os", "Spider-Man.No.Way.Home.2021.720p.CAMRip.Vietsub", 22_894), row(2, "vi", "os", "Spider-Man: No Way Home (Tornad dịch)", 1_218)], quota, url, PLAYING);
    expect(ranked.map((t) => t.id)).toEqual([2, 1]);
  });
  it("BluRay / REMUX / BDRip count as one family; the language suffix never hides the group", () => {
    const bluray = { title: "Dune.Part.Two.2024.2160p.BluRay.REMUX.HEVC.DV-FGT" };
    expect(releaseMatchScore("Dune.Part.Two.2024.1080p.BDRip.x264-NTb.en", bluray)).toBe(MATCH_SOURCE);
    expect(releaseMatchScore("Dune.Part.Two.2024.2160p.BluRay.x265-FGT.vi", bluray)).toBe(MATCH_GROUP + MATCH_SOURCE + MATCH_RESOLUTION);
  });
  it("releaseTag is compact and falls back to the (trimmed) name", () => {
    expect(releaseTag("Spider-Man.No.Way.Home.2021.1080p.WEB-DL.DDP5.1.Atmos.x264-CMRG.vi.srt")).toBe("CMRG · WEB-DL · 1080p");
    expect(releaseTag("Spider-Man.No.Way.Home.2021.BluRay.vi")).toBe("BluRay");
    expect(releaseTag("Nguoi Nhen Khong Con Nha 2021 ban dep nhat tren mang.srt")).toBe("Nguoi Nhen Khong Con Nha 2021 ban d…");
  });
});

describe("rankTracks with the playing release", () => {
  const rows = [
    row(1, "vi", "os", "Spider-Man.No.Way.Home.2021.1080p.BluRay.x264-SPARKS.vi", 81_234),
    row(2, "vi", "os", "Spider-Man.No.Way.Home.2021.1080p.WEB-DL.DDP5.1.Atmos.x264-CMRG.vi", 2_500),
    row(3, "vi", "subdl", "Spider-Man.No.Way.Home.2021.1080p.WEBRip.x264-RARBG.vi"),
    row(4, "vi", "ai", "Tiếng Việt (Dịch AI)"),
    row(5, "en", "os", "Spider-Man.No.Way.Home.2021.1080p.BluRay.x264-SPARKS.en", 50_000),
    row(6, "en", "os", "Spider-Man.No.Way.Home.2021.1080p.WEB-DL.x264-CMRG.en", 900),
  ];
  it("matching file outranks the most downloaded one, same-source files stay listed with release tags, auto-select follows", () => {
    const tracks = rankTracks(rows, quota, url, PLAYING);
    expect(tracks.map((t) => t.id)).toEqual([2, 3, 1, 4, 6, 5]);
    expect(tracks[0]).toMatchObject({ label: "Tiếng Việt (OpenSubtitles)", release: "CMRG · WEB-DL · 1080p", matched: true });
    expect(tracks[1]).toMatchObject({ label: "Tiếng Việt (SubDL)", release: "RARBG · WEBRip · 1080p" });
    expect(tracks[1].matched).toBeUndefined();
    expect(tracks[2]).toMatchObject({ release: "SPARKS · BluRay · 1080p" });
    expect(tracks[3].release).toBeUndefined();
    expect(tracks[4]).toMatchObject({ id: 6, matched: true });
    expect(autoSelectTrack(tracks, null, "vi")).toBe(2);
    expect(autoSelectTrack(tracks, null, "en")).toBe(6);
  });
  it("without a playing release the old order holds (downloads), labels stay generic for a single source", () => {
    const tracks = rankTracks(rows.filter((r) => r.source !== "subdl"), quota, url, null);
    expect(tracks.map((t) => [t.id, t.label])).toEqual([[1, "Tiếng Việt (cộng đồng)"], [2, "Tiếng Việt (cộng đồng)"], [4, "Tiếng Việt (Dịch AI)"], [5, "English"], [6, "English"]]);
    expect(tracks.every((t) => t.matched === undefined)).toBe(true);
  });
  it("caps: MAX_PER_SLOT per (lang, source), MAX_PER_LANG human files per language, one AI / MT row", () => {
    const many = [
      ...Array.from({ length: 6 }, (_, i) => row(10 + i, "vi", "os", `Movie.2020.1080p.WEB-DL.x264-G${i}.vi`, 1000 - i)),
      ...Array.from({ length: 3 }, (_, i) => row(20 + i, "vi", "subdl", `Movie.2020.1080p.BluRay.x264-S${i}.vi`)),
      row(30, "vi", "os_mt", "Movie.2020.mt.vi"), row(31, "vi", "os_mt", "Movie.2020.mt2.vi"),
    ];
    const tracks = rankTracks(many, quota, url, { title: "Movie.2020.1080p.WEB-DL.x264-G3" });
    const vi = tracks.filter((t) => t.lang === "vi" && t.source !== "os_mt");
    expect(vi).toHaveLength(MAX_PER_LANG);
    expect(vi.filter((t) => t.source === "os")).toHaveLength(MAX_PER_SLOT);
    expect(vi[0]).toMatchObject({ id: 13, matched: true });
    expect(tracks.filter((t) => t.source === "os_mt")).toHaveLength(1);
  });
  it("embedded streams are always a match and carry no release tag", () => {
    const tracks = rankTracks([row(1, "vi", "os", "Movie.2020.1080p.BluRay.x264-X.vi", 500), row(2, "vi", "embedded", "Vietnamese")], quota, url, { title: "Movie.2020.1080p.WEB-DL.x264-Y" });
    expect(tracks.map((t) => t.id)).toEqual([2, 1]);
    expect(tracks[0]).toMatchObject({ matched: true });
    expect(tracks[0].release).toBeUndefined();
  });
});
