/** Pure helpers: pick the playable video file of a torrent (the exact S/E of a season pack); build a magnet link. */
export type VideoFileLike = { id: number; name: string; size: number };

const VIDEO_RE = /\.(mkv|mp4|avi|m4v|ts)$/i;
const MIN_VIDEO_BYTES = 100 * 1024 * 1024;
const SAMPLE_RE = /\b(sample|trailer)\b/i;

export const isVideoFile = (name: string): boolean => VIDEO_RE.test(name) && !SAMPLE_RE.test(name);

/** Folder / name segments that pin a file to season `s`: `S04`, `Season 4`, `Stagione 4`, `Сезон 4`, `Staffel 4`, `Temporada 4`. */
const seasonTokenRe = (s: number) => new RegExp(`(?:\\bS0*${s}(?![\\dEex])|\\b(?:Season|Stagione|Сезон|Staffel|Temporada|Saison)[ ._-]?0*${s}(?!\\d))`, "i");

/**
 * Episode-file matchers in confidence order. Explicit S+E tokens stand alone; a bare `E09` / `Episode 9` / `Ep 9` only
 * counts when the path also names the season (season folder or season token in the file name).
 */
function episodeMatchers(season: number, episode: number): Array<{ re: RegExp; needsSeason: boolean }> {
  const e = `0*${episode}(?!\\d)`;
  return [
    { re: new RegExp(`\\bS0*${season}[ ._-]?E${e}`, "i"), needsSeason: false }, // S04E09, S04.E09, S4E9
    { re: new RegExp(`\\bS0*${season}x${e}`, "i"), needsSeason: false }, // S04x09 (MIRCrew-style)
    { re: new RegExp(`(?<![\\dA-Za-z])0*${season}x${e}`, "i"), needsSeason: false }, // 4x09, 04x09
    { re: new RegExp(`\\b(?:E|Ep\\.?|Episode|Episodio)[ ._-]?${e}`, "i"), needsSeason: true }, // E09 / Episode 9 inside a season folder
  ];
}

/**
 * Movies (no S/E): largest video file ≥ 100 MB. Packs (S/E given): ONLY a confidently matched episode file — `S0*sE0*e`,
 * `S0*sx0*e`, `0*sx0*e`, or `E0*e` / `Episode e` when the path carries the season — else null (the caller surfaces
 * "Không tìm thấy file tập này trong gói"; the largest file is never a substitute for a specific episode). Samples/trailers ignored.
 */
export function pickVideoFile<T extends VideoFileLike>(files: T[], season?: number, episode?: number): T | null {
  const vids = files.filter((f) => isVideoFile(f.name) && f.size >= MIN_VIDEO_BYTES);
  if (season === undefined || episode === undefined) return [...vids].sort((a, b) => b.size - a.size)[0] ?? null;
  const seasonRe = seasonTokenRe(season);
  for (const { re, needsSeason } of episodeMatchers(season, episode)) {
    const hits = vids.filter((f) => re.test(f.name) && (!needsSeason || seasonRe.test(f.name)));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return [...hits].sort((a, b) => b.size - a.size)[0]; // duplicates (e.g. two encodes) → largest
  }
  return null;
}

const DEFAULT_TRACKERS = ["udp://tracker.opentrackr.org:1337/announce", "udp://open.stealth.si:80/announce", "udp://tracker.torrent.eu.org:451/announce", "udp://exodus.desync.com:6969/announce"];

/** `magnet:?xt=urn:btih:<hash>&dn=<name>&tr=…` — Torrentio `sources[]` (`tracker:udp://…`) extend the default tracker list. */
export function buildMagnet(hash: string, name?: string, sources: string[] = []): string {
  const trackers = new Set(DEFAULT_TRACKERS);
  for (const s of sources) if (s.startsWith("tracker:")) trackers.add(s.slice("tracker:".length));
  const parts = [`xt=urn:btih:${hash.toLowerCase()}`];
  if (name) parts.push(`dn=${encodeURIComponent(name)}`);
  for (const t of trackers) parts.push(`tr=${encodeURIComponent(t)}`);
  return `magnet:?${parts.join("&")}`;
}
