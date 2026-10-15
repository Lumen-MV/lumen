import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Embedded subtitle extraction against a LOCAL MKV (never a TorBox file): ffmpeg muxes a lavfi test video (native
 * `mpeg4` encoder — no libx264 dependency) with a tiny SRT as a `subrip` stream tagged `vie` into
 * qa/sample/sample-subs.mkv (generated once), then ffprobe lists it and ffmpeg extracts it as WebVTT.
 * Skipped with a clear message when ffmpeg is not on PATH or cannot generate the sample.
 */
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "admin-pass-123";

const ROOT = path.resolve(__dirname, "..");
const SAMPLE = path.join(ROOT, "qa", "sample", "sample-subs.mkv");
const SRT = "1\n00:00:00,500 --> 00:00:02,000\nXin chào Peter\n\n2\n00:00:02,500 --> 00:00:04,000\n<i>Giờ ai cũng biết</i>\nem là ai rồi.\n";
const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
})();

/** Generates the sample once; returns a skip reason instead of throwing when this ffmpeg build cannot mux it. */
const sampleProblem = (() => {
  if (!hasFfmpeg) return "ffmpeg not on PATH";
  if (fs.existsSync(SAMPLE) && fs.statSync(SAMPLE).size > 0) return null;
  try {
    fs.mkdirSync(path.dirname(SAMPLE), { recursive: true });
    const srt = path.join(path.dirname(SAMPLE), "sample-subs.srt");
    fs.writeFileSync(srt, SRT, "utf8");
    execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=5", "-i", srt, "-map", "0:v", "-map", "1:s", "-c:v", "mpeg4", "-q:v", "10", "-c:s", "srt", "-metadata:s:s:0", "language=vie", "-metadata:s:s:0", "title=Vietnamese", SAMPLE], { windowsHide: true, timeout: 60_000, stdio: ["ignore", "ignore", "pipe"] });
    return null;
  } catch (err) {
    fs.rmSync(SAMPLE, { force: true });
    return `ffmpeg could not generate qa/sample/sample-subs.mkv (${err instanceof Error ? err.message.split("\n")[0] : err})`;
  }
})();
if (sampleProblem) console.warn(`[embedded-subtitle-extractor test] SKIPPED: ${sampleProblem}`);

describe.skipIf(sampleProblem !== null)("embedded-subtitle-extractor (local sample)", () => {
  type Mod = typeof import("@/lib/subtitles/embedded-subtitle-extractor");
  let m: Mod;
  beforeAll(async () => {
    m = await import("@/lib/subtitles/embedded-subtitle-extractor");
  });
  it("ffprobe lists the text stream (codec subrip, lang vie → vi) and the file size", async () => {
    const probe = await m.probeSubtitleStreams(SAMPLE);
    expect(probe.sizeBytes).toBe(fs.statSync(SAMPLE).size);
    expect(probe.streams).toEqual([{ index: 0, codec: "subrip", lang: "vie", title: "Vietnamese" }]);
    expect(m.normalizeStreamLang(probe.streams[0].lang)).toBe("vi");
    expect(() => m.assertSizeCap(probe.sizeBytes)).not.toThrow();
  });
  it("ffmpeg -map 0:s:0 -f webvtt pipe:1 yields the cues as WebVTT", async () => {
    const vtt = await m.extractSubtitleStream(SAMPLE, 0);
    const { parseVtt } = await import("@/lib/subtitles/vtt-parser");
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 500, end: 2000, text: "Xin chào Peter" });
    expect(cues[1].text).toBe("<i>Giờ ai cũng biết</i>\nem là ai rồi.");
  });
  it("the 8 GB cap refuses a huge file before any byte is streamed", () => {
    expect(() => m.assertSizeCap(9 * 1024 ** 3)).toThrow(m.EmbeddedTooLargeError);
    expect(() => m.assertSizeCap(null)).not.toThrow();
  });
});
