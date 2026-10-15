import { Suspense } from "react";
import { GridSkeleton } from "@/components/ui/skeletons";
import { copy } from "@/lib/copy-vi";
import type { BrowseType } from "@/lib/tmdb/discover-filters";
import { getGenreOptions } from "@/lib/tmdb/genres-vi";
import { BrowseGrid } from "./browse-grid";
import type { GenreOption } from "./filter-dropdowns";
import { PageHeader } from "./page-header";

const TITLE: Record<BrowseType, string> = { movie: copy.browse.movies, tv: copy.browse.series, anime: copy.browse.anime };

/** Server shell for /movies, /series, /anime: page header + genre options (cached 30 d) + client BrowseGrid. */
export async function BrowsePage({ type }: { type: BrowseType }) {
  let genreOptions: GenreOption[] = [];
  try {
    genreOptions = await getGenreOptions(type === "movie" ? "movie" : "tv");
  } catch (err) {
    // the grid still works without the genre menu; its own fetch reports TMDB errors
    console.warn("[browse] genres failed", err instanceof Error ? err.message : err);
  }
  return (
    <main>
      <PageHeader title={TITLE[type]} subtitle={copy.browse.subtitle} />
      <Suspense
        fallback={
          <div className="gridwrap">
            <GridSkeleton n={14} />
          </div>
        }
      >
        <BrowseGrid type={type} genreOptions={genreOptions} />
      </Suspense>
    </main>
  );
}
