import "server-only";
import { copy } from "@/lib/copy-vi";
import type { MediaKey } from "@/lib/catalog/media-key";
import { fetchMovieRaw, fetchTvRaw } from "@/lib/tmdb/tmdb-detail-fetch";

/**
 * "Trò Chơi Con Mực S2 T3" / "Hành Tinh Cát: Phần Hai" for admin rows (watching now, activity) — the cached TMDB
 * detail (3 d) only; a failed lookup degrades to the bare key so admin pages never fail on TMDB.
 */
export async function titleLabel(key: MediaKey): Promise<string> {
  let name = `${key.type}:${key.tmdbId}`;
  try {
    name = key.type === "movie" ? (await fetchMovieRaw(key.tmdbId)).title : (await fetchTvRaw(key.tmdbId)).name;
  } catch (err) {
    console.warn("[admin] title lookup failed", key, err instanceof Error ? err.message : err);
  }
  const ep = key.season !== undefined && key.episode !== undefined && key.episode > 0 ? ` ${copy.stremio.episode(key.season, key.episode)}` : "";
  return `${name}${ep}`;
}
