import "server-only";
import { copy } from "@/lib/copy-vi";
import { getMovie, getSeason, getSeries } from "@/lib/tmdb/catalog-queries-detail";
import { isTmdbNotFound, tmdbFetch } from "@/lib/tmdb/tmdb-client";
import { mapWithConcurrency } from "./map-with-concurrency";
import { stremioIdFor, type StremioType } from "./stremio-ids";

/** Meta resource: Vietnamese detail from the cached TMDB detail; series list every aired episode as `videos` (seasons fetched 4 at a time). */
const SEASON_CONCURRENCY = 4;
export type StremioVideo = { id: string; title: string; season: number; episode: number; released?: string; thumbnail?: string; overview?: string };
export type StremioMeta = { id: string; type: StremioType; name: string; poster?: string; background?: string; description?: string; releaseInfo?: string; imdbRating?: string; genres?: string[]; runtime?: string; imdb_id?: string; videos?: StremioVideo[] };

export async function buildMovieMeta(tmdbId: number): Promise<StremioMeta | null> {
  try {
    const d = await getMovie(tmdbId);
    return { id: stremioIdFor("movie", tmdbId), type: "movie", name: d.title, poster: d.posterUrl ?? undefined, background: d.backdropUrl ?? undefined, description: d.overview || copy.stremio.noOverview, releaseInfo: d.year || undefined, imdbRating: d.rating !== "–" ? d.rating : undefined, genres: d.genres.map((g) => g.name), runtime: d.runtimeMin ? copy.stremio.runtime(d.runtimeMin) : undefined, imdb_id: d.imdbId ?? undefined };
  } catch (err) {
    if (isTmdbNotFound(err)) return null;
    throw err;
  }
}

export async function buildSeriesMeta(tmdbId: number): Promise<StremioMeta | null> {
  let d;
  try {
    d = await getSeries(tmdbId);
  } catch (err) {
    if (isTmdbNotFound(err)) return null;
    throw err;
  }
  const videos: StremioVideo[] = [];
  const seasons = await mapWithConcurrency(d.seasons, SEASON_CONCURRENCY, (s) => getSeason(tmdbId, s.n));
  d.seasons.forEach((s, i) => {
    for (const e of seasons[i]?.episodes ?? []) {
      videos.push({ id: stremioIdFor("tv", tmdbId, s.n, e.n), title: e.title || copy.stremio.episode(s.n, e.n), season: s.n, episode: e.n, released: e.airDate ? `${e.airDate}T00:00:00.000Z` : undefined, thumbnail: e.stillUrl ?? undefined, overview: e.overview || undefined });
    }
  });
  const years = d.firstYear && d.lastYear && d.firstYear !== d.lastYear ? `${d.firstYear}-${d.lastYear}` : d.firstYear || undefined;
  return { id: stremioIdFor("tv", tmdbId), type: "series", name: d.title, poster: d.posterUrl ?? undefined, background: d.backdropUrl ?? undefined, description: d.overview || copy.stremio.noOverview, releaseInfo: years, imdbRating: d.rating !== "–" ? d.rating : undefined, genres: d.genres.map((g) => g.name), imdb_id: d.imdbId ?? undefined, videos };
}

type FindResult = { movie_results?: Array<{ id: number }>; tv_results?: Array<{ id: number }> };

/** `tt…` → TMDB id of the requested type (cached 3 d like details); null when TMDB knows nothing. */
export async function tmdbIdForImdb(imdbId: string, type: StremioType): Promise<number | null> {
  const r = await tmdbFetch<FindResult>(`/find/${imdbId}`, { external_source: "imdb_id" }, { ttl: "detail" });
  const hit = type === "movie" ? r.movie_results?.[0] : r.tv_results?.[0];
  return hit?.id ?? null;
}
