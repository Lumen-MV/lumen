import { describe, expect, it } from "vitest";
import { daysSince, initialMyListState, matchesFilter, myListReducer, sortItems, visibleItems, type MyListItem } from "@/lib/my-list/my-list-reducers";

/** /my-list state: filter chips, sort menu, bulk selection, remove + restore (undo). */
const item = (n: number, type: "movie" | "tv", title: string, year: string, cached: boolean, addedDaysAgo: number): MyListItem => ({
  mediaKey: `${type}:${n}`, type, tmdbId: n, title, year, posterUrl: null, rating: "8.0", genres: [], releaseDate: `${year}-01-01`, cacheState: cached ? "cached" : "uncached", addedAt: new Date(Date.UTC(2026, 9, 14 - addedDaysAgo)).toISOString(),
});
const items = [item(1, "movie", "Dune 2", "2024", true, 1), item(2, "tv", "Arcane", "2021", false, 2), item(3, "movie", "Đi Tìm Nemo", "2003", true, 3), item(4, "tv", "Shōgun", "2024", true, 0)];

describe("my-list reducers", () => {
  it("filters: all / movie / tv / cached", () => {
    expect(items.filter((i) => matchesFilter(i, "all"))).toHaveLength(4);
    expect(items.filter((i) => matchesFilter(i, "movie")).map((i) => i.tmdbId)).toEqual([1, 3]);
    expect(items.filter((i) => matchesFilter(i, "tv")).map((i) => i.tmdbId)).toEqual([2, 4]);
    expect(items.filter((i) => matchesFilter(i, "cached")).map((i) => i.tmdbId)).toEqual([1, 3, 4]);
  });
  it("sorts: newest added, name A→Z (vi), year desc then name", () => {
    expect(sortItems(items, "added").map((i) => i.tmdbId)).toEqual([4, 1, 2, 3]);
    expect(sortItems(items, "name").map((i) => i.title)).toEqual(["Arcane", "Dune 2", "Đi Tìm Nemo", "Shōgun"]);
    expect(sortItems(items, "year").map((i) => i.tmdbId)).toEqual([1, 4, 2, 3]);
  });
  it("bulk select / remove / restore keep order", () => {
    let s = initialMyListState(items);
    s = myListReducer(s, { type: "bulk", on: true });
    s = myListReducer(s, { type: "toggle-select", mediaKey: "movie:1" });
    s = myListReducer(s, { type: "toggle-select", mediaKey: "tv:2" });
    s = myListReducer(s, { type: "toggle-select", mediaKey: "movie:1" });
    expect(s.selected).toEqual(["tv:2"]);
    s = myListReducer(s, { type: "remove", mediaKeys: ["tv:2"] });
    expect(s.items.map((i) => i.tmdbId)).toEqual([1, 3, 4]);
    expect(s.selected).toEqual([]);
    s = myListReducer(s, { type: "restore", item: items[1], index: 1 });
    expect(s.items.map((i) => i.tmdbId)).toEqual([1, 2, 3, 4]);
    expect(myListReducer(s, { type: "restore", item: items[1], index: 1 }).items).toHaveLength(4); // idempotent
    s = myListReducer(s, { type: "bulk", on: false });
    expect(s.bulk).toBe(false);
    expect(s.selected).toEqual([]);
  });
  it("visibleItems applies filter then sort; daysSince floors whole days", () => {
    let s = initialMyListState(items);
    s = myListReducer(s, { type: "filter", filter: "movie" });
    s = myListReducer(s, { type: "sort", sort: "name" });
    expect(visibleItems(s).map((i) => i.title)).toEqual(["Dune 2", "Đi Tìm Nemo"]);
    const now = Date.UTC(2026, 9, 14, 12);
    expect(daysSince(new Date(Date.UTC(2026, 9, 14)).toISOString(), now)).toBe(0);
    expect(daysSince(new Date(Date.UTC(2026, 9, 11)).toISOString(), now)).toBe(3);
  });
});
