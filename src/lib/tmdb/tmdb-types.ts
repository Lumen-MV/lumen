/** Minimal TMDB v3 response shapes (only the fields the catalog reads). */

export type TmdbGenre = { id: number; name: string };

export type TmdbListItem = {
  id: number;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  release_date?: string;
  first_air_date?: string;
  origin_country?: string[];
};

export type TmdbPage<T = TmdbListItem> = { page: number; results: T[]; total_pages: number; total_results: number };

export type TmdbImage = { file_path: string; iso_639_1: string | null; width: number; height: number; vote_average?: number };
export type TmdbVideo = { key: string; site: string; type: string; official?: boolean; iso_639_1?: string };
export type TmdbCast = { id: number; name: string; character?: string; order?: number };
export type TmdbCrew = { id: number; name: string; job?: string };

export type TmdbReleaseDates = { results: Array<{ iso_3166_1: string; release_dates: Array<{ certification: string; type?: number }> }> };
export type TmdbContentRatings = { results: Array<{ iso_3166_1: string; rating: string }> };

export type TmdbSeasonSummary = { season_number: number; episode_count: number; air_date?: string | null; name?: string };

export type TmdbDetailBase = {
  id: number;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: TmdbGenre[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  images?: { logos?: TmdbImage[]; backdrops?: TmdbImage[]; posters?: TmdbImage[] };
  videos?: { results: TmdbVideo[] };
  credits?: { cast: TmdbCast[]; crew: TmdbCrew[] };
  aggregate_credits?: { cast: Array<TmdbCast & { roles?: Array<{ character: string }> }> };
  recommendations?: TmdbPage;
  similar?: TmdbPage;
  external_ids?: { imdb_id?: string | null };
};

export type TmdbMovieDetail = TmdbDetailBase & {
  title: string;
  original_title?: string;
  release_date?: string;
  runtime?: number | null;
  imdb_id?: string | null;
  belongs_to_collection?: { id: number; name: string } | null;
  release_dates?: TmdbReleaseDates;
};

export type TmdbTvDetail = TmdbDetailBase & {
  name: string;
  original_name?: string;
  first_air_date?: string;
  last_air_date?: string;
  number_of_seasons?: number;
  /** newest aired episode — the daily "Tập mới" notification check */
  last_episode_to_air?: { season_number: number; episode_number: number; air_date?: string | null; name?: string } | null;
  number_of_episodes?: number;
  episode_run_time?: number[];
  seasons?: TmdbSeasonSummary[];
  content_ratings?: TmdbContentRatings;
  created_by?: Array<{ id: number; name: string }>;
};

export type TmdbEpisode = {
  episode_number: number;
  name: string;
  overview?: string;
  runtime?: number | null;
  still_path?: string | null;
  air_date?: string | null;
};

export type TmdbSeason = { id: number; season_number: number; name?: string; episodes: TmdbEpisode[] };

export type TmdbCollection = { id: number; name: string; parts: TmdbListItem[] };
