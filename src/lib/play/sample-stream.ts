import "server-only";
import { getEnv } from "@/lib/config/env";
import { parseSampleVariant, type SampleVariant } from "@/lib/dev/sample-media";
import type { ScenarioFlag } from "@/lib/dev/scenario-flags";
import { registerStream, type StreamEntry } from "./stream-registry";

/**
 * Dev scenario `play-sample[=ac3|mkv]` (LUMEN_SCENARIOS=1 only): resolve registers a stream whose "CDN" is the local
 * ffmpeg sample, so player QA / screenshots never touch TorBox. `playback-fail` forces the undecodable MKV variant.
 * `gen` counts link refreshes (the sample route's `link-expired` scenario accepts `g ≥ 1` as a fresh link).
 */
const SAMPLE_RELEASE = { plain: { title: "Lumen.Sample.2026.1080p.WEB-DL.AAC2.0.H.264-LMN.mp4", file: "Lumen.Sample.1080p.H264.AAC.mp4", quality: "1080p", playClass: "direct" as const }, ac3: { title: "Lumen.Sample.2026.1080p.BluRay.AC3.5.1.x264-LMN.mp4", file: "Lumen.Sample.1080p.x264.AC3.mp4", quality: "1080p", playClass: "maybe" as const }, mkv: { title: "Lumen.Sample.2026.1080p.BluRay.x265.AC3-GYPSY.mkv", file: "Lumen.Sample.1080p.x265.AC3-GYPSY.mkv", quality: "1080p", playClass: "maybe" as const } };
export const SAMPLE_HASH = "5a11e5a11e5a11e5a11e5a11e5a11e5a11e5a11e";

export function sampleVariantFor(scenario: Set<ScenarioFlag>, params: Map<ScenarioFlag, string>): SampleVariant | null {
  if (!scenario.has("play-sample")) return null;
  if (scenario.has("playback-fail")) return "mkv";
  return parseSampleVariant(params.get("play-sample"));
}

export function sampleUrl(variant: SampleVariant, gen: number): string {
  return `${getEnv().APP_URL}/api/dev/sample.mp4?v=${variant}&g=${gen}`;
}

export function registerSampleStream(userId: number, mediaKey: string, variant: SampleVariant, gen = 0): StreamEntry {
  const r = SAMPLE_RELEASE[variant];
  return registerStream({ cdnUrl: sampleUrl(variant, gen), torrentId: -1, fileId: 0, fileName: r.file, userId, mediaKey, release: { hash: SAMPLE_HASH, title: r.title, qualityLabel: r.quality }, playClass: r.playClass });
}

export const isSampleEntry = (e: StreamEntry): boolean => e.torrentId === -1 && e.release.hash === SAMPLE_HASH;

/** Current generation of a sample link (`g=` query) so a refresh can bump it. */
export function sampleGeneration(e: StreamEntry): { variant: SampleVariant; gen: number } {
  const u = new URL(e.cdnUrl);
  return { variant: parseSampleVariant(u.searchParams.get("v")), gen: Number(u.searchParams.get("g") ?? "0") || 0 };
}
