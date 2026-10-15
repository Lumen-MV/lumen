"use client";
import { useCallback } from "react";
import { ErrorBox } from "@/components/ui/error-box";
import { copy } from "@/lib/copy-vi";
import type { SearchType } from "@/lib/tmdb/catalog-queries-browse";
import type { PageResult } from "@/lib/tmdb/catalog-types";
import { MediaGrid } from "./media-grid";
import { usePagedFetch } from "./use-paged-fetch";

/** `/search` grid: server renders page 1, further pages stream in through /api/catalog/search. */
export function SearchResultsGrid({ q, type, initial }: { q: string; type: SearchType; initial: PageResult }) {
  const urlForPage = useCallback((page: number) => `/api/catalog/search?q=${encodeURIComponent(q)}&type=${type}&page=${page}`, [q, type]);
  const paged = usePagedFetch(urlForPage, initial);
  return (
    <div className="gridwrap" data-status={paged.status}>
      <MediaGrid items={paged.items} loadingMore={paged.status === "loading-more"} done={paged.done} totalResults={paged.total} onLoadMore={paged.loadMore} />
      {paged.status === "error" && <ErrorBox message={copy.browse.err} onAction={paged.retry} />}
    </div>
  );
}
