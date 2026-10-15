import { execFile } from "node:child_process";
import { getEnv } from "@/lib/config/env";
import { EMBEDDED_MAX_BYTES } from "./subtitle-types";

/**
 * Text subtitle streams inside a container: `ffprobe` lists them (header read only), `ffmpeg -map 0:s:N -f webvtt`
 * extracts one — which streams the WHOLE file from the CDN, hence the 8 GB cap and "once, cached forever" policy
 * enforced by the search service. Only text codecs qualify (bitmap PGS / VobSub cannot become VTT).
 * The CDN URL embeds the TorBox key: ffmpeg echoes it in `stderr` on any failure, so every error message is redacted
 * (`redactStderr`) before it can reach an Error / log line.
 */
export type EmbeddedStream = { index: number; codec: string; lang: string; title: string };
export type ProbeResult = { sizeBytes: number | null; streams: EmbeddedStream[] };
const TEXT_CODECS = new Set(["subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text"]);
/** ffprobe runs inside the search request → short budget (reviewer P2-10) */
const PROBE_TIMEOUT_MS = 10_000;
const EXTRACT_TIMEOUT_MS = 20 * 60_000;
const MAX_OUTPUT = 64 * 1024 * 1024;

/** Exact secrets replaced first, then any remaining URL / `token=` fragment — nothing CDN-shaped survives. */
export function redactStderr(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("<cdn>");
  return out.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "<url>").replace(/token=[^\s&'"]*/gi, "token=<redacted>");
}

function run(bin: string, args: string[], timeout: number, secrets: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { windowsHide: true, timeout, maxBuffer: MAX_OUTPUT, encoding: "utf8" }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      const tail = redactStderr(String(stderr).slice(-300) || err.message, secrets);
      reject(new Error(`${bin} failed: ${tail}`));
    });
  });
}

export class EmbeddedTooLargeError extends Error {
  constructor(readonly sizeBytes: number) {
    super(`embedded extraction skipped: ${sizeBytes} bytes > cap`);
    this.name = "EmbeddedTooLargeError";
  }
}

export function assertSizeCap(sizeBytes: number | null): void {
  if (sizeBytes !== null && sizeBytes > EMBEDDED_MAX_BYTES) throw new EmbeddedTooLargeError(sizeBytes);
}

export async function probeSubtitleStreams(url: string): Promise<ProbeResult> {
  const out = await run(getEnv().FFPROBE_PATH, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-select_streams", "s", url], PROBE_TIMEOUT_MS, [url]);
  let json: { format?: { size?: string }; streams?: Array<{ index: number; codec_name?: string; tags?: Record<string, string> }> };
  try {
    json = JSON.parse(out);
  } catch {
    throw new Error("ffprobe returned non-JSON output");
  }
  const size = json.format?.size ? Number(json.format.size) : null;
  const streams = (json.streams ?? []).map((s, i) => ({ index: i, codec: s.codec_name ?? "", lang: (s.tags?.language ?? s.tags?.LANGUAGE ?? "").toLowerCase(), title: s.tags?.title ?? "" })).filter((s) => TEXT_CODECS.has(s.codec));
  return { sizeBytes: Number.isFinite(size) ? size : null, streams };
}

/** Extracts subtitle stream N (0-based among subtitle streams) as WebVTT text. Caller checks the size cap first. */
export function extractSubtitleStream(url: string, subtitleIndex: number): Promise<string> {
  return run(getEnv().FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", url, "-map", `0:s:${subtitleIndex}`, "-f", "webvtt", "pipe:1"], EXTRACT_TIMEOUT_MS, [url]);
}

/** ISO 639-2 tags inside containers ("vie", "eng") → the app's 2-letter codes. */
export function normalizeStreamLang(tag: string): string {
  const t = tag.toLowerCase();
  if (t === "vie" || t === "vi" || t === "vn") return "vi";
  if (t === "eng" || t === "en") return "en";
  return t.slice(0, 2) || "und";
}
