import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { activeCueTexts, clampOffset, formatOffsetSeconds, shiftCues } from "@/lib/subtitles/cue-offset";
import { parseResetTime } from "@/lib/subtitles/os-quota-store";
import { resetHours } from "@/lib/subtitles/quota-format";
import { pickZipEntry } from "@/lib/subtitles/subdl-client";
import { autoSelectTrack, canOfferAiTranslate, nextCycleTrack, shouldAutoTranslate } from "@/lib/subtitles/subtitle-auto-select";
import { formatDownloads, rankTracks, sourceLineFor } from "@/lib/subtitles/subtitle-track-ranking";
import type { SubTrack } from "@/lib/subtitles/subtitle-types";
import { unzip } from "@/lib/subtitles/zip-extract";
import { costVnd, estimateUsageFromChars } from "@/lib/translate/translate-cost";

/** Pure Phase 5 logic: ranking + labels + 🔒, auto-select / C cycling, offset math, zip reader + pack picking, quota reset parsing, cost. */
const url = (id: number) => `/api/subs/${id}.vtt`;
const row = (id: number, lang: string, source: SubTrack["source"], label: string, downloads = 0, ready = true) => ({ id, lang, source, label, downloads, ready });

describe("rankTracks", () => {
  it("orders vi human → vi AI → en → other, several files per (lang, source) with release tags, generic labels, duplicates by name collapsed", () => {
    const tracks = rankTracks([row(5, "en", "os", "Movie.2021.WEB", 2000), row(3, "vi", "ai", "ai"), row(1, "vi", "os", "Movie.2021.WEB.vi", 81_234), row(2, "vi", "os", "Movie.2021.BluRay.vi", 500), row(4, "vi", "subdl", "movie 2021 web vi"), row(6, "fr", "os", "fr")], { remaining: 19, resetAt: null }, url);
    expect(tracks.map((t) => [t.id, t.label])).toEqual([[1, "Tiếng Việt (cộng đồng)"], [2, "Tiếng Việt (cộng đồng)"], [3, "Tiếng Việt (Dịch AI)"], [5, "English"], [6, "Phụ đề (fr)"]]);
    expect(tracks.map((t) => t.release)).toEqual(["WEB", "BluRay", undefined, "WEB", "fr"]);
    expect(tracks[0]).toMatchObject({ ai: false, downloads: 81_234, vttUrl: "/api/subs/1.vtt" });
    expect(tracks[0].locked).toBeUndefined();
  });
  it("quota 0 → undownloaded OS rows locked 🔒 + source-specific labels, SubDL stays usable (mockup popover-quota)", () => {
    const tracks = rankTracks([row(1, "vi", "os", "a.vi", 60_000, false), row(2, "vi", "subdl", "b.vi"), row(3, "en", "subdl", "b.en"), row(4, "vi", "os", "cached.vi", 10, true)], { remaining: 0, resetAt: Date.now() + 3_600_000 }, url);
    // the already-cached OS file is listed too (it stays playable while the quota is out)
    expect(tracks.map((t) => [t.label, t.locked ?? false])).toEqual([["Tiếng Việt (OpenSubtitles)", true], ["Tiếng Việt (OpenSubtitles)", false], ["Tiếng Việt (SubDL)", false], ["English (SubDL)", false]]);
  });
  it("source line + download formatting", () => {
    expect(sourceLineFor({ id: 1, lang: "vi", label: "", source: "os", ai: false, downloads: 81_234, vttUrl: "" })).toBe("Phụ đề: OpenSubtitles · 81k lượt tải");
    expect(sourceLineFor({ id: 1, lang: "vi", label: "", source: "ai", ai: true, vttUrl: "" })).toBe("Phụ đề: Dịch AI (DeepSeek)");
    expect([formatDownloads(530), formatDownloads(1234), formatDownloads(81_234)]).toEqual(["530", "1.2k", "81k"]);
  });
});

