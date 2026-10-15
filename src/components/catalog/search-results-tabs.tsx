import Link from "next/link";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import type { SearchType } from "@/lib/tmdb/catalog-queries-browse";

type Props = { q: string; counts: { all: number; movie: number; tv: number }; active: SearchType };

/** `/search` variant of `.fbar`: "Tất cả (n) · Phim lẻ (n) · Phim bộ (n)" chips linking to `?q=&type=`. */
export function SearchResultsTabs({ q, counts, active }: Props) {
  const tabs: Array<[SearchType, string]> = [
    ["all", copy.search.tabAll(counts.all)],
    ["movie", copy.search.tabMovies(counts.movie)],
    ["tv", copy.search.tabSeries(counts.tv)],
  ];
  return (
    <div className="fbar">
      {tabs.map(([type, label]) => (
        <Link key={type} href={`/search?q=${encodeURIComponent(q)}${type === "all" ? "" : `&type=${type}`}`} className={cx("chip", type === active && "on")} aria-current={type === active ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </div>
  );
}
