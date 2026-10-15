import { describe, expect, it } from "vitest";
import { parseAss } from "@/lib/subtitles/ass-parser";
import { stripCueMarkup, tokenizeCueMarkup } from "@/lib/subtitles/cue-markup";
import { activeCueTexts } from "@/lib/subtitles/cue-offset";
import { decodeSubtitle } from "@/lib/subtitles/encoding-detect";
import { parseSrt } from "@/lib/subtitles/srt-parser";
import { parseSubtitleText } from "@/lib/subtitles/subtitle-parse-any";
import { cleanCues, cleanCueText, normalizeCues } from "@/lib/subtitles/subtitle-text-clean";
import { parseVtt, validateVtt } from "@/lib/subtitles/vtt-parser";
import { cuesToVtt } from "@/lib/subtitles/vtt-writer";

/**
 * Crafted parser inputs from the Phase 5 tester report (D2 / D3 / D4 / D9 / D10 / D11): nested + identical-timing +
 * partially overlapping cues are ALL kept, ASS drawing commands and `<br>` handled, windows-1258 output NFC, cue
 * markup tokenised for the band (no literal `<i>`), active-cue lookup correct with overlapping windows.
 */
const SRT = [
  "﻿1", "00:00:01,000 --> 00:00:03,000", "{\\an8}Top line", "",
  "2", "00:00:02,000 --> 00:00:04,000", "<i>Whispering</i> bottom line", "",
  "3", "00:00:05,000 --> 00:00:07,000", "Line A\\NLine B", "",
  "4", "00:00:05,000 --> 00:00:07,000", "Speaker 2 at the same time", "",
  "5", "00:00:1,000 --> 00:00:09,000", "bad start (1-digit seconds)", "",
  "6", "00:00:10,000-->00:00:11,000", "no spaces around arrow", "",
  "7", "00:00:12 --> 00:00:13", "no milliseconds", "",
  "8", "00:00:14,000 --> 00:00:15,000 X1:100 X2:200 Y1:10 Y2:20", "srt position extension", "",
  "9", "00:00:16,000 --> 00:00:18,000", "A & B --> C < D", "",
  "10", "00:00:19,000 --> 00:00:20,000", "<font color=\"#ffff00\">colour</font> and <br>break", "",
  "11", "00:00:21,000 --> 00:00:23,000", "{\\pos(100,200)}{\\i1}ass-ish tags{\\i0}", "",
  "12", "00:60:00,000 --> 00:61:00,000", "minutes > 59", "",
  "13", "01:00:00,000 --> 00:59:00,000", "end before start", "",
  "14", "00:00:24,000 --> 00:00:25,000", "", "",
  "15", "00:00:26,000 --> 00:00:28,000", "   padded   text   ", "",
  "16", "00:00:05,000 --> 00:00:07,000", "Line A\\NLine B", "",
].join("\r\n");

describe("SRT edge cases (tester samples)", () => {
  const cues = parseSrt(SRT);
  const texts = cues.map((c) => c.text);
  it("BOM + CRLF, {\\an8}, \\N, <font>, {\\pos}, whitespace, no-space arrow, X1/X2 extension", () => {
    expect(texts).toContain("Top line");
    expect(texts).toContain("Line A\nLine B");
    expect(texts).toContain("no spaces around arrow");
    expect(texts).toContain("srt position extension");
    expect(texts).toContain("ass-ish tags");
    expect(texts).toContain("padded text");
    expect(texts).not.toContain("");
  });
  it("identical-timing cues from two speakers are BOTH kept; an exact duplicate (time + text) is dropped", () => {
    expect(cues.filter((c) => c.start === 5000).map((c) => c.text)).toEqual(["Line A\nLine B", "Speaker 2 at the same time"]);
  });
  it("partial overlap keeps the first cue's full window", () => {
    expect(cues.find((c) => c.text === "Top line")).toMatchObject({ start: 1000, end: 3000 });
  });
  it("malformed timestamps dropped (1-digit sec, no ms, min > 59, end < start)", () => {
    expect(texts.some((t) => /bad start|no milliseconds|minutes > 59|end before start/.test(t))).toBe(false);
  });
  it("<br> becomes a line break (not glued)", () => {
    expect(texts).toContain("colour and\nbreak");
  });
  it("writer output is valid and round-trips with the same count / timings / overlapping windows", () => {
    const vtt = cuesToVtt(cues);
    expect(validateVtt(vtt)).toEqual([]);
    expect(vtt).toContain("A &amp; B → C &lt; D");
    const back = parseVtt(vtt);
    expect(back.map((c) => [c.start, c.end])).toEqual(cues.map((c) => [c.start, c.end]));
  });
});

