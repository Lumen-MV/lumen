import "server-only";
import type { MediaType } from "@/lib/catalog/media-key";
import { copy } from "@/lib/copy-vi";
import { detailToCardItem } from "@/lib/tmdb/catalog-mappers";
import type { CardItem } from "@/lib/tmdb/catalog-types";
import { getGenresVi } from "@/lib/tmdb/genres-vi";
import { fetchMovieRaw, fetchTvRaw } from "@/lib/tmdb/tmdb-detail-fetch";
import { newInCache } from "./title-sources-store";

/** Home "Mới thêm vào cache": title_sources rows with `first_cached_at` ≤ 7 d (badge "Mới" ≤ 3 d), details from the cached TMDB rows. */
export const NEW_IN_CACHE_DAYS = 7;
export const NEW_BADGE_DAYS = 3;
const DAY_MS = 86_400_000;

export async function getNewInCacheRow(limit = 20, now = new Date()): Promise<CardItem[]> {
  const rows = newInCache(NEW_IN_CACHE_DAYS, limit, now);
  if (!rows.length) return [];
  const genres = await getGenresVi().catch(() => new Map<number, string>());
  const settled = await Promise.allSettled(
    rows.map(async (r) => {
      const type = r.mediaType as MediaType;
      const d = type === "movie" ? await fetchMovieRaw(r.tmdbId) : await fetchTvRaw(r.tmdbId);
      const card = detailToCardItem(d, type, genres);
      const fresh = r.firstCachedAt ? now.getTime() - r.firstCachedAt.getTime() <= NEW_BADGE_DAYS * DAY_MS : false;
      return { ...card, cacheState: "cached" as const, badge: fresh ? copy.home.badges.new : undefined };
    }),
  );
  return settled.flatMap((s) => (s.status === "fulfilled" && s.value.posterUrl ? [s.value] : []));
}
