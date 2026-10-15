import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getEnv } from "@/lib/config/env";

/**
 * Dev-only local playback samples (LUMEN_SCENARIOS=1): generated ONCE with ffmpeg into qa/sample/ so every player QA run
 * and screenshot plays a local file instead of TorBox. Variants:
 *   plain → H.264 + AAC MP4 (plays everywhere)           ac3 → H.264 + AC3 MP4 (Chromium skips the audio track → "no-audio")
 *   mkv   → MPEG-4 part 2 + AC3 in Matroska (no decodable stream in Chromium → MEDIA_ERR_SRC_NOT_SUPPORTED → "codec-error")
 */
export type SampleVariant = "plain" | "ac3" | "mkv";
export const SAMPLE_VARIANTS: SampleVariant[] = ["plain", "ac3", "mkv"];
const SAMPLE_SECONDS = 60;

const FILES: Record<SampleVariant, { file: string; type: string; args: string[] }> = {
  plain: { file: "sample.mp4", type: "video/mp4", args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart"] },
  ac3: { file: "sample-ac3.mp4", type: "video/mp4", args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p", "-c:a", "ac3", "-b:a", "96k", "-movflags", "+faststart"] },
  mkv: { file: "sample-codec.mkv", type: "video/x-matroska", args: ["-c:v", "mpeg4", "-q:v", "8", "-c:a", "ac3", "-b:a", "96k"] },
};

const g = globalThis as unknown as { __hcSamplePending?: Map<string, Promise<string>> };
const pending = (): Map<string, Promise<string>> => (g.__hcSamplePending ??= new Map());

export const sampleDir = () => path.resolve(process.cwd(), "qa", "sample");
export const sampleContentType = (v: SampleVariant) => FILES[v].type;
export const parseSampleVariant = (raw: string | null | undefined): SampleVariant => (raw === "ac3" || raw === "mkv" ? raw : "plain");

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(getEnv().FFMPEG_PATH, args, { windowsHide: true, timeout: 120_000 }, (err, _out, stderr) => (err ? reject(new Error(`ffmpeg failed: ${String(stderr).slice(-400)}`)) : resolve()));
  });
}

/** Absolute path of the variant, generating it with ffmpeg (testsrc2 + sine, 60 s, 640×360) on first use. */
export function ensureSample(variant: SampleVariant): Promise<string> {
  const def = FILES[variant];
  const out = path.join(sampleDir(), def.file);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return Promise.resolve(out);
  const inflight = pending().get(out);
  if (inflight) return inflight;
  fs.mkdirSync(sampleDir(), { recursive: true });
  const tmp = `${out}.part`;
  const job = run(["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=size=640x360:rate=25:duration=${SAMPLE_SECONDS}`, "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${SAMPLE_SECONDS}`, ...def.args, "-shortest", "-f", variant === "mkv" ? "matroska" : "mp4", tmp])
    .then(() => {
      fs.renameSync(tmp, out);
      return out;
    })
    .finally(() => pending().delete(out));
  pending().set(out, job);
  return job;
}
