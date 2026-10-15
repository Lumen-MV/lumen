import { describe, expect, it } from "vitest";
import { parseAss } from "@/lib/subtitles/ass-parser";
import { decodeSubtitle } from "@/lib/subtitles/encoding-detect";
import { parseSrt } from "@/lib/subtitles/srt-parser";
import { cleanCueText, normalizeCues } from "@/lib/subtitles/subtitle-text-clean";
import { formatVttTime, parseTimestamp } from "@/lib/subtitles/subtitle-timestamp";
import { detectSubtitleFormat, parseSubtitleText } from "@/lib/subtitles/subtitle-parse-any";
import { parseVtt, validateVtt } from "@/lib/subtitles/vtt-parser";
import { cuesToVtt } from "@/lib/subtitles/vtt-writer";

/** Phase 5 parsers: SRT / ASS / VTT, tag stripping, encoding fallback, VTT writer validity. */
const SRT = "﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n{\\an8}Peter, we need to talk\r\nabout what happened.\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,200\r\n<font color=\"#ff0\"><i>Everyone</i> knows</font> who I am now.\r\n\r\n\r\n3\r\n00:00:07,000 --> 00:00:06,000\r\ninvalid range\r\n\r\nnot-a-number\r\n00:00:08.000 --> 00:00:09.000\r\ndot timestamps\r\n\r\n5\r\n00:00:08,200 --> 00:00:08,800\r\nnested inside previous\r\n";

describe("parseSrt", () => {
  const cues = parseSrt(SRT);
  it("strips BOM / CRLF / {\\an8} / <font>, keeps <i>, joins lines, accepts '.' timestamps, drops invalid cues, KEEPS nested ones", () => {
    expect(cues.map((c) => c.text)).toEqual(["Peter, we need to talk\nabout what happened.", "<i>Everyone</i> knows who I am now.", "dot timestamps", "nested inside previous"]);
    expect(cues[0]).toMatchObject({ start: 1000, end: 3500 });
    expect(cues[2]).toMatchObject({ start: 8000, end: 9000 });
    expect(cues[3]).toMatchObject({ start: 8200, end: 8800 });
  });
  it("sorts out-of-order blocks and keeps a partial overlap untouched (both cues render together)", () => {
    const out = parseSrt("1\n00:00:10,000 --> 00:00:12,000\nB\n\n2\n00:00:05,000 --> 00:00:11,000\nA\n");
    expect(out.map((c) => [c.text, c.start, c.end])).toEqual([["A", 5000, 11_000], ["B", 10_000, 12_000]]);
  });
  it("handles a 2500-cue file quickly", () => {
    const big = Array.from({ length: 2500 }, (_, i) => `${i + 1}\n${formatVttTime(i * 2000).replace(".", ",")} --> ${formatVttTime(i * 2000 + 1500).replace(".", ",")}\nline ${i}`).join("\n\n");
    const t0 = Date.now();
    const out = parseSrt(big);
    expect(out).toHaveLength(2500);
    expect(out[2499].text).toBe("line 2499");
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

describe("parseAss", () => {
  const ASS = "[Script Info]\nTitle: x\n\n[V4+ Styles]\nFormat: Name, Fontname\nStyle: Default,Arial\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:03.70,0:00:05.20,Default,,0,0,0,,{\\pos(10,20)}Xin chào,\\Nthế giới\nComment: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,ignored\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\i1}Đầu tiên{\\i0}\\hok\n";
  const cues = parseAss(ASS);
  it("maps Format columns, converts h:mm:ss.cc, strips override tags, \\N → newline, \\h → space, keeps commas in Text, sorts", () => {
    expect(cues).toEqual([{ start: 1000, end: 2000, text: "Đầu tiên ok" }, { start: 3700, end: 5200, text: "Xin chào,\nthế giới" }]);
  });
  it("detectSubtitleFormat + parseSubtitleText route by content", () => {
    expect(detectSubtitleFormat(ASS)).toBe("ass");
    expect(detectSubtitleFormat(SRT)).toBe("srt");
    expect(detectSubtitleFormat("WEBVTT\n\n")).toBe("vtt");
    expect(parseSubtitleText(ASS, "x.srt").cues).toHaveLength(2);
  });
});

describe("timestamps + cleaning", () => {
  it("parseTimestamp accepts srt / vtt / ass / mm:ss forms and rejects junk", () => {
    expect(parseTimestamp("01:02:03,456")).toBe(3_723_456);
    expect(parseTimestamp("0:00:03.70")).toBe(3700);
    expect(parseTimestamp("02:03.5")).toBe(123_500);
    expect(parseTimestamp("1:99:00.000")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
    expect(formatVttTime(3_723_456)).toBe("01:02:03.456");
  });
  it("cleanCueText / normalizeCues", () => {
    expect(cleanCueText("{\\an8}<b>Hi</b> <span>there</span>  \\N  ")).toBe("<b>Hi</b> there");
    expect(normalizeCues([{ start: 5, end: 5, text: "x" }, { start: 1, end: 2, text: "" }, { start: 3, end: 4, text: "ok" }])).toEqual([{ start: 3, end: 4, text: "ok" }]);
  });
});

describe("decodeSubtitle", () => {
  it("strict UTF-8 (BOM stripped), windows-1258 fallback, UTF-16LE BOM", () => {
    expect(decodeSubtitle(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Tiếng Việt")]))).toBe("Tiếng Việt");
    expect(decodeSubtitle(new Uint8Array([0xf0, 0xe3, 0xe2]))).toBe("đăâ");
    expect(decodeSubtitle(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]))).toBe("AB");
  });
});

describe("VTT writer / parser", () => {
  const cues = [{ start: 1000, end: 3500, text: "A & B <i>x</i> <font>y</font>\n--> z" }, { start: 4000, end: 6200, text: "second" }];
  const vtt = cuesToVtt(cues);
  it("writes a valid document (header, numbered ids, hh:mm:ss.mmm, escaped payload, trailing newline)", () => {
    expect(vtt.startsWith("WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500\n")).toBe(true);
    expect(vtt).toContain("A &amp; B <i>x</i> &lt;font>y&lt;/font>\n→ z");
    expect(validateVtt(vtt)).toEqual([]);
    expect(vtt.endsWith("\n")).toBe(true);
  });
  it("round-trips through parseVtt (entities decoded), skips NOTE blocks, rejects non-VTT", () => {
    const back = parseVtt("WEBVTT\n\nNOTE hello\n\n" + vtt.slice("WEBVTT\n\n".length));
    expect(back[0]).toMatchObject({ start: 1000, end: 3500, text: "A & B <i>x</i> <font>y</font>\n→ z" });
    expect(back).toHaveLength(2);
    expect(() => parseVtt("1\n00:00:01.000 --> 00:00:02.000\nx")).toThrow();
    expect(validateVtt("WEBVTT\n\n1\n00:00:02.000 --> 00:00:01.000\nx\n")).toContain("range: 00:00:02.000 --> 00:00:01.000");
  });
});
