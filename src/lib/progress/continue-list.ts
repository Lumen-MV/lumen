import "server-only";
import { formatMediaKey, type MediaKey } from "@/lib/catalog/media-key";
import { copy } from "@/lib/copy-vi";
import type { ContinueItem } from "@/lib/play/player-manifest-types";
import { createLimiter } from "@/lib/tmdb/limit-concurrency";
import { fetchMovieRaw, fetchTvRaw } from "@/lib/tmdb/tmdb-detail-fetch";
import { IMG_SIZE, tmdbImageUrl } from "@/lib/tmdb/tmdb-image-url";
import { continueEligible, percentOf } from "./progress-rules";
import { userRows, type ProgressRow } from "./progress-store";

/**
 * "Tiếp tục xem" items (home row, My List, GET /api/progress/continue): one card per title — the newest in-progress
 * row — enriched with the cached TMDB title + backdrop (3-day detail cache, 4 parallel fetches). A title whose TMDB
 * detail fails is skipped, never the whole list.
 */
const CONTINUE_LIMIT = 20;
const limit = createLimiter(4);

export function continueRows(userId: number): ProgressRow[] {
  const seen = new Set<string>();
  const out: ProgressRow[] = [];
  for (const r of userRows(userId)) {
    const titleKey = `${r.mediaType}:${r.tmdbId}`;
    if (seen.has(titleKey)) continue;
    // the newest row of a title decides: a completed latest episode leaves the title out ("Phát tập tiếp" lives on the series page)
    seen.add(titleKey);
    if (continueEligible(r)) out.push(r);
    if (out.length >= CONTINUE_LIMIT) break;
  }
  return out;
}

async function toItem(r: ProgressRow): Promise<ContinueItem> {
  const type = r.mediaType as MediaKey["type"];
  const isTv = type === "tv";
  const { title, backdrop } = isTv
    ? await fetchTvRaw(r.tmdbId).then((d) => ({ title: d.name || d.original_name || "", backdrop: d.backdrop_path }))
    : await fetchMovieRaw(r.tmdbId).then((d) => ({ title: d.title || d.original_title || "", backdrop: d.backdrop_path }));
  const item: ContinueItem = { mediaKey: formatMediaKey(type, r.tmdbId, isTv ? r.season : undefined, isTv ? r.episode : undefined), type, tmdbId: r.tmdbId, title, backdropUrl: tmdbImageUrl(backdrop, IMG_SIZE.wide), percent: percentOf(r.positionS, r.durationS), positionS: r.positionS };
  if (isTv) {
    item.season = r.season;
    item.episode = r.episode;
    item.epLabel = copy.progressUi.epLabel(r.season, r.episode);
  }
  return item;
}

export async function listContinue(userId: number): Promise<ContinueItem[]> {
  const settled = await Promise.allSettled(continueRows(userId).map((r) => limit(() => toItem(r))));
  return settled.flatMap((s) => {
    if (s.status === "fulfilled") return [s.value];
    console.warn("[continue] title skipped", s.reason instanceof Error ? s.reason.message : s.reason);
    return [];
  });
}
