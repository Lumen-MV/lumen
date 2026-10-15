"use client";
import Link from "next/link";
import { onActivate } from "@/components/ui/activate-key";
import { copy } from "@/lib/copy-vi";
import { mediaHref } from "@/lib/catalog/media-key";
import type { CardItem } from "@/lib/tmdb/catalog-types";
import { highlightMatch } from "@/lib/tmdb/search-highlight";

/** `.sov .dd` contents: results (`.r img + title<mark> + .y`), "Xem tất cả", empty message, or recent searches. */

type ResultsProps = { items: CardItem[]; query: string; total: number; onPick: () => void; onSeeAll: () => void };

export function SearchOverlayResults({ items, query, total, onPick, onSeeAll }: ResultsProps) {
  return (
    <div className="dd">
      {items.map((it) => (
        <div className="r" key={it.mediaKey}>
          <Link href={mediaHref(it.type, it.tmdbId)} onClick={onPick}>
            {it.posterUrl ? <img src={it.posterUrl} alt="" loading="lazy" /> : <span className="skimg" style={{ width: 34, height: 50 }} />}
            <div>
              <div>{highlightMatch(it.title, query).map((seg, i) => (seg.match ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>))}</div>
              <div className="y">{copy.search.resultMeta(it.year, it.type === "movie" ? copy.search.movie : copy.search.series, it.rating)}</div>
            </div>
          </Link>
        </div>
      ))}
      <div className="more" role="button" tabIndex={0} onClick={onSeeAll} onKeyDown={onActivate(onSeeAll)}>
        {copy.search.seeAll(total)}
      </div>
    </div>
  );
}

export function SearchOverlayEmpty({ query }: { query: string }) {
  return (
    <div className="dd">
      <div className="r" style={{ color: "#aaa", padding: "14px 12px" }}>
        {copy.search.empty(query)}
      </div>
    </div>
  );
}

type RecentProps = { recent: string[]; onPick: (q: string) => void; onRemove: (q: string) => void; onClear: () => void };

export function SearchOverlayRecent({ recent, onPick, onRemove, onClear }: RecentProps) {
  if (!recent.length) return null;
  return (
    <div className="dd">
      <div className="sec">{copy.search.recent}</div>
      {recent.map((q) => (
        <div className="r" key={q} role="button" tabIndex={0} onClick={() => onPick(q)} onKeyDown={onActivate(() => onPick(q))}>
          {copy.search.recentGlyph} {q}
          <button type="button" className="rm" aria-label={copy.common.close} onClick={(e) => { e.stopPropagation(); onRemove(q); }}>
            {copy.common.closeGlyph}
          </button>
        </div>
      ))}
      <div className="more" role="button" tabIndex={0} onClick={onClear} onKeyDown={onActivate(onClear)}>
        {copy.search.clearRecent}
      </div>
    </div>
  );
}
