/**
 * Canonical media identifier used by my_list / likes / progress / notifications and every catalog API:
 *   'movie:634649' · 'tv:66732' · 'tv:66732:4:1' (season:episode).
 */
export type MediaType = "movie" | "tv";
export type MediaKey = { type: MediaType; tmdbId: number; season?: number; episode?: number };

// TMDB ids start at 1 (no leading zeros, ≤ 9 digits); season 0 = specials, so only the title id must be ≥ 1
const KEY_RE = /^(movie|tv):([1-9]\d{0,8})(?::(\d{1,3}):(\d{1,4}))?$/;

export function formatMediaKey(type: MediaType, tmdbId: number, season?: number, episode?: number): string {
  const base = `${type}:${tmdbId}`;
  return season !== undefined && episode !== undefined ? `${base}:${season}:${episode}` : base;
}

/** Returns null for anything that is not exactly `movie:<id>` / `tv:<id>[:<s>:<e>]`. */
export function parseMediaKey(raw: unknown): MediaKey | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(KEY_RE);
  if (!m) return null;
  const key: MediaKey = { type: m[1] as MediaType, tmdbId: Number(m[2]) };
  if (m[3] !== undefined) {
    key.season = Number(m[3]);
    key.episode = Number(m[4]);
  }
  return key;
}

/** `/movie/634649` or `/series/66732` (optionally `?s=4`). */
export function mediaHref(type: MediaType, tmdbId: number, season?: number): string {
  if (type === "movie") return `/movie/${tmdbId}`;
  return season ? `/series/${tmdbId}?s=${season}` : `/series/${tmdbId}`;
}
