import "server-only";
import type { StreamEntry } from "@/lib/play/stream-registry";
import { assertSizeCap, EmbeddedTooLargeError, normalizeStreamLang, probeSubtitleStreams } from "./embedded-subtitle-extractor";
import { listSubRows, upsertCandidate, type SubRow } from "./subtitle-store";

/**
 * Embedded text subtitle streams of an MKV release (only consulted when no community vi exists): one ffprobe per
 * release hash per process (header read only — cheap), rows `embedded:<hash>:<n>` per text stream in vi / en. The
 * actual extraction (whole file through the VM, ≤ 8 GB) happens on the first VTT request and is cached forever.
 */
const g = globalThis as unknown as { __hcEmbeddedProbed?: Set<string> };
const probed = (): Set<string> => (g.__hcEmbeddedProbed ??= new Set());
export const embeddedSourceFileId = (hash: string, index: number): string => `embedded:${hash}:${index}`;
export const parseEmbeddedSourceFileId = (id: string | null): { hash: string; index: number } | null => {
  const m = id?.match(/^embedded:([0-9a-f]{40}):(\d+)$/i);
  return m ? { hash: m[1], index: Number(m[2]) } : null;
};

export async function discoverEmbeddedTracks(mediaKey: string, entry: StreamEntry, rows: SubRow[]): Promise<SubRow[]> {
  const hash = entry.release.hash;
  if (probed().has(hash) || rows.some((r) => r.source === "embedded" && r.sourceFileId?.startsWith(`embedded:${hash}:`))) return rows;
  probed().add(hash);
  try {
    const probe = await probeSubtitleStreams(entry.cdnUrl);
    assertSizeCap(probe.sizeBytes);
    console.log(`[subs] embedded probe ${hash.slice(0, 8)}: ${probe.streams.length} text stream(s), ${probe.sizeBytes ?? "?"} bytes`);
    for (const s of probe.streams) {
      const lang = normalizeStreamLang(s.lang);
      if (lang !== "vi" && lang !== "en") continue;
      upsertCandidate({ mediaKey, lang, source: "embedded", label: s.title || entry.fileName, sourceFileId: embeddedSourceFileId(hash, s.index), downloads: 0 });
    }
  } catch (err) {
    if (err instanceof EmbeddedTooLargeError) console.warn(`[subs] embedded skipped ${hash.slice(0, 8)}: ${(err.sizeBytes / 1024 ** 3).toFixed(1)} GB > cap`);
    else console.warn("[subs] embedded probe failed", err instanceof Error ? err.message : err);
  }
  return listSubRows(mediaKey);
}
