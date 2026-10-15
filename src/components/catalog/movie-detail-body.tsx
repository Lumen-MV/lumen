import { notFound } from "next/navigation";
import { BestSourceLabel } from "@/components/sources/best-source-label";
import { DetailFactsSource } from "@/components/sources/detail-facts-source";
import { DetailPrimaryButton } from "@/components/sources/detail-primary-button";
import { SourcesProvider } from "@/components/sources/sources-provider";
import { getUserMediaFlags, withUserFlags } from "@/lib/catalog/user-media-flags";
import { copy } from "@/lib/copy-vi";
import { formatRuntimeEn } from "@/lib/format/time-format";
import { getProgress, resumeInfo } from "@/lib/progress/progress-store";
import { withCacheState } from "@/lib/sources/title-sources-store";
import { getMovie } from "@/lib/tmdb/catalog-queries-detail";
import type { MovieDetail } from "@/lib/tmdb/catalog-types";
import { isTmdbNotFound } from "@/lib/tmdb/tmdb-client";
import { getUserSettings } from "@/lib/users/user-settings";
import { DetailHero } from "./detail-hero";
import { DetailKvColumn } from "./detail-kv-column";
import { MediaRow } from "./media-row";
import { RefreshErrorBox } from "./refresh-error-box";

/**
 * Streamed body of /movie/[id] (server component inside the page's Suspense): detail hero whose primary / facts /
 * "Nguồn tốt nhất" come from the client SourcesProvider (/api/sources), kv column, collection + similar rows.
 * The page already proved the id exists (HTTP 404 otherwise); a TMDB outage here renders the errbox.
 */
export async function MovieDetailBody({ id, userId }: { id: number; userId: number }) {
  let movie: MovieDetail;
  try {
    movie = await getMovie(id);
  } catch (err) {
    if (isTmdbNotFound(err)) notFound();
    console.warn("[movie page]", err instanceof Error ? err.message : err);
    return (
      <main style={{ padding: "120px var(--pad) 40px" }}>
        <RefreshErrorBox message={copy.home.errCatalog} />
      </main>
    );
  }
  const flags = getUserMediaFlags(userId, [{ type: "movie", tmdbId: movie.tmdbId }]);
  const settings = getUserSettings(userId);
  // detail `resume` state: an in-progress row (30 s … 95 %) turns the primary into "▶ Tiếp tục · h:mm:ss" + "Xem từ đầu"
  const resume = resumeInfo(getProgress(userId, { type: "movie", tmdbId: movie.tmdbId }));
  const cards = (items: MovieDetail["recommendations"]) => withCacheState(withUserFlags(userId, items));
  return (
    <main data-imdb-id={movie.imdbId ?? undefined} data-media-key={movie.mediaKey}>
      <SourcesProvider type="movie" tmdbId={movie.tmdbId} title={movie.title} initialShow4k={settings.show_4k || settings.quality === "2160p"} resume={resume ? { positionS: resume.positionS } : null}>
        <DetailHero
          media={movie}
          primary={<DetailPrimaryButton />}
          facts={<DetailFactsSource />}
          factItems={
            <>
              <span>{movie.year}</span>
              {movie.runtimeMin ? <span>{formatRuntimeEn(movie.runtimeMin)}</span> : null}
              <span className="pill">{copy.tags.hd}</span>
              <span className="pill">{movie.age}</span>
              <span>{copy.detail.imdb(movie.rating)}</span>
            </>
          }
          kv={<DetailKvColumn cast={movie.castTop10} directors={movie.directors} genres={movie.genres} genreBrowsePath="/movies" originalTitle={movie.originalTitle} bestSource={<BestSourceLabel />} />}
          saved={flags.saved.has(movie.mediaKey)}
          liked={flags.liked.has(movie.mediaKey)}
        />
      </SourcesProvider>
      {movie.collection && movie.collection.items.length > 0 && <MediaRow title={copy.detail.collection(movie.collection.name)} items={cards(movie.collection.items)} />}
      {movie.recommendations.length > 0 && <MediaRow title={copy.detail.similar} items={cards(movie.recommendations)} />}
    </main>
  );
}