const T = (id: number, lang: string, ai = false, locked?: boolean): SubTrack => ({ id, lang, label: "", source: ai ? "ai" : "os", ai, locked, vttUrl: url(id) });
/** OpenSubtitles machine-translated vi */
const MT = (id: number): SubTrack => ({ id, lang: "vi", label: "", source: "os_mt", ai: false, vttUrl: url(id) });
describe("autoSelectTrack / nextCycleTrack", () => {
  const tracks = [T(1, "vi"), T(2, "vi", true), T(3, "en")];
  it("last used → sub_lang vi: human vi → AI vi → Tắt (never English, mockup popover-none); en: en → vi; explicit off (0) wins; locked never picked", () => {
    expect(autoSelectTrack(tracks, 3, "vi")).toBe(3);
    expect(autoSelectTrack(tracks, null, "vi")).toBe(1);
    expect(autoSelectTrack([T(2, "vi", true), T(3, "en")], null, "vi")).toBe(2);
    expect(autoSelectTrack([T(3, "en")], null, "vi")).toBeNull();
    expect(autoSelectTrack(tracks, 0, "vi")).toBeNull();
    expect(autoSelectTrack(tracks, null, "off")).toBeNull();
    expect(autoSelectTrack(tracks, null, "en")).toBe(3);
    expect(autoSelectTrack([T(1, "vi")], null, "en")).toBe(1);
    expect(autoSelectTrack([T(1, "vi", false, true), T(3, "en")], 1, "vi")).toBeNull();
  });
  it("OS machine-translated vi: ranked after AI vi, labelled 'dịch máy', auto-picked only when nothing else Vietnamese exists, ＋ AI row still offered", () => {
    const ranked = rankTracks([row(9, "vi", "os_mt", "mt.vi", 5000), row(3, "vi", "ai", "ai"), row(1, "vi", "os", "human.vi", 100), row(5, "en", "os", "en")], { remaining: 19, resetAt: null }, url);
    expect(ranked.map((t) => [t.id, t.label])).toEqual([[1, "Tiếng Việt (OpenSubtitles)"], [3, "Tiếng Việt (Dịch AI)"], [9, "Tiếng Việt (dịch máy)"], [5, "English (OpenSubtitles)"]]);
    expect(autoSelectTrack(ranked, null, "vi")).toBe(1);
    expect(autoSelectTrack([MT(9), T(3, "en")], null, "vi")).toBe(9);
    expect(autoSelectTrack([MT(9), T(2, "vi", true), T(3, "en")], null, "vi")).toBe(2);
    expect(nextCycleTrack([MT(9), T(2, "vi", true), T(3, "en")], 2)).toBe(9);
    expect(canOfferAiTranslate([MT(9), T(3, "en")])).toBe(true);
    expect(canOfferAiTranslate([T(1, "vi"), T(3, "en")])).toBe(false);
    expect(canOfferAiTranslate([T(1, "vi", false, true), T(3, "en")])).toBe(true);
    expect(sourceLineFor(ranked[2])).toBe("Phụ đề: OpenSubtitles · 5k lượt tải");
  });
  it("shouldAutoTranslate: pref on + NO vi at all (a locked quota vi shows the quota state instead of paying) + en exists + no job", () => {
    expect(shouldAutoTranslate({ autoTranslate: true, tracks: [T(3, "en")], jobState: "idle" })).toBe(true);
    expect(shouldAutoTranslate({ autoTranslate: true, tracks: [T(1, "vi", false, true), T(3, "en")], jobState: "idle" })).toBe(false);
    expect(shouldAutoTranslate({ autoTranslate: true, tracks: [MT(4), T(3, "en")], jobState: "idle" })).toBe(false);
    expect(shouldAutoTranslate({ autoTranslate: false, tracks: [T(3, "en")], jobState: "idle" })).toBe(false);
    expect(shouldAutoTranslate({ autoTranslate: true, tracks, jobState: "idle" })).toBe(false);
    expect(shouldAutoTranslate({ autoTranslate: true, tracks: [T(3, "en")], jobState: "error" })).toBe(false);
    expect(shouldAutoTranslate({ autoTranslate: true, tracks: [], jobState: "idle" })).toBe(false);
  });
  it("C cycles Tắt → vi → vi AI → en → Tắt, skipping locked", () => {
    expect(nextCycleTrack(tracks, null)).toBe(1);
    expect(nextCycleTrack(tracks, 1)).toBe(2);
    expect(nextCycleTrack(tracks, 3)).toBeNull();
    expect(nextCycleTrack([T(1, "vi", false, true), T(3, "en")], null)).toBe(3);
    expect(nextCycleTrack([], null)).toBeNull();
  });
});

