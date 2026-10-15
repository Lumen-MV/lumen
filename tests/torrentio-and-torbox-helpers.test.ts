import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScenarioCookie, parseScenarioParams, SCENARIO_ENTRY_RE } from "@/lib/dev/scenario-flags-shared";
import { parseTorrentioStream, type TorrentioStream } from "@/lib/sources/torrentio-hash-source";
import { ytsTorrentToRelease } from "@/lib/sources/yts-hash-source";
import { buildMagnet, pickVideoFile } from "@/lib/torbox/torbox-pick-video-file";
import { bestSourceText, detailSourceState, factsText, primaryLabel } from "@/components/sources/detail-source-state";
import { shortFileName } from "@/components/sources/short-file-name";
import type { Release } from "@/lib/sources/sources-types";

const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8")) as T;
const movie = fixture<{ streams: TorrentioStream[] }>("torrentio-movie-tt10872600.json").streams;
const series = fixture<{ streams: TorrentioStream[] }>("torrentio-series-tt4574334-4-1.json").streams;

describe("parseTorrentioStream (recorded answers)", () => {
  it("movie: name line, 👤/💾/⚙️ stats, filename hint, sources", () => {
    const r = parseTorrentioStream(movie[1])!;
    expect(r.title).toMatch(/^Spiderman No Way Home 2021 Bluray 2160p AV1/);
    expect(r).toMatchObject({ seeders: 104, tracker: "1337x", pack: false });
    expect(r.sizeBytes).toBe(Math.round(6.19 * 1024 ** 3));
    expect(r.fileName).toMatch(/\.mkv$/);
    expect(r.hash).toMatch(/^[0-9a-f]{40}$/);
  });
  it("series pack: line 2 = in-pack file, pack:true, fileIdx kept", () => {
    const r = parseTorrentioStream(series[1])!;
    expect(r.title).toMatch(/^Stranger\.Things\.S04\./);
    expect(r.fileName).toMatch(/S04E01/);
    expect(r.pack).toBe(true);
    expect(r.fileIdx).toBe(8);
  });
  it("every recorded stream parses; junk is rejected", () => {
    expect(movie.map(parseTorrentioStream).filter(Boolean).length).toBe(movie.length);
    expect(parseTorrentioStream({ infoHash: "nope", title: "x" })).toBeNull();
    expect(parseTorrentioStream({ infoHash: "a".repeat(40), title: "" })).toBeNull();
  });
  it("YTS fallback synthesises a YTS-style MP4 name", () => {
    const r = ytsTorrentToRelease({ imdb_code: "tt1", title_long: "Movie (2020)" }, { hash: "B".repeat(40), quality: "1080p", size_bytes: 123, seeds: 9, video_codec: "x264", audio_channels: "5.1", type: "bluray" })!;
    expect(r.title).toBe("Movie.(2020).1080p.BluRay.x264.AAC5.1-[YTS.MX].mp4");
    expect(r.hash).toBe("b".repeat(40));
  });
});

describe("pickVideoFile / buildMagnet", () => {
  const files = [
    { id: 0, name: "pack/RARBG.txt", size: 31 },
    { id: 1, name: "pack/Show.S01E01.1080p.mkv", size: 2e9 },
    { id: 2, name: "pack/Show.S01E02.1080p.mkv", size: 3e9 },
    { id: 3, name: "pack/Sample/Show.S01E02.sample.mkv", size: 2e8 },
  ];
  it("episode match beats size; no match → null (never the largest file for an episode); samples ignored", () => {
    expect(pickVideoFile(files, 1, 1)?.id).toBe(1);
    expect(pickVideoFile(files, 1, 2)?.id).toBe(2);
    expect(pickVideoFile(files, 1, 9)).toBeNull();
    expect(pickVideoFile(files)?.id).toBe(2);
    expect(pickVideoFile([{ id: 0, name: "x.txt", size: 1e9 }])).toBeNull();
  });
  it("1x02 style names match too", () => {
    expect(pickVideoFile([{ id: 5, name: "Show - 1x02 - Title.mkv", size: 1e9 }], 1, 2)?.id).toBe(5);
  });
  it("magnet carries hash, name and trackers (Torrentio sources merged)", () => {
    const m = buildMagnet("ABC".padEnd(40, "0"), "My Movie", ["tracker:udp://t.example:1337/announce", "dht:xyz"]);
    expect(m.startsWith("magnet:?xt=urn:btih:abc")).toBe(true);
    expect(m).toContain("dn=My%20Movie");
    expect(m).toContain(encodeURIComponent("udp://t.example:1337/announce"));
    expect(m).not.toContain("dht");
  });
});

