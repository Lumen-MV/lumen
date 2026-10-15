"use client";
import { useCallback } from "react";
import { EmptyBox } from "@/components/ui/empty-box";
import { ErrorBox } from "@/components/ui/error-box";
import { GridSkeleton } from "@/components/ui/skeletons";
import { copy } from "@/lib/copy-vi";
import { filtersToQueryString, type BrowseType } from "@/lib/tmdb/discover-filters";
import { FilterBar } from "./filter-bar";
import type { GenreOption } from "./filter-dropdowns";
import { GRID_SKELETON_INITIAL, MediaGrid } from "./media-grid";
import { useBrowseFilters } from "./use-browse-filters";
import { usePagedFetch } from "./use-paged-fetch";

/**
 * Browse body shared by /movies, /series, /anime: FilterBar (URL-synced) + `.gridwrap` with
 * loading (14 skeletons, count "…"), error, empty (+ Xoá lọc), grid + infinite scroll + end message.
 */
export function BrowseGrid({ type, genreOptions }: { type: BrowseType; genreOptions: GenreOption[] }) {
  const { filters, setFilters, clearFilters } = useBrowseFilters(type);
  const qs = filtersToQueryString(filters);
  const urlForPage = useCallback((page: number) => `/api/catalog/discover${qs ? `${qs}&` : "?"}type=${type}&page=${page}`, [qs, type]);
  const paged = usePagedFetch(urlForPage);
  const loading = paged.status === "loading";

  return (
    <>
      <FilterBar filters={filters} genreOptions={genreOptions} count={loading ? null : paged.status === "error" ? null : paged.total} onChange={setFilters} onClear={clearFilters} />
      <div className="gridwrap" data-status={paged.status}>
        {loading && <GridSkeleton n={GRID_SKELETON_INITIAL} />}
        {paged.status === "error" && paged.items.length === 0 && <ErrorBox message={copy.browse.err} onAction={paged.retry} />}
        {paged.status === "ready" && paged.items.length === 0 && <EmptyBox title={copy.browse.emptyTitle} hint={copy.browse.emptyHint} actionLabel={copy.common.clearFilters} onAction={clearFilters} />}
        {paged.items.length > 0 && <MediaGrid items={paged.items} loadingMore={paged.status === "loading-more"} done={paged.done} totalResults={paged.total} onLoadMore={paged.loadMore} />}
        {paged.status === "error" && paged.items.length > 0 && <ErrorBox message={copy.browse.err} onAction={paged.retry} />}
      </div>
    </>
  );
}
