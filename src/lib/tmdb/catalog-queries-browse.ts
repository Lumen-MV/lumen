import "server-only";
import type { MediaType } from "@/lib/catalog/media-key";
import { multiToCardItems, toCardItem } from "./catalog-mappers";
import type { CardItem, PageResult } from "./catalog-types";
import { discoverTmdbParams, MAX_TMDB_PAGE, PAGE_SIZE, type DiscoverFilters } from "./discover-filters";
import { getGenresVi } from "./genres-vi";
import { tmdbFetch } from "./tmdb-client";
import type { TmdbListItem, TmdbPage } from "./tmdb-types";

/** Browse (discover) and search queries. TMDB pages are 20 items and stop at page 500 whatever `total_pages` says; `done` when the last reachable page was served. */
const isDone = (page: TmdbPage, requested: number) => requested >= Math.min(page.total_pages, MAX_TMDB_PAGE) || page.results.length < PAGE_SIZE;

export async function discover(filters: DiscoverFilters): Promise<PageResult> {
  const { path, params } = discoverTmdbParams(filters);
  const [page, genres] = await Promise.all([tmdbFetch<TmdbPage>(path, params, { ttl: "list" }), getGenresVi()]);
  const type: MediaType = filters.type === "movie" ? "movie" : "tv";
  return { items: page.results.map((r) => toCardItem(r, type, genres)), page: filters.page, totalResults: page.total_results, done: isDone(page, filters.page) };
}

export type SearchType = "all" | "movie" | "tv";
export type SearchResult = PageResult & { counts: { all: number; movie: number; tv: number } };

const searchPage = (type: "movie" | "tv", q: string, page: number) =>
  tmdbFetch<TmdbPage>(`/search/${type}`, { query: q, page, include_adult: false }, { ttl: "list" });

/**
 * Search: per-type endpoints give exact movie/tv counts (multi mixes people in). `all` merges page N of both,
 * ordered by TMDB popularity; a type that ran out of pages contributes nothing on later pages.
 */
export async function search(q: string, page = 1, type: SearchType = "all"): Promise<SearchResult> {
  const query = q.trim();
  const genres = await getGenresVi();
  const [m, t] = await Promise.all([searchPage("movie", query, page), searchPage("tv", query, page)]);
  const counts = { all: m.total_results + t.total_results, movie: m.total_results, tv: t.total_results };
  const tagged = (results: TmdbListItem[], media: MediaType) => results.map((r) => ({ ...r, media_type: media }));
  let items: CardItem[];
  let done: boolean;
  if (type === "movie") {
    items = multiToCardItems(tagged(m.results, "movie"), genres);
    done = isDone(m, page);
  } else if (type === "tv") {
    items = multiToCardItems(tagged(t.results, "tv"), genres);
    done = isDone(t, page);
  } else {
    const merged = [...tagged(m.results, "movie"), ...tagged(t.results, "tv")].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    items = multiToCardItems(merged, genres);
    done = isDone(m, page) && isDone(t, page);
  }
  const totalResults = type === "all" ? counts.all : counts[type];
  return { items, page, totalResults, done, counts };
}