describe("scenario cookie with parameters", () => {
  it("cloud-sim=spec is a flag plus a param; unknown entries are ignored", () => {
    expect([...parseScenarioCookie("slow-net,cloud-sim=downloading:60:20,bogus")]).toEqual(["slow-net", "cloud-sim"]);
    expect(parseScenarioParams("cloud-sim=downloading:60:20").get("cloud-sim")).toBe("downloading:60:20");
    expect(SCENARIO_ENTRY_RE.test("cloud-sim=queued:10:10")).toBe(true);
    expect(SCENARIO_ENTRY_RE.test("cloud-sim=a,b")).toBe(false);
  });
});

describe("detail state table", () => {
  const rel = (over: Partial<Release>): Release => ({ hash: "h", title: "t", parsed: { resolution: "1080p", codec: "x264", audio: ["AAC"], hdr: [], source: "BluRay", group: "YTS", container: "mp4", bad: false }, qualityLabel: "1080p", formatLabel: "MP4 · H.264", sizeBytes: 1, sizeLabel: "2.7 GB", audioLabel: "AAC 5.1", seeders: 1, cacheState: "cached", playClass: "direct", playReason: "", score: 1, recommended: true, ...over });
  const resp = (best: Release | null) => ({ releases: best ? [best] : [], best, state: "ok" as const, slots: { active: 0, limit: 6 } });
  it("loading / direct / app / uncached / none", () => {
    expect(detailSourceState("loading", null)).toBe("loading");
    expect(primaryLabel("loading", null)).toBe("⟳ Đang tìm nguồn…");
    expect(bestSourceText("loading", null)).toBe("…");
    const direct = rel({});
    expect(detailSourceState("ready", resp(direct))).toBe("direct");
    expect(primaryLabel("direct", direct)).toBe("▶ Phát · 1080p");
    expect(bestSourceText("direct", direct)).toBe("1080p MP4 · 2.7 GB · YTS");
    expect(factsText("direct", direct)).toEqual({ text: "Đã cache · Phát trực tiếp", tone: "green" });
    const app = rel({ playClass: "app", playReason: "MKV DTS", parsed: { ...direct.parsed, container: "mkv", group: "GalaxyRG" }, sizeLabel: "2.5 GB" });
    expect(detailSourceState("ready", resp(app))).toBe("app");
    expect(primaryLabel("app", app)).toBe("📺 Xem bằng app · 1080p");
    expect(bestSourceText("app", app)).toBe("1080p MKV · 2.5 GB · GalaxyRG (cần app)");
    expect(factsText("app", app).text).toBe("Đã cache · Cần app (MKV DTS)");
    const un = rel({ cacheState: "uncached", recommended: false });
    expect(detailSourceState("ready", resp(un))).toBe("uncached");
    expect(primaryLabel("uncached", un)).toBe("⬇ Tải lên cloud · 1080p");
    expect(bestSourceText("uncached", un)).toBe("1080p MP4 · 2.7 GB · YTS (chưa cache)");
    expect(detailSourceState("ready", resp(null))).toBe("none");
    expect(primaryLabel("none", null)).toBe("Không có nguồn");
    expect(bestSourceText("none", null)).toBe("—");
    // TorBox outage: neutral hero, primary opens the picker, no cache marker
    expect(detailSourceState("ready", { ...resp(direct), state: "torbox-down" })).toBe("down");
    expect(primaryLabel("down", direct)).toBe("▶ Chọn bản phát");
    expect(factsText("down", direct)).toEqual({ text: "Không kết nối được Torbox · chưa rõ trạng thái cache", tone: "grey" });
    expect(bestSourceText("down", direct)).toBe("1080p MP4 · 2.7 GB · YTS (chưa kiểm tra)");
  });
  it("shortFileName keeps head + tail", () => {
    expect(shortFileName("Spider-Man.No.Way.Home.2021.1080p.BluRay.x264.AAC5.1-[YTS.MX].mp4")).toMatch(/^Spider-Man\.No\..*….*YTS\.MX\]\.mp4$/);
    expect(shortFileName("short.mp4")).toBe("short.mp4");
  });
});
