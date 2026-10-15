import type { HashSource, RawRelease } from "./hash-source-interface";

/**
 * YTS fallback for movies (used only when Torrentio fails or returns nothing): `/api/v2/list_movies.json?query_term=tt…`
 * → movies[].torrents[]{hash, quality, size_bytes, seeds, video_codec, audio_channels, type}. Releases are synthesised as
 * YTS-style names so the parser classifies them MP4 + AAC.
 */
type YtsTorrent = { hash?: string; quality?: string; size_bytes?: number; seeds?: number; video_codec?: string; audio_channels?: string; type?: string };
type YtsMovie = { imdb_code?: string; title_long?: string; torrents?: YtsTorrent[] };
type YtsResponse = { status?: string; data?: { movies?: YtsMovie[] } };

export const YTS_API = "https://yts.mx/api/v2/list_movies.json";
const HASH_RE = /^[0-9a-f]{40}$/;

export function ytsTorrentToRelease(movie: YtsMovie, t: YtsTorrent): RawRelease | null {
  const hash = (t.hash ?? "").toLowerCase();
  if (!HASH_RE.test(hash)) return null;
  const name = (movie.title_long ?? "Movie").replace(/[^\w\s()-]/g, "").replace(/\s+/g, ".");
  const source = (t.type ?? "").toLowerCase() === "web" ? "WEB" : "BluRay";
  const codec = (t.video_codec ?? "x264").toLowerCase() === "x265" ? "x265" : "x264";
  const channels = t.audio_channels && /^\d\.\d$/.test(t.audio_channels) ? `AAC${t.audio_channels}` : "AAC";
  return {
    hash,
    title: `${name}.${t.quality ?? "1080p"}.${source}.${codec}.${channels}-[YTS.MX].mp4`,
    fileName: undefined,
    sizeBytes: t.size_bytes ?? 0,
    seeders: t.seeds ?? 0,
    tracker: "YTS",
  };
}

export function createYtsHashSource(fetchImpl: typeof fetch = fetch, timeoutMs = 8000): HashSource {
  return {
    name: "yts",
    async search(imdbId, season) {
      if (season !== undefined) return [];
      let res: Response;
      try {
        res = await fetchImpl(`${YTS_API}?query_term=${encodeURIComponent(imdbId)}`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      } catch (err) {
        throw new Error(`YTS unreachable: ${err instanceof Error ? err.name : "error"}`);
      }
      if (!res.ok) throw new Error(`YTS ${res.status}`);
      const body = (await res.json()) as YtsResponse;
      const movie = (body.data?.movies ?? []).find((m) => m.imdb_code === imdbId);
      if (!movie) return [];
      return (movie.torrents ?? []).map((t) => ytsTorrentToRelease(movie, t)).filter((r): r is RawRelease => r !== null);
    },
  };
}
