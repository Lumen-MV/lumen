import { describe, expect, it } from "vitest";
import { externalPlayerUrl } from "@/lib/play/external-player-links";
import { applyNativeCueOffset, nativeTrackMode, nextNativeFullscreen, type CueBaseTimes, type TimedCue } from "@/lib/subtitles/native-track-mode";
import { clearSignedSubtitleRateBuckets, SIGNED_SUB_RATE_LIMIT, SIGNED_SUB_TTL_S, signedSubtitleFormat, signedSubtitlePath, signedSubtitleRateLimited, subtitleSig, verifySubtitleSig } from "@/lib/subtitles/signed-subtitle-url";
import { cuesToSrt, formatSrtTime, srtCueText } from "@/lib/subtitles/srt-writer";
import { parseSrt } from "@/lib/subtitles/srt-parser";

/** Signed session-less subtitle links (Infuse / VLC hand-off), the SRT writer + the native <track> rules for the iPhone system full screen. */
const SECRET = "unit-test-secret-at-least-32-characters-long";
const NOW = 1_760_000_000_000;

describe("signed subtitle URL (path-style, extension last, no query string)", () => {
  const parse = (p: string) => p.match(/^\/api\/subs\/s\/(\d+)\/(\d+)\/([0-9a-f]+)\/subtitle\.(srt|vtt)$/)!;
  it("signs id|exp with the secret, expires after 60 min, verifies only the exact tuple", () => {
    const path = signedSubtitlePath(42, "srt", SECRET, NOW);
    const [, id, exp, sig, ext] = parse(path);
    expect([id, ext]).toEqual(["42", "srt"]);
    expect(path.includes("?")).toBe(false);
    expect(signedSubtitlePath(42, "vtt", SECRET, NOW).endsWith("/subtitle.vtt")).toBe(true);
    expect(Number(exp)).toBe(Math.floor(NOW / 1000) + SIGNED_SUB_TTL_S);
    expect(sig).toBe(subtitleSig(42, Number(exp), SECRET));
    expect(verifySubtitleSig(42, exp, sig, SECRET, NOW)).toBe(true);
    expect(verifySubtitleSig(42, exp, sig, SECRET, NOW + 59 * 60_000)).toBe(true);
    expect(verifySubtitleSig(42, exp, sig, SECRET, NOW + 61 * 60_000)).toBe(false); // expired
    expect(verifySubtitleSig(43, exp, sig, SECRET, NOW)).toBe(false); // tampered id
    expect(verifySubtitleSig(42, String(Number(exp) + 1), sig, SECRET, NOW)).toBe(false); // tampered exp
    expect(verifySubtitleSig(42, exp, sig, "another-secret-of-thirty-two-chars!!", NOW)).toBe(false);
    expect(verifySubtitleSig(42, exp, sig.slice(0, 63) + (sig.endsWith("0") ? "1" : "0"), SECRET, NOW)).toBe(false);
  });
  it("rejects malformed / missing params, an exp further than the TTL (forged long-lived link) and foreign file names", () => {
    const far = Math.floor(NOW / 1000) + SIGNED_SUB_TTL_S + 10;
    expect(verifySubtitleSig(42, String(far), subtitleSig(42, far, SECRET), SECRET, NOW)).toBe(false);
    expect(verifySubtitleSig(42, null, "ab", SECRET, NOW)).toBe(false);
    expect(verifySubtitleSig(42, "12", null, SECRET, NOW)).toBe(false);
    expect(verifySubtitleSig(42, "abc", "f".repeat(64), SECRET, NOW)).toBe(false);
    expect(verifySubtitleSig(42, "1760003600", "zz", SECRET, NOW)).toBe(false);
    expect(signedSubtitleFormat("subtitle.srt")).toBe("srt");
    expect(signedSubtitleFormat("subtitle.vtt")).toBe("vtt");
    expect(signedSubtitleFormat("subtitle.ass")).toBeNull();
    expect(signedSubtitleFormat("x.srt")).toBeNull();
  });
  it("rate limit: 60 / min / ip, then 429 until the window moves", () => {
    clearSignedSubtitleRateBuckets();
    for (let i = 0; i < SIGNED_SUB_RATE_LIMIT; i++) expect(signedSubtitleRateLimited("1.2.3.4", NOW + i)).toBe(false);
    expect(signedSubtitleRateLimited("1.2.3.4", NOW + 100)).toBe(true);
    expect(signedSubtitleRateLimited("5.6.7.8", NOW + 100)).toBe(false);
    expect(signedSubtitleRateLimited("1.2.3.4", NOW + 61_000)).toBe(false);
    clearSignedSubtitleRateBuckets();
  });
  it("hand-off links: Infuse + VLC iOS carry &sub=, desktop VLC / IINA / copy never do", () => {
    const cdn = "https://cdn.example/f.mp4?token=x&a=1";
    const sub = "https://lumen.example/api/subs/s/7/1760003600/abcdef/subtitle.srt";
    expect(externalPlayerUrl("infuse", cdn, "ios", null, sub)).toBe(`infuse://x-callback-url/play?url=${encodeURIComponent(cdn)}&sub=${encodeURIComponent(sub)}`);
    expect(externalPlayerUrl("vlc", cdn, "ios", null, sub)).toBe(`vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(cdn)}&sub=${encodeURIComponent(sub)}`);
    expect(externalPlayerUrl("vlc", cdn, "windows", null, sub)).toBe(`vlc://${cdn}`);
    expect(externalPlayerUrl("iina", cdn, "mac", null, sub)).toBe(`iina://weblink?url=${encodeURIComponent(cdn)}`);
    expect(externalPlayerUrl("copy", cdn, "ios", null, sub)).toBe(cdn);
    expect(externalPlayerUrl("infuse", cdn, "ios", null, null)).toBe(`infuse://x-callback-url/play?url=${encodeURIComponent(cdn)}`);
  });
  it("x-callback round trip: a standard query parser recovers both URLs verbatim; the encoded sub holds no ?/&/= and starts with the fully-encoded scheme VLC iOS looks for", () => {
    const cdn = "https://cdn.example/dir with space/f.mkv?token=a%2Fb&x=1&y=ü";
    const sub = `https://lumen.example${signedSubtitlePath(7, "srt", SECRET, NOW)}`;
    for (const link of [externalPlayerUrl("infuse", cdn, "ios", null, sub)!, externalPlayerUrl("vlc", cdn, "ios", null, sub)!]) {
      const u = new URL(link);
      expect(u.searchParams.get("url")).toBe(cdn);
      expect(u.searchParams.get("sub")).toBe(sub);
      expect([...u.searchParams.keys()]).toEqual(["url", "sub"]);
      const rawSub = link.slice(link.indexOf("&sub=") + 5);
      expect(rawSub).not.toMatch(/[?&=]/);
      expect(rawSub.slice(0, 14).toUpperCase()).toContain("%3A%2F%2F");
      expect(decodeURIComponent(rawSub)).toBe(sub);
      expect(decodeURIComponent(rawSub).endsWith(".srt")).toBe(true);
    }
  });
});

