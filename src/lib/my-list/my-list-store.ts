import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import type { MediaKey } from "@/lib/catalog/media-key";
import type { MyListItem } from "./my-list-reducers";
import { withCacheState } from "@/lib/sources/title-sources-store";
import { detailToCardItem } from "@/lib/tmdb/catalog-mappers";
import { getGenresVi } from "@/lib/tmdb/genres-vi";
import { createLimiter } from "@/lib/tmdb/limit-concurrency";
import { fetchMovieRaw, fetchTvRaw } from "@/lib/tmdb/tmdb-detail-fetch";

/** /my-list + GET /api/my-list: the user's rows (newest first) as cards with `addedAt` + cache markers; a failed TMDB detail drops that row only. */
const limit = createLimiter(4);

export async function listMyList(userId: number): Promise<MyListItem[]> {
  const rows = getDb().select().from(schema.myList).where(eq(schema.myList.userId, userId)).orderBy(desc(schema.myList.addedAt)).all();
  if (!rows.length) return [];
  const genres = await getGenresVi().catch(() => new Map<number, string>());
  const settled = await Promise.allSettled(
    rows.map((r) =>
      limit(async (): Promise<MyListItem> => {
        const type = r.mediaType as MediaKey["type"];
        const d = type === "movie" ? await fetchMovieRaw(r.tmdbId) : await fetchTvRaw(r.tmdbId);
        return { ...detailToCardItem(d, type, genres), addedAt: r.addedAt.toISOString() };
      }),
    ),
  );
  const items = settled.flatMap((s) => {
    if (s.status === "fulfilled") return [s.value];
    console.warn("[my-list] title skipped", s.reason instanceof Error ? s.reason.message : s.reason);
    return [];
  });
  return withCacheState(items).map((it) => ({ ...it, saved: true }));
}