describe("ASS edge cases (tester samples)", () => {
  const ASS = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:10.00,Sign,,0,0,0,,{\\an8}{\\pos(640,50)}TRƯỜNG TRUNG HỌC MIDTOWN
Dialogue: 0,0:00:02.00,0:00:04.00,Default,,0,0,0,,Peter, mình cần nói chuyện,\\Nvề chuyện vừa xảy ra.
Dialogue: 0,0:00:04.50,0:00:06.00,Default,,0,0,0,,{\\i1}Giờ ai cũng biết{\\i0} em là ai rồi.
Comment: 0,0:00:07.00,0:00:08.00,Default,,0,0,0,,ignored comment
Dialogue: 1,0:00:12.00,0:00:13.00,Default,,0,0,0,,{\\fad(200,200)}\\hIndented\\hwith\\hhard\\hspaces
Dialogue: 0,0:00:14.00,0:00:15.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100{\\p0}
Dialogue: 0,0:00:16.00,0:00:17.00,Default,,0,0,0,,m 0 0 l 100 0 100 100{\\p1}drawing{\\p0}
Dialogue: 0,0:00:18.00,0:00:19.00,Default,,0,0,0,,{\\an7\\pos(0,0)\\p1}m 0 0 b 1 2 3 4 5 6{\\p0}Sign text after drawing
`;
  const cues = parseAss(ASS);
  const texts = cues.map((c) => c.text);
  it("an {\\an8} sign spanning 1–10 s AND the dialogue cues underneath are all kept, sign window untouched", () => {
    expect(texts).toContain("TRƯỜNG TRUNG HỌC MIDTOWN");
    expect(texts).toContain("Peter, mình cần nói chuyện,\nvề chuyện vừa xảy ra.");
    expect(texts).toContain("Giờ ai cũng biết em là ai rồi.");
    expect(cues.find((c) => /TRƯỜNG/.test(c.text))).toMatchObject({ start: 1000, end: 10_000 });
    expect(texts.some((t) => /ignored/.test(t))).toBe(false);
  });
  it("{\\i1} stripped, \\h → space", () => {
    expect(texts).toContain("Indented with hard spaces");
  });
  it("drawing commands ({\\p1}…{\\p0}, bare `m 0 0 l …` lines, combined override blocks) never render as text", () => {
    expect(texts.some((t) => /m 0 0|^drawing$|b 1 2 3/.test(t))).toBe(false);
    expect(texts).toContain("Sign text after drawing");
    expect(cleanCueText("{\\p1}m 0 0 l 100 0 100 100{\\p0}")).toBe("");
    expect(cleanCueText("m 10 20 l 30 40\\NReal line")).toBe("Real line");
  });
  it("writer output valid for the overlapping sign", () => {
    expect(validateVtt(cuesToVtt(cues))).toEqual([]);
  });
});

describe("encodings", () => {
  it("windows-1258 bytes (base vowel + combining tone byte) → NFC precomposed 'Tiếng Việt đã'", () => {
    const cp1258 = new Uint8Array([0x31, 0x0a, 0x30, 0x30, 0x3a, 0x30, 0x30, 0x3a, 0x30, 0x31, 0x2c, 0x30, 0x30, 0x30, 0x20, 0x2d, 0x2d, 0x3e, 0x20, 0x30, 0x30, 0x3a, 0x30, 0x30, 0x3a, 0x30, 0x32, 0x2c, 0x30, 0x30, 0x30, 0x0a, 0x54, 0x69, 0xea, 0xec, 0x6e, 0x67, 0x20, 0x56, 0x69, 0xea, 0xf2, 0x74, 0x20, 0xf0, 0x61, 0xde, 0x0a]);
    const text = parseSubtitleText(decodeSubtitle(cp1258)).cues[0]?.text;
    expect(text).toBe("Tiếng Việt đã");
    expect([...(text ?? "")]).toHaveLength(13);
  });
  it("UTF-16LE / UTF-8 BOM / plain UTF-8 all survive", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nTiếng Việt\n";
    expect(parseSubtitleText(decodeSubtitle(new Uint8Array([0xff, 0xfe, ...Buffer.from(srt, "utf16le")]))).cues[0]?.text).toBe("Tiếng Việt");
    expect(parseSubtitleText(decodeSubtitle(new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from(srt, "utf8")]))).cues[0]?.text).toBe("Tiếng Việt");
    expect(decodeSubtitle(Buffer.from("Hoạt hình Nhật Bản"))).toBe("Hoạt hình Nhật Bản");
  });
});

describe("cue markup for the band", () => {
  it("<i>/<b>/<u> become segment flags (nested + unbalanced tolerated), every other tag is dropped", () => {
    expect(tokenizeCueMarkup("<i>Whispering</i> bottom line")).toEqual([{ text: "Whispering", i: true, b: false, u: false }, { text: " bottom line", i: false, b: false, u: false }]);
    expect(tokenizeCueMarkup("<b><i>both</i></b> <u>u</u>")).toEqual([{ text: "both", i: true, b: true, u: false }, { text: " ", i: false, b: false, u: false }, { text: "u", i: false, b: false, u: true }]);
    expect(tokenizeCueMarkup("<v Peter>Hi</v> <c.yellow>x</c> </i>tail")).toEqual([{ text: "Hi x tail", i: false, b: false, u: false }]);
    expect(stripCueMarkup("<i>a</i>b")).toBe("ab");
  });
  it("cleanCues re-cleans ffmpeg VTT output (voice / class spans, empties)", () => {
    expect(cleanCues([{ start: 0, end: 1000, text: "<v Peter>Hi &amp; bye</v>" }, { start: 2000, end: 3000, text: "<c.yellow>styled</c>" }, { start: 4000, end: 5000, text: "{\\an8}" }])).toEqual([{ start: 0, end: 1000, text: "Hi &amp; bye" }, { start: 2000, end: 3000, text: "styled" }]);
  });
});

describe("active cues with overlapping windows", () => {
  const cues = normalizeCues([{ start: 1000, end: 10_000, text: "SIGN" }, { start: 2000, end: 4000, text: "a" }, { start: 4500, end: 6000, text: "b" }, { start: 5000, end: 7000, text: "c" }, { start: 5000, end: 7000, text: "d" }, { start: 12_000, end: 13_000, text: "e" }]);
  it("nested / identical-timing / partial overlaps are all reported in start order", () => {
    expect(activeCueTexts(cues, 3000, 0)).toEqual(["SIGN", "a"]);
    expect(activeCueTexts(cues, 4200, 0)).toEqual(["SIGN"]);
    expect(activeCueTexts(cues, 5500, 0)).toEqual(["SIGN", "b", "c", "d"]);
    expect(activeCueTexts(cues, 9500, 0)).toEqual(["SIGN"]);
    expect(activeCueTexts(cues, 11_000, 0)).toEqual([]);
    expect(activeCueTexts(cues, 12_500, 0)).toEqual(["e"]);
    expect(activeCueTexts(cues, 3500, 500)).toEqual(["SIGN", "a"]);
  });
  it("2500 sequential cues still resolve by binary search (last cue, boundaries)", () => {
    const big = Array.from({ length: 2500 }, (_, i) => ({ start: i * 2000, end: i * 2000 + 1500, text: `c${i}` }));
    expect(activeCueTexts(big, 2499 * 2000 + 100, 0)).toEqual(["c2499"]);
    expect(activeCueTexts(big, 2000 * 10 + 1500, 0)).toEqual([]);
    expect(activeCueTexts(big, 2000 * 10 + 1499, 0)).toEqual(["c10"]);
  });
});
