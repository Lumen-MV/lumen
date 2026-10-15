import "server-only";
import { listMyList } from "@/lib/my-list/my-list-store";
import { getAnimeCards, getTrendingMovieCards, getTrendingSeriesCards } from "@/lib/tmdb/catalog-queries-home";
import type { CardItem } from "@/lib/tmdb/catalog-types";
import { CATALOG_IDS, type CatalogId } from "./stremio-manifest";
import { stremioIdFor, toStremioType, type StremioType } from "./stremio-ids";

/** Catalog resource: the same TMDB rows as the web home (Vietnamese, 20 items, cached) + the viewer's My List. */
export type MetaPreview = { id: string; type: StremioType; name: string; poster?: string; posterShape: "poster"; releaseInfo?: string; imdbRating?: string; genres?: string[] };
const ROW = 20;

export function cardToMetaPreview(c: CardItem): MetaPreview {
  return { id: stremioIdFor(c.type, c.tmdbId), type: toStremioType(c.type), name: c.title, poster: c.posterUrl ?? undefined, posterShape: "poster", releaseInfo: c.year || undefined, imdbRating: c.rating !== "–" ? c.rating : undefined, genres: c.genres.length ? c.genres : undefined };
}

export async function buildCatalog(id: CatalogId, type: StremioType, userId: number, skip = 0): Promise<MetaPreview[]> {
  if (skip > 0) return []; // one page of 20 per row, like the web home
  let cards: CardItem[];
  switch (id) {
    case CATALOG_IDS.trendingMovie:
      cards = type === "movie" ? await getTrendingMovieCards(ROW) : [];
      break;
    case CATALOG_IDS.trendingSeries:
      cards = type === "series" ? await getTrendingSeriesCards(ROW) : [];
      break;
    case CATALOG_IDS.anime:
      cards = type === "series" ? await getAnimeCards(ROW) : [];
      break;
    case CATALOG_IDS.myList:
      cards = (await listMyList(userId)).filter((c) => toStremioType(c.type) === type);
      break;
  }
  return cards.map(cardToMetaPreview);
}
