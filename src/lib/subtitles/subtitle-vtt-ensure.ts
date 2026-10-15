import "server-only";
import { parseMediaKey } from "@/lib/catalog/media-key";
import type { ScenarioFlag } from "@/lib/dev/scenario-flags-shared";
import type { StreamEntry } from "@/lib/play/stream-registry";
import { assertSizeCap, extractSubtitleStream, probeSubtitleStreams } from "./embedded-subtitle-extractor";
import { decodeSubtitle } from "./encoding-detect";
import { enqueueFfmpeg } from "./ffmpeg-queue";
import { isOsQuotaError, osDownload } from "./opensubtitles-client";
import { readOsQuota, recordOsQuota, recordOsQuotaExhausted } from "./os-quota-store";
import { subdlDownload } from "./subdl-client";
import { parseEmbeddedSourceFileId } from "./subtitle-embedded-discovery";
import { parseSubtitleText } from "./subtitle-parse-any";
import { hasVtt, storeVtt, type SubRow } from "./subtitle-store";
import { cleanCues } from "./subtitle-text-clean";
import { isOsSource } from "./subtitle-types";
import { parseVtt } from "./vtt-parser";

/**
 * First `GET /api/subs/[id].vtt` for a row downloads (OS / SubDL) or extracts (embedded) the file, converts it and
 * caches `DATA_DIR/subs/<id>.vtt` forever; later hits are plain file reads. Concurrent first hits share one promise.
 * OS downloads are refused while the quota is 0 (`OsQuotaError` → 429 OS_QUOTA) and update the counters afterwards.
 */
export class OsQuotaError extends Error {
  constructor() {
    super("OpenSubtitles quota exhausted");
    this.name = "OsQuotaError";
  }
}
export class SubtitleUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubtitleUnavailableError";
  }
}
const g = globalThis as unknown as { __hcVttInflight?: Map<number, Promise<SubRow>> };
const inflight = (): Map<number, Promise<SubRow>> => (g.__hcVttInflight ??= new Map());

async function fetchOs(row: SubRow, scenario: Set<ScenarioFlag>): Promise<SubRow> {
  if (readOsQuota(scenario).remaining <= 0) throw new OsQuotaError();
  const fileId = Number(row.sourceFileId);
  if (!Number.isFinite(fileId)) throw new SubtitleUnavailableError("bad OpenSubtitles file id");
  let dl;
  try {
    dl = await osDownload(fileId);
  } catch (err) {
    if (isOsQuotaError(err)) {
      recordOsQuotaExhausted();
      throw new OsQuotaError();
    }
    throw err;
  }
  if (dl.remaining !== null) recordOsQuota(dl.remaining, dl.resetTime);
  const { cues } = parseSubtitleText(decodeSubtitle(dl.bytes), dl.fileName);
  if (!cues.length) throw new SubtitleUnavailableError("empty subtitle file");
  return storeVtt(row.id, cues);
}

async function fetchSubdl(row: SubRow): Promise<SubRow> {
  const key = parseMediaKey(row.mediaKey);
  const file = await subdlDownload(row.sourceFileId ?? "", key?.season, key?.episode);
  const { cues } = parseSubtitleText(file.text, file.fileName);
  if (!cues.length) throw new SubtitleUnavailableError("empty subtitle file");
  return storeVtt(row.id, cues);
}

/** Whole-file extraction: one at a time per process (`ffmpeg-queue`), ffmpeg's WebVTT re-cleaned (`<v>`/`<c>` spans). */
async function extractEmbedded(row: SubRow, entry: StreamEntry | null): Promise<SubRow> {
  const ref = parseEmbeddedSourceFileId(row.sourceFileId);
  if (!ref) throw new SubtitleUnavailableError("bad embedded reference");
  if (!entry || entry.release.hash !== ref.hash) throw new SubtitleUnavailableError("stream handle required for embedded extraction");
  const probe = await probeSubtitleStreams(entry.cdnUrl);
  assertSizeCap(probe.sizeBytes);
  const cues = await enqueueFfmpeg(async () => {
    console.log(`[subs] extracting embedded stream ${ref.index} of ${ref.hash.slice(0, 8)} (${probe.sizeBytes ?? "?"} bytes through the VM)`);
    return cleanCues(parseVtt(await extractSubtitleStream(entry.cdnUrl, ref.index)));
  });
  if (!cues.length) throw new SubtitleUnavailableError("empty embedded stream");
  return storeVtt(row.id, cues);
}

export function ensureVtt(row: SubRow, scenario: Set<ScenarioFlag>, entry: StreamEntry | null): Promise<SubRow> {
  if (hasVtt(row)) return Promise.resolve(row);
  const running = inflight().get(row.id);
  if (running) return running;
  const job = (isOsSource(row.source) ? fetchOs(row, scenario) : row.source === "subdl" ? fetchSubdl(row) : row.source === "embedded" ? extractEmbedded(row, entry) : Promise.reject(new SubtitleUnavailableError("AI track not generated yet"))).finally(() => inflight().delete(row.id));
  inflight().set(row.id, job);
  return job;
}
