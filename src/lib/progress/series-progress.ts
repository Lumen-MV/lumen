import "server-only";
import type { SeriesProgressDto } from "@/lib/play/player-manifest-types";
import { getSeason } from "@/lib/tmdb/catalog-queries-detail";
import type { SeasonSummary } from "@/lib/tmdb/catalog-types";
import { seriesRows } from "./progress-store";
import { episodeMap, lastCompleted, seriesPrimary, watchedCounts, type AiredMap, type EpisodeProgressRow, type SeasonInfo } from "./series-progress-rules";

/**
 * Series summary for the hero / episode list / season dropdown (GET /api/series/[id]/progress). The aired-episode
 * list of the latest-watched season is fetched (1-day cache) so "Phát tập tiếp" never points at an unaired episode.
 */
export async function airedMapFor(tmdbId: number, rows: EpisodeProgressRow[], seasons: SeasonInfo[]): Promise<AiredMap> {
  const latest = [...rows].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!latest) return {};
  const wanted = new Set<number>([latest.season]);
  const following = seasons.filter((s) => s.n > latest.season).sort((a, b) => a.n - b.n)[0];
  if (following) wanted.add(following.n);
  const aired: AiredMap = {};
  await Promise.all(
    [...wanted].map(async (n) => {
      try {
        const s = await getSeason(tmdbId, n);
        aired[n] = s.episodes.filter((e) => e.aired).map((e) => e.n);
      } catch (err) {
        console.warn("[series progress] season", n, err instanceof Error ? err.message : err);
      }
    }),
  );
  return aired;
}

export async function getSeriesProgress(userId: number, tmdbId: number, seasons: SeasonSummary[]): Promise<SeriesProgressDto> {
  const rows = seriesRows(userId, tmdbId);
  const infos: SeasonInfo[] = seasons.map((s) => ({ n: s.n, episodeCount: s.episodeCount, unairedCount: s.unairedCount }));
  const aired = await airedMapFor(tmdbId, rows, infos);
  const counts = watchedCounts(rows);
  const perSeason: SeriesProgressDto["seasons"] = {};
  for (const s of infos) perSeason[s.n] = { watched: Math.min(counts[s.n] ?? 0, s.episodeCount), total: s.episodeCount };
  return { primary: seriesPrimary(rows, infos, aired), lastCompleted: lastCompleted(rows), seasonCount: infos.length, seasons: perSeason, episodes: episodeMap(rows) };
}
