import "server-only";
import { genresOrParam, topGenreIds } from "@/lib/catalog/for-you";
import { formatMediaKey } from "@/lib/catalog/media-key";
import { getUserMediaFlags, getUserTasteSeeds, withUserFlags } from "@/lib/catalog/user-media-flags";
import { copy } from "@/lib/copy-vi";
import { formatRuntimeEn } from "@/lib/format/time-format";
import { cacheStatesFor, withCacheState } from "@/lib/sources/title-sources-store";
import { movieAgeLabel } from "./age-rating";
import { formatRating, pickLogo, toCardItem, yearOf } from "./catalog-mappers";
import type { CardItem, HeroItem } from "./catalog-types";
import { getGenresVi, type GenreMap } from "./genres-vi";
import { tmdbFetch } from "./tmdb-client";
import { fetchMovieRaw, fetchTvRaw, overviewWithFallback } from "./tmdb-detail-fetch";
import { IMG_SIZE, tmdbImageUrl } from "./tmdb-image-url";
import type { TmdbPage } from "./tmdb-types";

/** Home page data: hero (trending top 5) and the four TMDB rows, each row isolated with allSettled; cache markers come from title_sources (Phase 3). */
const HERO_COUNT = 5;
const TOP10_COUNT = 10;
const ROW_COUNT = 20;

const trendingMovies = () => tmdbFetch<TmdbPage>("/trending/movie/day", {}, { ttl: "list" });

async function heroSlide(r: TmdbPage["results"][number], saved: Set<string>): Promise<HeroItem> {
  const d = await fetchMovieRaw(r.id);
  const { overview, overviewLang } = await overviewWithFallback("movie", d.id, d.overview);
  const mediaKey = formatMediaKey("movie", d.id);
  return {
    mediaKey,
    type: "movie",
    tmdbId: d.id,
    title: d.title || d.original_title || "",
    logoUrl: pickLogo(d.images?.logos),
    backdropUrl: tmdbImageUrl(d.backdrop_path ?? r.backdrop_path, IMG_SIZE.hero),
    year: yearOf(d.release_date),
    runtime: d.runtime ? formatRuntimeEn(d.runtime) : "",
    rating: formatRating(d.vote_average),
    age: movieAgeLabel(d.release_dates),
    overview,
    overviewLang,
    saved: saved.has(mediaKey),
  };
}

/** Trending top 5 with details. A failed detail only drops that slide; the hero fails only when trending fails or no slide survives. */
export async function getHero(userId: number): Promise<HeroItem[]> {
  const trending = await trendingMovies();
  const top = trending.results.slice(0, HERO_COUNT);
  const flags = getUserMediaFlags(userId, top.map((r) => ({ type: "movie" as const, tmdbId: r.id })));
  const settled = await Promise.allSettled(top.map((r) => heroSlide(r, flags.saved)));
  const cacheStates = cacheStatesFor(top.map((r) => ({ type: "movie" as const, tmdbId: r.id })));
  const items = settled.flatMap((s) => (s.status === "fulfilled" ? [{ ...s.value, cacheState: cacheStates.get(s.value.mediaKey) }] : []));
  const failed = settled.flatMap((s) => (s.status === "rejected" ? [s.reason] : []));
  for (const reason of failed) console.warn("[home] hero slide failed", reason instanceof Error ? reason.message : reason);
  if (items.length === 0 && failed.length > 0) throw failed[0];
  return items;
}

async function top10(genres: GenreMap): Promise<CardItem[]> {
  const page = await trendingMovies();
  return page.results.slice(0, TOP10_COUNT).map((r) => toCardItem(r, "movie", genres));
}

/** Trending tv with per-title details so `lastAirDate` can drive the "Mùa mới" badge. Tagged "row" for the tmdb-row-down scenario. */
async function trendingSeries(genres: GenreMap): Promise<CardItem[]> {
  const page = await tmdbFetch<TmdbPage>("/trending/tv/day", {}, { ttl: "list", scenarioTag: "row" });
  return Promise.all(
    page.results.slice(0, ROW_COUNT).map(async (r) => {
      const card = toCardItem(r, "tv", genres);
      try {
        const d = await fetchTvRaw(r.id, { scenarioTag: "row" });
        return { ...card, lastAirDate: d.last_air_date };
      } catch (err) {
        console.warn("[home] tv detail failed", r.id, err instanceof Error ? err.message : err);
        return card;
      }
    }),
  );
}

