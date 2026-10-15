import "server-only";
import { genreNameVi } from "./genre-names-vi";
import { tmdbFetch } from "./tmdb-client";
import type { TmdbGenre } from "./tmdb-types";

/** Vietnamese genre names (movie ∪ tv) in the mockup wording, cached 30 days. Ids are shared across both lists where they overlap. */
export type GenreMap = Map<number, string>;

const genreList = (type: "movie" | "tv") => tmdbFetch<{ genres: TmdbGenre[] }>(`/genre/${type}/list`, {}, { ttl: "genres" });

export async function getGenresVi(): Promise<GenreMap> {
  const [m, t] = await Promise.all([genreList("movie"), genreList("tv")]);
  return new Map([...m.genres, ...t.genres].map((g) => [g.id, genreNameVi(g.name)]));
}

/** Genre list for the browse filter menus of one media type (movie genres for /movies, tv genres for /series + /anime). */
export async function getGenreOptions(type: "movie" | "tv"): Promise<TmdbGenre[]> {
  const res = await genreList(type);
  return res.genres.map((g) => ({ id: g.id, name: genreNameVi(g.name) }));
}

export function genreNames(ids: number[] | undefined, map: GenreMap): string[] {
  return (ids ?? []).map((id) => map.get(id)).filter((n): n is string => Boolean(n));
}
