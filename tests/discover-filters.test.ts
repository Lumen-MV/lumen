import { describe, expect, it } from "vitest";
import { activeFilterCount, discoverTmdbParams, filtersToQueryString, parseDiscoverFilters, yearPresetRange } from "@/lib/tmdb/discover-filters";

const NOW = new Date(Date.UTC(2026, 9, 14));

describe("discover filters", () => {
  it("parses the URL contract with defaults (year=3y, sort=trending)", () => {
    const f = parseDiscoverFilters("movie", new URLSearchParams("year=2020s&genre=16,10751,x,16&sort=top&q4k=1&cached=1&page=3"));
    expect(f).toEqual({ type: "movie", year: "2020s", genres: [16, 10751], sort: "top", q4k: true, cachedOnly: true, page: 3 });
    expect(parseDiscoverFilters("tv", {})).toEqual({ type: "tv", year: "3y", genres: [], sort: "trending", q4k: false, cachedOnly: false, page: 1 });
    expect(parseDiscoverFilters("tv", { year: "bogus", sort: "nope", page: "0" })).toMatchObject({ year: "3y", sort: "trending", page: 1 });
  });

  it("serialises only non-default values and round-trips", () => {
    const f = parseDiscoverFilters("movie", new URLSearchParams("year=3y&sort=trending"));
    expect(filtersToQueryString(f)).toBe("");
    const g = { ...f, year: "this" as const, genres: [16, 10751], sort: "az" as const, q4k: true, cachedOnly: true };
    expect(filtersToQueryString(g)).toBe("?year=this&genre=16%2C10751&sort=az&q4k=1&cached=1");
    expect(parseDiscoverFilters("movie", new URLSearchParams(filtersToQueryString(g)))).toMatchObject({ year: "this", genres: [16, 10751], sort: "az", q4k: true, cachedOnly: true });
    expect(activeFilterCount(g)).toBe(6); // year + 2 genres + sort + q4k + cached
    expect(activeFilterCount(f)).toBe(0);
  });

  it("maps year presets to date ranges", () => {
    expect(yearPresetRange("this", NOW)).toEqual(["2026-01-01", "2026-12-31"]);
    expect(yearPresetRange("3y", NOW)).toEqual(["2023-10-14", "2026-10-14"]);
    expect(yearPresetRange("2020s", NOW)).toEqual(["2020-01-01", "2029-12-31"]);
    expect(yearPresetRange("2010s", NOW)).toEqual(["2010-01-01", "2019-12-31"]);
    expect(yearPresetRange("older", NOW)).toEqual([undefined, "2009-12-31"]);
    expect(yearPresetRange("all", NOW)).toEqual([undefined, undefined]);
  });

  it("builds TMDB discover params (movie: primary_release_date, AND genres, vote_count ≥ 50)", () => {
    const r = discoverTmdbParams(parseDiscoverFilters("movie", new URLSearchParams("year=2010s&genre=16,10751&sort=top&page=2")), NOW);
    expect(r.path).toBe("/discover/movie");
    expect(r.params).toMatchObject({ sort_by: "vote_average.desc", page: 2, "vote_count.gte": 50, include_adult: false, "primary_release_date.gte": "2010-01-01", "primary_release_date.lte": "2019-12-31", with_genres: "16,10751" });
    expect(r.params.with_origin_country).toBeUndefined();
  });

  it("uses first_air_date / name.asc for tv and forces Animation + JP for anime", () => {
    const tv = discoverTmdbParams(parseDiscoverFilters("tv", new URLSearchParams("sort=az&year=all")), NOW);
    expect(tv.path).toBe("/discover/tv");
    expect(tv.params).toMatchObject({ sort_by: "name.asc" });
    expect(tv.params["first_air_date.gte"]).toBeUndefined();
    const newest = discoverTmdbParams(parseDiscoverFilters("tv", new URLSearchParams("sort=newest")), NOW);
    expect(newest.params.sort_by).toBe("first_air_date.desc");
    const anime = discoverTmdbParams(parseDiscoverFilters("anime", new URLSearchParams("genre=16,35")), NOW);
    expect(anime.params).toMatchObject({ with_genres: "16,35", with_origin_country: "JP" });
  });
});