/** Top-2 genres of the user's likes ∪ my_list ∪ progress → discover (OR); no seeds → /movie/popular. */
async function forYou(userId: number, genres: GenreMap): Promise<CardItem[]> {
  const seeds = getUserTasteSeeds(userId);
  const genreLists = await Promise.all(
    seeds.map(async (s) => {
      try {
        const d = s.type === "movie" ? await fetchMovieRaw(s.tmdbId) : await fetchTvRaw(s.tmdbId);
        return (d.genres ?? []).map((g) => g.id);
      } catch {
        return [];
      }
    }),
  );
  const top = topGenreIds(genreLists, 2);
  const page = top.length
    ? await tmdbFetch<TmdbPage>("/discover/movie", { with_genres: genresOrParam(top), sort_by: "popularity.desc", "vote_count.gte": 50, include_adult: false }, { ttl: "list" })
    : await tmdbFetch<TmdbPage>("/movie/popular", {}, { ttl: "list" });
  return page.results.slice(0, ROW_COUNT).map((r) => toCardItem(r, "movie", genres));
}

async function anime(genres: GenreMap): Promise<CardItem[]> {
  const page = await tmdbFetch<TmdbPage>("/discover/tv", { with_genres: "16", with_origin_country: "JP", sort_by: "popularity.desc", "vote_count.gte": 50, include_adult: false }, { ttl: "list" });
  return page.results.slice(0, ROW_COUNT).map((r) => toCardItem(r, "tv", genres));
}

export type HomeRowKey = "top10Movies" | "trendingSeries" | "forYou" | "anime";
export type HomeRow = { key: HomeRowKey; title: string; items: CardItem[] | null; error: boolean };

/** Rows in mockup order; a failed row carries `error:true` (inline errbox) instead of failing the page. */
export async function getHomeRows(userId: number): Promise<HomeRow[]> {
  // genre map is shared by every row and only feeds hover meta: a failure degrades to empty genre lists, never to four errboxes
  const genresP: Promise<GenreMap> = getGenresVi().catch((err: unknown) => {
    console.warn("[home] genre map failed", err instanceof Error ? err.message : err);
    return new Map<number, string>();
  });
  const defs: Array<[HomeRowKey, () => Promise<CardItem[]>]> = [
    ["top10Movies", async () => top10(await genresP)],
    ["trendingSeries", async () => trendingSeries(await genresP)],
    ["forYou", async () => forYou(userId, await genresP)],
    ["anime", async () => anime(await genresP)],
  ];
  const settled = await Promise.allSettled(defs.map(([, fn]) => fn()));
  return defs.map(([key], i) => {
    const r = settled[i];
    // handled failure (inline errbox) → warn, so the Next dev overlay does not count it as an unhandled issue
    if (r.status === "rejected") console.warn("[home] row failed", key, r.reason instanceof Error ? r.reason.message : r.reason);
    return { key, title: copy.home.rows[key], items: r.status === "fulfilled" ? withCacheState(withUserFlags(userId, r.value)) : null, error: r.status === "rejected" };
  });
}

/** Trending movies as cards ("Đang thịnh hành" row under an empty search). */
export async function getTrendingMovieCards(limit = 10): Promise<CardItem[]> {
  const [page, genres] = await Promise.all([trendingMovies(), getGenresVi()]);
  return page.results.slice(0, limit).map((r) => toCardItem(r, "movie", genres));
}

/** Stremio catalog rows (same TMDB queries as the home rows, no per-user flags). */
export async function getTrendingSeriesCards(limit = ROW_COUNT): Promise<CardItem[]> {
  return (await trendingSeries(await getGenresVi())).slice(0, limit);
}

export async function getAnimeCards(limit = ROW_COUNT): Promise<CardItem[]> {
  return (await anime(await getGenresVi())).slice(0, limit);
}
