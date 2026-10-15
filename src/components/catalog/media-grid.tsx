"use client";
import { useEffect, useRef } from "react";
import { GridSkeleton } from "@/components/ui/skeletons";
import { copy } from "@/lib/copy-vi";
import type { CardItem } from "@/lib/tmdb/catalog-types";
import { PosterCard } from "./poster-card";

export const GRID_SKELETON_INITIAL = 14;
export const GRID_SKELETON_MORE = 7;

type Props = { items: CardItem[]; loadingMore: boolean; done: boolean; totalResults: number | null; onLoadMore: () => void };

/**
 * `.grid(cards) + [.grid 7×sk while loading more] + [.endmsg "Đã hết kết quả · N phim"]` + an IntersectionObserver sentinel
 * that asks for the next page. The wrapping `.gridwrap`, skeleton-14, empty and error states belong to the caller.
 */
export function MediaGrid({ items, loadingMore, done, totalResults, onLoadMore }: Props) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onLoadMore(), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [done, onLoadMore, items.length]);

  return (
    <>
      <div className="grid">
        {items.map((it) => (
          <PosterCard key={it.mediaKey} item={it} cached={it.cacheState === "cached"} watched={it.watched} />
        ))}
      </div>
      {loadingMore && (
        <div style={{ marginTop: 12 }} data-loading-more>
          <GridSkeleton n={GRID_SKELETON_MORE} />
        </div>
      )}
      {done && totalResults !== null && <div className="endmsg">{copy.browse.end(totalResults)}</div>}
      {!done && <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} />}
    </>
  );
}

export { GridSkeleton };
