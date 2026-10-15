import { formatMediaKey, type MediaKey, type MediaType } from "@/lib/catalog/media-key";

/**
 * Stremio id scheme (pure, client-safe): catalog / meta ids are `lumen:tmdbm{id}` (movie) / `lumen:tmdbt{id}` (series);
 * series videos add `:{season}:{episode}`. The stream / subtitles resources also accept IMDb ids (`tt123[:s:e]`) so the
 * Phase 4 hand-off deep link (`stremio:///detail/movie/tt…`) lands on our streams; the route maps them through TMDB /find.
 */
export const LUMEN_PREFIX = "lumen:";
export type StremioType = "movie" | "series";
export type ParsedStremioId = { kind: "tmdb"; type: MediaType; tmdbId: number; season?: number; episode?: number } | { kind: "imdb"; imdbId: string; season?: number; episode?: number };

export const toStremioType = (type: MediaType): StremioType => (type === "movie" ? "movie" : "series");
export const toMediaType = (type: StremioType): MediaType => (type === "movie" ? "movie" : "tv");

export function stremioIdFor(type: MediaType, tmdbId: number, season?: number, episode?: number): string {
  const base = `${LUMEN_PREFIX}tmdb${type === "movie" ? "m" : "t"}${tmdbId}`;
  return season !== undefined && episode !== undefined ? `${base}:${season}:${episode}` : base;
}

/** Strips a trailing `.json` and decodes; returns null for anything that is not ours or an IMDb id. */
export function parseStremioId(raw: string): ParsedStremioId | null {
  const id = decodeURIComponent(raw.replace(/\.json$/, ""));
  const se = (s?: string, e?: string) => (s !== undefined && e !== undefined && /^\d{1,3}$/.test(s) && /^\d{1,4}$/.test(e) ? { season: Number(s), episode: Number(e) } : {});
  let m = id.match(/^lumen:tmdb([mt])(\d{1,9})(?::(\d+):(\d+))?$/);
  if (m) return { kind: "tmdb", type: m[1] === "m" ? "movie" : "tv", tmdbId: Number(m[2]), ...se(m[3], m[4]) };
  m = id.match(/^(?:lumen:)?(tt\d{5,10})(?::(\d+):(\d+))?$/);
  if (m) return { kind: "imdb", imdbId: m[1], ...se(m[2], m[3]) };
  return null;
}

export function mediaKeyOfParsed(p: Extract<ParsedStremioId, { kind: "tmdb" }>): MediaKey {
  const key: MediaKey = { type: p.type, tmdbId: p.tmdbId };
  if (p.season !== undefined && p.episode !== undefined) Object.assign(key, { season: p.season, episode: p.episode });
  return key;
}

export const mediaKeyStringOfParsed = (p: Extract<ParsedStremioId, { kind: "tmdb" }>): string => formatMediaKey(p.type, p.tmdbId, p.season, p.episode);

/** Stremio appends extras as a path segment (`…/lumen-anime/skip=20.json`); the first segment is the id. Throws URIError on malformed percent-encoding. */
export function splitCatalogPath(rest: string[]): { id: string; extra: Record<string, string> } {
  const id = (rest[0] ?? "").replace(/\.json$/, "");
  const extra: Record<string, string> = {};
  for (const seg of rest.slice(1)) for (const pair of seg.replace(/\.json$/, "").split("&")) {
    const [k, v] = pair.split("=");
    if (k) extra[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return { id, extra };
}