describe("SRT writer", () => {
  it("numbered CRLF blocks, comma timestamps, i/b/u kept, other markup + positioning stripped, empties skipped, parses back", () => {
    const srt = cuesToSrt([
      { start: 1000, end: 2500, text: "<i>Xin chào</i>\n<c.yellow>thế giới</c>" },
      { start: 3_723_456, end: 3_724_000, text: "<v Anh>a --> b</v> <font color=\"red\">đỏ</font> <b>đậm</b>" },
      { start: 5000, end: 6000, text: "<ruby>x</ruby>" },
      { start: 7000, end: 8000, text: "   " },
    ]);
    expect(srt).toBe("1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Xin chào</i>\r\nthế giới\r\n\r\n2\r\n01:02:03,456 --> 01:02:04,000\r\na → b đỏ <b>đậm</b>\r\n\r\n3\r\n00:00:05,000 --> 00:00:06,000\r\nx\r\n");
    expect(srt.includes("\n") && !/[^\r]\n/.test(srt)).toBe(true); // every LF is preceded by CR
    expect(srt.charCodeAt(0)).not.toBe(0xfeff); // no BOM
    // parseSrt sorts by start, hence the 5 s cue before the 1 h one
    expect(parseSrt(srt).map((c) => [c.start, c.end, c.text])).toEqual([[1000, 2500, "<i>Xin chào</i>\nthế giới"], [5000, 6000, "x"], [3_723_456, 3_724_000, "a → b đỏ <b>đậm</b>"]]);
    expect(cuesToSrt([])).toBe("");
    expect(formatSrtTime(-5)).toBe("00:00:00,000");
    expect(srtCueText("a < b")).toBe("a < b");
  });
});

describe("native <track> rules", () => {
  it("mode: showing only while the video element itself is full screen", () => {
    expect(nativeTrackMode(false)).toBe("hidden");
    expect(nativeTrackMode(true)).toBe("showing");
    const off = { fullscreenElementIsVideo: false, webkitDisplayingFullscreen: false };
    expect(nextNativeFullscreen("webkitbeginfullscreen", off)).toBe(true);
    expect(nextNativeFullscreen("webkitendfullscreen", { ...off, webkitDisplayingFullscreen: true })).toBe(false);
    expect(nextNativeFullscreen("fullscreenchange", off)).toBe(false); // our container went full screen → band keeps rendering
    expect(nextNativeFullscreen("fullscreenchange", { ...off, fullscreenElementIsVideo: true })).toBe(true); // iPadOS: the element itself
    expect(nextNativeFullscreen("fullscreenchange", { ...off, webkitDisplayingFullscreen: true })).toBe(true);
  });
  it("offset shifts native cues like the band (+ = later), re-applies without drift, clamps at 0", () => {
    const cues: TimedCue[] = [{ startTime: 1, endTime: 2 }, { startTime: 0.2, endTime: 0.5 }];
    const base: CueBaseTimes = new WeakMap();
    expect(applyNativeCueOffset(cues, base, 500)).toBe(2);
    expect(cues[0]).toEqual({ startTime: 1.5, endTime: 2.5 });
    applyNativeCueOffset(cues, base, -1000);
    expect(cues[0]).toEqual({ startTime: 0, endTime: 1 });
    expect(cues[1]).toEqual({ startTime: 0, endTime: 0 });
    applyNativeCueOffset(cues, base, 0);
    expect(cues).toEqual([{ startTime: 1, endTime: 2 }, { startTime: 0.2, endTime: 0.5 }]);
  });
});
