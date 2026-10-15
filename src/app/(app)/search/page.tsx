import { MediaRow } from "@/components/catalog/media-row";
import { PageHeader } from "@/components/catalog/page-header";
import { RefreshErrorBox } from "@/components/catalog/refresh-error-box";
import { SearchPageInput } from "@/components/catalog/search-page-input";
import { SearchResultsGrid } from "@/components/catalog/search-results-grid";
import { SearchResultsTabs } from "@/components/catalog/search-results-tabs";
import { EmptyBox } from "@/components/ui/empty-box";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { withUserFlags } from "@/lib/catalog/user-media-flags";
import { copy } from "@/lib/copy-vi";
import { search, type SearchType } from "@/lib/tmdb/catalog-queries-browse";
import { getTrendingMovieCards } from "@/lib/tmdb/catalog-queries-home";
import { MAX_QUERY, MIN_QUERY } from "@/lib/tmdb/search-query-rules";

export const dynamic = "force-dynamic";
const TYPES: readonly string[] = ["all", "movie", "tv"];

/** /search?q=&type= — short-query / results (tabs + grid) / empty (+ "Đang thịnh hành" row), all per search.html; ≤ 700 px adds its own input. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams;
  const me = await getSessionUser(); // cached per request (the layout already resolved it); null only in theory — the layout redirects
  const flagged = <T extends { mediaKey: string; type: "movie" | "tv"; tmdbId: number }>(items: T[]) => (me ? withUserFlags(me.user.id, items) : items);
  const q = (sp.q ?? "").trim().slice(0, MAX_QUERY);
  const type = (TYPES.includes(sp.type ?? "") ? sp.type : "all") as SearchType;
  const head = (title: string, subtitle?: string) => (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <SearchPageInput q={q} />
    </>
  );

  if (q.length < MIN_QUERY) {
    return (
      <main>
        {head(copy.search.shortTitle)}
        <div className="gridwrap">
          <EmptyBox title={copy.search.shortQuery} hint={copy.search.shortHint} />
        </div>
      </main>
    );
  }

  let result: Awaited<ReturnType<typeof search>>;
  try {
    result = await search(q, 1, type);
  } catch (err) {
    console.warn("[search page]", err instanceof Error ? err.message : err);
    return (
      <main>
        {head(copy.search.pageTitle(q))}
        <div className="gridwrap">
          <RefreshErrorBox message={copy.browse.err} />
        </div>
      </main>
    );
  }

  if (result.items.length === 0) {
    const trending = await getTrendingMovieCards(10).catch(() => []);
    return (
      <main>
        {head(copy.search.pageTitle(q), copy.search.pageCount(0))}
        <div className="gridwrap">
          <EmptyBox title={copy.search.emptyTitle(q)} hint={copy.search.emptyHint} />
        </div>
        {trending.length > 0 && <MediaRow title={copy.search.trending} items={flagged(trending)} seeAllHref="/movies" />}
      </main>
    );
  }

  return (
    <main>
      {head(copy.search.pageTitle(q), copy.search.pageCount(result.counts.all))}
      <SearchResultsTabs q={q} counts={result.counts} active={type} />
      <SearchResultsGrid key={`${q}|${type}`} q={q} type={type} initial={{ ...result, items: flagged(result.items) }} />
    </main>
  );
}
