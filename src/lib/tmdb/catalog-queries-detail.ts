import "server-only";
import { formatMediaKey, type MediaKey } from "@/lib/catalog/media-key";
import { copy } from "@/lib/copy-vi";
import { formatRuntimeEn } from "@/lib/format/time-format";
import { movieAgeLabel, tvAgeLabel } from "./age-rating";
import { formatRating, pickTrailerKey, toCardItem, yearOf } from "./catalog-mappers";
import type { CardItem, EpisodeItem, MovieDetail, SeriesDetail } from "./catalog-types";
import { genreNameVi } from "./genre-names-vi";
import { getGenresVi, type GenreMap } from "./genres-vi";
import { isTmdbNotFound, tmdbFetch } from "./tmdb-client";
import { fetchMovieRaw, fetchTvRaw, overviewWithFallback } from "./tmdb-detail-fetch";
import { IMG_SIZE, tmdbImageUrl } from "./tmdb-image-url";
import type { TmdbCollection, TmdbDetailBase, TmdbGenre, TmdbSeason } from "./tmdb-types";

/** Movie / series / season / hover-meta queries. 404 from TMDB propagates as TmdbError(404) → page notFound(). */
const CAST_TOP = 10;
const ROW_COUNT = 20;

/** Detail `genres:[{id,name}]` in the mockup's Vietnamese wording. */
const viGenres = (genres: TmdbGenre[] | undefined): TmdbGenre[] => (genres ?? []).map((g) => ({ id: g.id, name: genreNameVi(g.name) }));

/**
 * Cheap existence probe for detail pages (same cached detail call the body reuses): throws TmdbError(404) for unknown ids
 * BEFORE any streamed boundary so the response is a real 404; other failures are swallowed — the body renders the errbox.
 */
export async function assertTitleExists(type: MediaKey["type"], id: number): Promise<void> {
  try {
    if (type === "movie") await fetchMovieRaw(id);
    else await fetchTvRaw(id);
  } catch (err) {
    if (isTmdbNotFound(err)) throw err;
  }
}

/** `recommendations` first, `similar` when TMDB has none. */
function relatedCards(d: TmdbDetailBase, type: MediaKey["type"], genres: GenreMap): CardItem[] {
  const list = d.recommendations?.results?.length ? d.recommendations.results : (d.similar?.results ?? []);
  return list.slice(0, ROW_COUNT).map((r) => toCardItem(r, type, genres));
}

export async function getMovie(id: number): Promise<MovieDetail> {
  const [d, genres] = await Promise.all([fetchMovieRaw(id), getGenresVi()]);
  const { overview, overviewLang } = await overviewWithFallback("movie", id, d.overview);
  let collection: MovieDetail["collection"] = null;
  if (d.belongs_to_collection) {
    try {
      const c = await tmdbFetch<TmdbCollection>(`/collection/${d.belongs_to_collection.id}`, {}, { ttl: "detail" });
      collection = { id: c.id, name: c.name, items: c.parts.filter((p) => p.poster_path).map((p) => toCardItem(p, "movie", genres)) };
    } catch (err) {
      console.warn("[detail] collection failed", d.belongs_to_collection.id, err instanceof Error ? err.message : err);
    }
  }
  return {
    type: "movie",
    mediaKey: formatMediaKey("movie", d.id),
    tmdbId: d.id,
    title: d.title || d.original_title || "",
    originalTitle: d.original_title ?? "",
    year: yearOf(d.release_date),
    runtimeMin: d.runtime ?? null,
    rating: formatRating(d.vote_average),
    age: movieAgeLabel(d.release_dates),
    overview,
    overviewLang,
    backdropUrl: tmdbImageUrl(d.backdrop_path, IMG_SIZE.original),
    posterUrl: tmdbImageUrl(d.poster_path, IMG_SIZE.poster),
    imdbId: d.imdb_id ?? d.external_ids?.imdb_id ?? null,
    castTop10: (d.credits?.cast ?? []).slice(0, CAST_TOP).map((c) => c.name),
    directors: (d.credits?.crew ?? []).filter((c) => c.job === "Director").map((c) => c.name),
    genres: viGenres(d.genres),
    trailerKey: pickTrailerKey(d.videos?.results),
    collection,
    recommendations: relatedCards(d, "movie", genres),
  };
}