describe("offset math", () => {
  const cues = [{ start: 1000, end: 3000, text: "a" }, { start: 2500, end: 4000, text: "b" }, { start: 5000, end: 6000, text: "c" }];
  it("activeCueTexts honours a positive offset (cue appears later) and overlaps", () => {
    expect(activeCueTexts(cues, 1500, 0)).toEqual(["a"]);
    expect(activeCueTexts(cues, 2700, 0)).toEqual(["a", "b"]);
    expect(activeCueTexts(cues, 1500, 1000)).toEqual([]);
    expect(activeCueTexts(cues, 5200, -300)).toEqual(["c"]);
    expect(activeCueTexts(cues, 7000, 0)).toEqual([]);
  });
  it("clampOffset snaps to 100 ms within ±60 s; formatOffsetSeconds; shiftCues clamps at 0", () => {
    expect(clampOffset(149)).toBe(100);
    expect(clampOffset(-70_000)).toBe(-60_000);
    expect([formatOffsetSeconds(0), formatOffsetSeconds(500), formatOffsetSeconds(-1200)]).toEqual(["0.0", "+0.5", "-1.2"]);
    expect(shiftCues(cues, -1500)[0]).toEqual({ start: 0, end: 1500, text: "a" });
  });
});

function zip(entries: Array<[string, string, boolean]>): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let off = 0;
  for (const [name, text, deflate] of entries) {
    const raw = Buffer.from(text, "utf8");
    const data = deflate ? deflateRawSync(raw) : raw;
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(deflate ? 8 : 0, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(deflate ? 8 : 0, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    parts.push(local, n, data);
    central.push(c, n);
    off += local.length + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, eocd]));
}
describe("zip-extract + SubDL pack picking", () => {
  it("reads stored + deflated entries; prefers .srt and the SxxExx file of a pack", () => {
    const entries = unzip(zip([["Show.S01E01.srt", "1\n00:00:01,000 --> 00:00:02,000\nep1", true], ["Show.S01E02.ass", "[Events]", false], ["Show.S01E02.srt", "ep2", true], ["readme.txt", "x", false]]));
    expect(entries.map((e) => e.name)).toEqual(["Show.S01E01.srt", "Show.S01E02.ass", "Show.S01E02.srt", "readme.txt"]);
    expect(Buffer.from(entries[0].bytes).toString()).toContain("ep1");
    expect(pickZipEntry(entries, 1, 2)?.name).toBe("Show.S01E02.srt");
    expect(pickZipEntry(entries.slice(1, 2), 1, 2)?.name).toBe("Show.S01E02.ass");
    expect(pickZipEntry(entries.slice(3))).toBeNull();
    expect(() => unzip(new Uint8Array(10))).toThrow(/central directory/);
  });
});

describe("quota bookkeeping + cost", () => {
  it("parseResetTime accepts HH:MM:SS countdown or ISO; resetHours rounds up", () => {
    const now = 1_000_000;
    expect(parseResetTime("22:30:00", now)).toBe(now + 22.5 * 3_600_000);
    expect(parseResetTime("2026-10-15T08:00:00Z", now)).toBe(Date.parse("2026-10-15T08:00:00Z"));
    expect(parseResetTime("garbage", now)).toBeNull();
    expect(resetHours({ remaining: 0, resetAt: now + 21.2 * 3_600_000 }, now)).toBe(22);
    expect(resetHours({ remaining: 0, resetAt: null }, now)).toBe(24);
  });
  it("costVnd: a 2 h movie (25k + 25k tokens) via Kie ≈ 480 ₫ (estimate); Claude Haiku 4.5 at $1 / $5 per MTok ≈ 3 825 ₫; char estimate fallback", () => {
    expect(costVnd("kie", { inputTokens: 25_000, outputTokens: 25_000 })).toBe(479);
    expect(costVnd("claude", { inputTokens: 25_000, outputTokens: 25_000 })).toBe(3825);
    expect(estimateUsageFromChars(300, 300)).toEqual({ inputTokens: 300, outputTokens: 100 });
  });
});
