import { parseSizeToBytes } from "./release-labels";
import { isSeasonPack } from "./release-parser";
import type { HashSource, RawRelease } from "./hash-source-interface";

/**
 * Torrentio hash source: `{base}/stream/{movie|series}/{imdb}[:{s}:{e}].json` → streams[].{infoHash, fileIdx, title, sources, behaviorHints}.
 * Title lines: [release name, (in-pack file name), "👤 123 💾 12.3 GB ⚙️ YTS", (flags)]. Pure parsing lives in `parseTorrentioStream` (unit-tested).
 */
export type TorrentioStream = { infoHash?: string; fileIdx?: number; title?: string; sources?: string[]; behaviorHints?: { filename?: string } };

const STATS_RE = /👤\s*(\d+)\s*💾\s*([\d.]+\s*(?:GB|MB|KB))\s*(?:⚙️\s*(\S+))?/u;
const HASH_RE = /^[0-9a-f]{40}$/;

export function parseTorrentioStream(s: TorrentioStream): RawRelease | null {
  const hash = (s.infoHash ?? "").toLowerCase();
  if (!HASH_RE.test(hash)) return null;
  const lines = (s.title ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const statsIdx = lines.findIndex((l) => STATS_RE.test(l));
  const title = lines[0] ?? "";
  if (!title) return null;
  const stats = statsIdx >= 0 ? lines[statsIdx].match(STATS_RE) : null;
  // a line between the name and the stats is the file inside a pack
  const packFile = statsIdx > 1 ? lines[1] : undefined;
  const fileName = s.behaviorHints?.filename || packFile;
  return {
    hash,
    title,
    fileName: fileName || undefined,
    fileIdx: typeof s.fileIdx === "number" ? s.fileIdx : undefined,
    sizeBytes: stats ? parseSizeToBytes(stats[2]) : 0,
    seeders: stats ? Number(stats[1]) : 0,
    tracker: stats?.[3] ?? "",
    sources: Array.isArray(s.sources) ? s.sources.filter((x): x is string => typeof x === "string") : undefined,
    pack: Boolean(packFile) && isSeasonPack(title),
  };
}

export function createTorrentioHashSource(base: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): HashSource {
  const root = base.replace(/\/+$/, "");
  return {
    name: "torrentio",
    async search(imdbId, season, episode) {
      const isSeries = season !== undefined && episode !== undefined;
      const id = isSeries ? `${imdbId}:${season}:${episode}` : imdbId;
      const url = `${root}/stream/${isSeries ? "series" : "movie"}/${id}.json`;
      let res: Response;
      try {
        res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      } catch (err) {
        throw new Error(`Torrentio unreachable: ${err instanceof Error ? err.name : "error"}`);
      }
      if (!res.ok) throw new Error(`Torrentio ${res.status}`);
      const body = (await res.json()) as { streams?: TorrentioStream[] };
      const out: RawRelease[] = [];
      for (const s of body.streams ?? []) {
        const r = parseTorrentioStream(s);
        if (r) out.push(r);
      }
      return out;
    },
  };
}
