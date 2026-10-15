import { formatMediaKey, type MediaType } from "@/lib/catalog/media-key";
import type { CardItem } from "./catalog-types";
import { genreNames, type GenreMap } from "./genres-vi";
import { IMG_SIZE, tmdbImageUrl } from "./tmdb-image-url";
import type { TmdbDetailBase, TmdbImage, TmdbListItem, TmdbVideo } from "./tmdb-types";

/** Pure raw-TMDB → app model helpers shared by the catalog query modules. */

export const formatRating = (v: number | undefined | null): string => (v && v > 0 ? v.toFixed(1) : "–");
export const yearOf = (date: string | undefined | null): string => (date ?? "").slice(0, 4);

export function toCardItem(raw: TmdbListItem, type: MediaType, genres: GenreMap): CardItem {
  const date = (type === "movie" ? raw.release_date : raw.first_air_date) ?? "";
  return {
    mediaKey: formatMediaKey(type, raw.id),
    type,
    tmdbId: raw.id,
    title: (type === "movie" ? raw.title : raw.name) || raw.original_title || raw.original_name || "",
    year: yearOf(date),
    posterUrl: tmdbImageUrl(raw.poster_path, IMG_SIZE.card),
    rating: formatRating(raw.vote_average),
    genres: genreNames(raw.genre_ids, genres),
    releaseDate: date,
  };
}

/** Detail objects carry `genres:[{id,name}]` instead of `genre_ids`; normalise before mapping. */
export function detailToCardItem(raw: TmdbDetailBase & { title?: string; name?: string; release_date?: string; first_air_date?: string }, type: MediaType, genres: GenreMap): CardItem {
  return toCardItem({ ...raw, genre_ids: (raw.genres ?? []).map((g) => g.id) }, type, genres);
}

/** Search/multi results: keep movie + tv, drop people and items without a poster-worthy title. */
export function multiToCardItems(results: TmdbListItem[], genres: GenreMap): CardItem[] {
  return results.filter((r) => r.media_type === "movie" || r.media_type === "tv").map((r) => toCardItem(r, r.media_type as MediaType, genres));
}

/** Hero title treatment: vi logo, then en, then language-less; null → render text h1. */
export function pickLogo(logos: TmdbImage[] | undefined): string | null {
  if (!logos?.length) return null;
  const byLang = (lang: string | null) => logos.find((l) => l.iso_639_1 === lang);
  const chosen = byLang("vi") ?? byLang("en") ?? byLang(null) ?? null;
  return chosen ? tmdbImageUrl(chosen.file_path, IMG_SIZE.logo) : null;
}

/** First official YouTube trailer (any language), else any YouTube trailer, else null. */
export function pickTrailerKey(videos: TmdbVideo[] | undefined): string | null {
  const yt = (videos ?? []).filter((v) => v.site === "YouTube" && v.type === "Trailer");
  return (yt.find((v) => v.official) ?? yt[0])?.key ?? null;
}

export const DAY_MS = 86_400_000;
/** true when `date` (ISO) is within the last `days` days (inclusive) relative to `now`. */
export function withinLastDays(date: string | undefined | null, days: number, now: Date = new Date()): boolean {
  if (!date) return false;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= 0 && age <= days * DAY_MS;
}
