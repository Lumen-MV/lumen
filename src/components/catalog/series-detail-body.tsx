import { notFound } from "next/navigation";
import { SourcesProvider } from "@/components/sources/sources-provider";
import { getUserMediaFlags, withUserFlags } from "@/lib/catalog/user-media-flags";
import { copy } from "@/lib/copy-vi";
import { getSeriesProgress } from "@/lib/progress/series-progress";
import { withCacheState } from "@/lib/sources/title-sources-store";
import { getSeason, getSeries } from "@/lib/tmdb/catalog-queries-detail";
import type { SeriesDetail } from "@/lib/tmdb/catalog-types";
import { isTmdbNotFound } from "@/lib/tmdb/tmdb-client";
import { getUserSettings } from "@/lib/users/user-settings";
import { DetailHero } from "./detail-hero";
import { DetailKvColumn } from "./detail-kv-column";
import { MediaRow } from "./media-row";
import { RefreshErrorBox } from "./refresh-error-box";
import { SeriesEpisodesSection } from "./series-episodes-section";
import { SeriesFacts, SeriesPrimaryButton, SeriesWatchingKv } from "./series-progress-hero";
import { SeriesProgressProvider } from "./series-progress-provider";

type Props = { id: number; userId: number; /** `?s=` as parsed by the page (null → the progress primary's season) */ requestedSeason: number | null; /** `?e=` (picker / QR deep link) */ requestedEpisode: number | null };

/**
 * Streamed body of /series/[id]?s=N (server component inside the page's Suspense): 520px hero (`.detail.series`) whose
 * primary / facts / kv follow the viewer's progress (Phát S1 T1 · Tiếp tục S4 T1 · Phát tập tiếp S4 T2 · Xem lại S1 T1),
 * "📺 Xem bằng app" / "Chọn bản khác" act on the highlighted episode, "Tập" section (season dropdown with watched counts,
 * episode rows with progress bars / "Đã xem ✓" / cache chips + ⋯ menu), "Phim bộ tương tự".
 */
export async function SeriesDetailBody({ id, userId, requestedSeason, requestedEpisode }: Props) {
  let series: SeriesDetail;
  try {
    series = await getSeries(id);
  } catch (err) {
    if (isTmdbNotFound(err)) notFound();
    console.warn("[series page]", err instanceof Error ? err.message : err);
    return (
      <main style={{ padding: "120px var(--pad) 40px" }}>
        <RefreshErrorBox message={copy.home.errCatalog} />
      </main>
    );
  }
  const progress = await getSeriesProgress(userId, id, series.seasons);
  const primary = progress.primary;
  const season = requestedSeason && series.seasons.some((s) => s.n === requestedSeason) ? requestedSeason : primary.season;
  // the highlighted episode: `?e=` when given, else the primary's target when it lives in the shown season, else T1
  const episode = requestedEpisode ?? (season === primary.season ? primary.episode : 1);
  // season rows are server-rendered for the first paint; a failure just lets the client section fetch + retry
  const initialData = await getSeason(id, season).catch((err) => {
    console.warn("[series page] season", err instanceof Error ? err.message : err);
    return null;
  });
  const flags = getUserMediaFlags(userId, [{ type: "tv", tmdbId: series.tmdbId }]);
  const settings = getUserSettings(userId);
  return (
    <main data-imdb-id={series.imdbId ?? undefined} data-media-key={series.mediaKey}>
      <SeriesProgressProvider seriesId={id} initial={progress}>
      <SourcesProvider type="tv" tmdbId={series.tmdbId} title={series.title} initialShow4k={settings.show_4k || settings.quality === "2160p"} initialEpisode={{ season, episode }}>
        <DetailHero
          media={series}
          variant="series"
          primary={<SeriesPrimaryButton />}
          facts={<SeriesFacts />}
          factItems={
            <>
              <span>{copy.series.years(series.firstYear, series.lastYear)}</span>
              <span>{copy.series.seasons(series.seasonCount)}</span>
              <span className="pill">{copy.tags.hd}</span>
              <span className="pill">{series.age}</span>
              <span>{copy.detail.imdb(series.rating)}</span>
            </>
          }
          kv={<DetailKvColumn cast={series.castTop10} genres={series.genres} genreBrowsePath="/series" originalTitle={series.originalTitle} showWatching watching={<SeriesWatchingKv />} />}
          saved={flags.saved.has(series.mediaKey)}
          liked={flags.liked.has(series.mediaKey)}
        />
        {/* keyed by series id only: a season switch stays client-side; a different series must not inherit this one's state */}
        <SeriesEpisodesSection key={id} seriesId={id} seasons={series.seasons} initialSeason={season} initialData={initialData} />
      </SourcesProvider>
      </SeriesProgressProvider>
      {series.recommendations.length > 0 && <MediaRow title={copy.detail.similarSeries} items={withCacheState(withUserFlags(userId, series.recommendations))} />}
    </main>
  );
}
