/**
 * Browse filter model ⇄ URL query ⇄ TMDB discover params (pure, unit-tested).
 * URL contract: ?year=all|this|3y|2020s|2010s|older&genre=16,10751&sort=trending|newest|top|az&q4k=0|1&cached=0|1&page=1
 * Defaults (omitted from the URL): year=3y, sort=trending, no genres, q4k=0, cached=0, page=1.
 * `q4k` and `cached` are parsed and kept in the URL; their filtering needs title_sources (Phase 3).
 */
export type BrowseType = "movie" | "tv" | "anime";
export const YEAR_PRESETS = ["all", "this", "3y", "2020s", "2010s", "older"] as const;
export const SORT_KEYS = ["trending", "newest", "top", "az"] as const;
export type YearPreset = (typeof YEAR_PRESETS)[number];
export type SortKey = (typeof SORT_KEYS)[number];

export type DiscoverFilters = { type: BrowseType; year: YearPreset; genres: number[]; sort: SortKey; q4k: boolean; cachedOnly: boolean; page: number };

export const DEFAULT_FILTERS: Omit<DiscoverFilters, "type"> = { year: "3y", genres: [], sort: "trending", q4k: false, cachedOnly: false, page: 1 };
export const PAGE_SIZE = 20;
/** TMDB refuses `page` > 500 on every list endpoint regardless of `total_pages`. */
export const MAX_TMDB_PAGE = 500;

type ParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;
const read = (sp: ParamsLike, k: string): string | undefined => {
  if (sp instanceof URLSearchParams) return sp.get(k) ?? undefined;
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
};

export function parseDiscoverFilters(type: BrowseType, sp: ParamsLike): DiscoverFilters {
  const year = read(sp, "year");
  const sort = read(sp, "sort");
  const genres = (read(sp, "genre") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const page = Number(read(sp, "page") ?? 1);
  return {
    type,
    year: (YEAR_PRESETS as readonly string[]).includes(year ?? "") ? (year as YearPreset) : DEFAULT_FILTERS.year,
    genres: [...new Set(genres)],
    sort: (SORT_KEYS as readonly string[]).includes(sort ?? "") ? (sort as SortKey) : DEFAULT_FILTERS.sort,
    q4k: read(sp, "q4k") === "1",
    cachedOnly: read(sp, "cached") === "1",
    page: Number.isInteger(page) && page >= 1 && page <= MAX_TMDB_PAGE ? page : 1,
  };
}

/** Non-default values only → "" or "?year=top&genre=16,10751". `page` is never written (infinite scroll). */
export function filtersToQueryString(f: Omit<DiscoverFilters, "type" | "page"> & { page?: number }): string {
  const sp = new URLSearchParams();
  if (f.year !== DEFAULT_FILTERS.year) sp.set("year", f.year);
  if (f.genres.length) sp.set("genre", f.genres.join(","));
  if (f.sort !== DEFAULT_FILTERS.sort) sp.set("sort", f.sort);
  if (f.q4k) sp.set("q4k", "1");
  if (f.cachedOnly) sp.set("cached", "1");
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Number of non-default filters, shown on the mobile "Lọc (n)" chip and "Áp dụng (n)". */
export function activeFilterCount(f: Omit<DiscoverFilters, "type" | "page">): number {
  return (f.year !== DEFAULT_FILTERS.year ? 1 : 0) + f.genres.length + (f.sort !== DEFAULT_FILTERS.sort ? 1 : 0) + (f.q4k ? 1 : 0) + (f.cachedOnly ? 1 : 0);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Year preset → [gte, lte] ISO dates (undefined = open end). */
export function yearPresetRange(preset: YearPreset, now: Date): [string | undefined, string | undefined] {
  const y = now.getUTCFullYear();
  switch (preset) {
    case "this":
      return [`${y}-01-01`, `${y}-12-31`];
    case "3y":
      return [iso(new Date(Date.UTC(y - 3, now.getUTCMonth(), now.getUTCDate()))), iso(now)];
    case "2020s":
      return ["2020-01-01", "2029-12-31"];
    case "2010s":
      return ["2010-01-01", "2019-12-31"];
    case "older":
      return [undefined, "2009-12-31"];
    default:
      return [undefined, undefined];
  }
}

export type DiscoverRequest = { path: "/discover/movie" | "/discover/tv"; params: Record<string, string | number | boolean | undefined> };

/** Filters → TMDB discover request. Anime = tv discover with Animation (16) + origin JP; genres are AND-ed with ",". */
export function discoverTmdbParams(f: DiscoverFilters, now: Date = new Date()): DiscoverRequest {
  const tv = f.type !== "movie";
  const dateField = tv ? "first_air_date" : "primary_release_date";
  const sortMap: Record<SortKey, string> = { trending: "popularity.desc", newest: `${dateField}.desc`, top: "vote_average.desc", az: tv ? "name.asc" : "title.asc" };
  const [gte, lte] = yearPresetRange(f.year, now);
  const genres = f.type === "anime" ? [16, ...f.genres.filter((g) => g !== 16)] : f.genres;
  return {
    path: tv ? "/discover/tv" : "/discover/movie",
    params: {
      sort_by: sortMap[f.sort],
      page: f.page,
      "vote_count.gte": 50,
      include_adult: false,
      [`${dateField}.gte`]: gte,
      [`${dateField}.lte`]: lte,
      with_genres: genres.length ? genres.join(",") : undefined,
      with_origin_country: f.type === "anime" ? "JP" : undefined,
    },
  };
}
