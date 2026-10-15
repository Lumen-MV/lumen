import "server-only";
import { detailToCardItem } from "@/lib/tmdb/catalog-mappers";
import type { CardItem, PageResult } from "@/lib/tmdb/catalog-types";
import { PAGE_SIZE, yearPresetRange, type DiscoverFilters } from "@/lib/tmdb/discover-filters";
import { getGenresVi } from "@/lib/tmdb/genres-vi";
import { createMemoryCacheStore } from "@/lib/tmdb/memory-cache-store";
import { fetchMovieRaw, fetchTvRaw } from "@/lib/tmdb/tmdb-detail-fetch";
import type { TmdbMovieDetail, TmdbTvDetail } from "@/lib/tmdb/tmdb-types";
import { cachedTitles } from "./title-sources-store";

/**
 * Browse with "Chỉ phim đã cache" on: the source list is title_sources (cached_count > 0, newest cached first) instead of
 * TMDB discover; year / genre / sort filters are applied here from the cached TMDB details (anime = tv + Animation + JP).
 * Details are fetched in batches of ≤ 20 (3 d detail cache) and the filtered list is memoised 10 min per filter set, so
 * page 2, 3… never fan out again.
 */
const MAX_TITLES = 200;
const DETAIL_BATCH = 20;
const ANIMATION_GENRE = 16;
const listMemo = createMemoryCacheStore(50, 10 * 60_000);

type Detail = (TmdbMovieDetail | TmdbTvDetail) & { release_date?: string; first_air_date?: string; origin_country?: string[]; popularity?: number; vote_average?: number; title?: string; name?: string };

function dateOf(d: Detail): string {
  return d.release_date ?? d.first_air_date ?? "";
}

function matches(d: Detail, f: DiscoverFilters, now: Date): boolean {
  const [gte, lte] = yearPresetRange(f.year, now);
  const date = dateOf(d);
  if (gte && date < gte) return false;
  if (lte && date > lte) return false;
  const ids = new Set((d.genres ?? []).map((g) => g.id));
  if (f.type === "anime" && (!ids.has(ANIMATION_GENRE) || !(d.origin_country ?? []).includes("JP"))) return false;
  return f.genres.every((g) => ids.has(g));
}

function sorter(f: DiscoverFilters): (a: Detail, b: Detail) => number {
  switch (f.sort) {
    case "newest":
      return (a, b) => dateOf(b).localeCompare(dateOf(a));
    case "top":
      return (a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0);
    case "az":
      return (a, b) => (a.title ?? a.name ?? "").localeCompare(b.title ?? b.name ?? "", "vi");
    default:
      return (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0);
  }
}

/** Details in sequential batches of ≤ 20 parallel fetches (TMDB per-second limit friendly); failures are skipped. */
async function fetchDetails(type: "movie" | "tv", ids: number[]): Promise<Detail[]> {
  const out: Detail[] = [];
  for (let i = 0; i < ids.length; i += DETAIL_BATCH) {
    const settled = await Promise.allSettled(ids.slice(i, i + DETAIL_BATCH).map((id) => (type === "movie" ? fetchMovieRaw(id) : fetchTvRaw(id))));
    for (const d of settled) if (d.status === "fulfilled") out.push(d.value as Detail);
  }
  return out;
}

export async function discoverCached(f: DiscoverFilters, now = new Date()): Promise<PageResult> {
  const type = f.type === "movie" ? "movie" : "tv";
  const rows = cachedTitles(type).slice(0, MAX_TITLES);
  const memoKey = `${f.type}|${f.year}|${[...f.genres].sort().join(",")}|${f.sort}|${rows.map((r) => r.tmdbId).join(",")}`;
  const hit = listMemo.read<Detail[]>(memoKey);
  let kept: Detail[];
  if (hit) kept = hit.data;
  else {
    kept = (await fetchDetails(type, rows.map((r) => r.tmdbId))).filter((d) => matches(d, f, now));
    if (f.sort !== "trending") kept.sort(sorter(f));
    listMemo.write(memoKey, kept);
  }
  const genres = await getGenresVi();
  const start = (f.page - 1) * PAGE_SIZE;
  const items: CardItem[] = kept.slice(start, start + PAGE_SIZE).map((d) => ({ ...detailToCardItem(d, type, genres), cacheState: "cached" as const }));
  return { items, page: f.page, totalResults: kept.length, done: start + PAGE_SIZE >= kept.length };
}