export async function getSeries(id: number): Promise<SeriesDetail> {
  const [d, genres] = await Promise.all([fetchTvRaw(id), getGenresVi()]);
  const { overview, overviewLang } = await overviewWithFallback("tv", id, d.overview);
  const today = new Date().toISOString().slice(0, 10);
  const seasons = (d.seasons ?? [])
    .filter((s) => s.season_number > 0)
    .map((s) => ({ n: s.season_number, episodeCount: s.episode_count, unairedCount: s.air_date && s.air_date > today ? s.episode_count : 0, airDate: s.air_date ?? null }));
  return {
    type: "tv",
    mediaKey: formatMediaKey("tv", d.id),
    tmdbId: d.id,
    title: d.name || d.original_name || "",
    originalTitle: d.original_name ?? "",
    firstYear: yearOf(d.first_air_date),
    lastYear: yearOf(d.last_air_date) || yearOf(d.first_air_date),
    seasonCount: seasons.length || d.number_of_seasons || 0,
    rating: formatRating(d.vote_average),
    age: tvAgeLabel(d.content_ratings),
    overview,
    overviewLang,
    backdropUrl: tmdbImageUrl(d.backdrop_path, IMG_SIZE.original),
    posterUrl: tmdbImageUrl(d.poster_path, IMG_SIZE.poster),
    imdbId: d.external_ids?.imdb_id ?? null,
    castTop10: (d.aggregate_credits?.cast ?? d.credits?.cast ?? []).slice(0, CAST_TOP).map((c) => c.name),
    creators: (d.created_by ?? []).map((c) => c.name),
    genres: viGenres(d.genres),
    trailerKey: pickTrailerKey(d.videos?.results),
    seasons,
    recommendations: relatedCards(d, "tv", genres),
  };
}

/** Season episodes (cached 1 d). `aired=false` + air date drive the dimmed "Phát sóng dd/mm" rows; unaired count feeds the dropdown. */
export async function getSeason(seriesId: number, n: number): Promise<{ episodes: EpisodeItem[]; unairedCount: number }> {
  const s = await tmdbFetch<TmdbSeason>(`/tv/${seriesId}/season/${n}`, {}, { ttl: "season" });
  const today = new Date().toISOString().slice(0, 10);
  const episodes = (s.episodes ?? []).map((e) => ({
    n: e.episode_number,
    title: e.name || "",
    overview: e.overview ?? "",
    runtimeMin: e.runtime ?? null,
    stillUrl: tmdbImageUrl(e.still_path, IMG_SIZE.still),
    airDate: e.air_date ?? null,
    aired: Boolean(e.air_date && e.air_date <= today),
  }));
  return { episodes, unairedCount: episodes.filter((e) => !e.aired).length };
}

/** Hover-panel meta (year · runtime | "N mùa" · ★ rating + genres) for a card; one cached detail call per title. */
export type TitleMeta = { year: string; runtime: string; rating: string; genres: string[]; /** "vi" when TMDB has a Vietnamese overview, else "en" */ overviewLang: "vi" | "en" };
/** What /api/catalog/meta answers: meta + the caller's my_list / likes membership (so the panel seeds ＋/👍 from the server). */
export type TitleMetaResponse = TitleMeta & { saved: boolean; liked: boolean };

export async function getTitleMeta(key: MediaKey): Promise<TitleMeta> {
  if (key.type === "movie") {
    const d = await fetchMovieRaw(key.tmdbId);
    return { year: yearOf(d.release_date), runtime: d.runtime ? formatRuntimeEn(d.runtime) : "", rating: formatRating(d.vote_average), genres: viGenres(d.genres).map((g) => g.name), overviewLang: d.overview?.trim() ? "vi" : "en" };
  }
  const d = await fetchTvRaw(key.tmdbId);
  const seasons = (d.seasons ?? []).filter((s) => s.season_number > 0).length || d.number_of_seasons || 0;
  return { year: yearOf(d.first_air_date), runtime: copy.series.seasons(seasons), rating: formatRating(d.vote_average), genres: viGenres(d.genres).map((g) => g.name), overviewLang: d.overview?.trim() ? "vi" : "en" };
}

