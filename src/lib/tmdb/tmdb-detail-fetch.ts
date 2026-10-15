import "server-only";
import { resolveOverview, type ResolvedOverview } from "./overview-fallback";
import { tmdbFetch } from "./tmdb-client";
import type { TmdbMovieDetail, TmdbTvDetail } from "./tmdb-types";

/** Raw detail loaders (cached 3 d) shared by hero, rows, detail pages and the hover-panel meta route. */
const MOVIE_APPEND = "images,release_dates,videos,credits,recommendations,similar,external_ids";
const TV_APPEND = "images,content_ratings,videos,aggregate_credits,recommendations,similar,external_ids";
const IMAGE_LANGS = "vi,en,null";

export function fetchMovieRaw(id: number, opts: { scenarioTag?: string } = {}): Promise<TmdbMovieDetail> {
  return tmdbFetch<TmdbMovieDetail>(`/movie/${id}`, { append_to_response: MOVIE_APPEND, include_image_language: IMAGE_LANGS }, { ttl: "detail", ...opts });
}

export function fetchTvRaw(id: number, opts: { scenarioTag?: string } = {}): Promise<TmdbTvDetail> {
  return tmdbFetch<TmdbTvDetail>(`/tv/${id}`, { append_to_response: TV_APPEND, include_image_language: IMAGE_LANGS }, { ttl: "detail", ...opts });
}

/** vi overview or en-US fallback (`/movie|tv/{id}?language=en-US`, minimal payload, cached 3 d). */
export function overviewWithFallback(type: "movie" | "tv", id: number, viOverview: string | undefined): Promise<ResolvedOverview> {
  return resolveOverview(viOverview, async () => {
    const en = await tmdbFetch<{ overview?: string }>(`/${type}/${id}`, {}, { ttl: "detail", language: "en-US" });
    return en.overview;
  });
}
