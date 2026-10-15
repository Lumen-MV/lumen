import type { MediaType } from "@/lib/catalog/media-key";
import type { OverviewLang } from "./overview-fallback";

/** Slot filled by Phase 3 (title_sources). Absent in Phase 2 → components render nothing for it. */
export type CacheState = "cached" | "uncached";

/** Poster card (rows, grids, search). `cacheState` / `watched` are later-phase slots. */
export type CardItem = {
  mediaKey: string;
  type: MediaType;
  tmdbId: number;
  title: string;
  year: string;
  posterUrl: string | null;
  rating: string;
  genres: string[];
  /** movie release_date / tv first_air_date (ISO) — Top 10 "Mới thêm" badge */
  releaseDate: string;
  /** tv only, from details — "Mùa mới" badge */
  lastAirDate?: string;
  /** precomputed `.tagb` text ("Mới thêm", "Mùa mới") — server pages set it since functions cannot cross to client components */
  badge?: string;
  /** the viewer's my_list / likes membership (stamped by `withUserFlags` in server code) — seeds the hover panel's ＋/👍 first frame */
  saved?: boolean;
  liked?: boolean;
  cacheState?: CacheState;
  watched?: boolean;
};

export type HeroItem = {
  mediaKey: string;
  type: MediaType;
  tmdbId: number;
  title: string;
  logoUrl: string | null;
  backdropUrl: string | null;
  year: string;
  /** "2h 46m" for movies, "5 mùa" for tv */
  runtime: string;
  rating: string;
  age: string;
  overview: string;
  overviewLang: OverviewLang;
  saved: boolean;
  cacheState?: CacheState;
};

export type PageResult = { items: CardItem[]; page: number; totalResults: number; done: boolean };

type DetailCommon = {
  mediaKey: string;
  tmdbId: number;
  title: string;
  originalTitle: string;
  rating: string;
  age: string;
  overview: string;
  overviewLang: OverviewLang;
  backdropUrl: string | null;
  posterUrl: string | null;
  imdbId: string | null;
  castTop10: string[];
  genres: Array<{ id: number; name: string }>;
  trailerKey: string | null;
  recommendations: CardItem[];
};

export type MovieDetail = DetailCommon & {
  type: "movie";
  year: string;
  runtimeMin: number | null;
  directors: string[];
  collection: { id: number; name: string; items: CardItem[] } | null;
};

export type SeasonSummary = { n: number; episodeCount: number; unairedCount: number; airDate: string | null };

export type SeriesDetail = DetailCommon & {
  type: "tv";
  firstYear: string;
  lastYear: string;
  seasonCount: number;
  creators: string[];
  seasons: SeasonSummary[];
};

export type EpisodeItem = { n: number; title: string; overview: string; runtimeMin: number | null; stillUrl: string | null; airDate: string | null; aired: boolean };
