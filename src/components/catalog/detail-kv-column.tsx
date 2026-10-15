"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { onActivate } from "@/components/ui/activate-key";
import { copy } from "@/lib/copy-vi";

const CAST_PREVIEW = 3;

type Props = {
  cast: string[];
  /** movie: directors → "Đạo diễn:"; series: creators (omitted when empty) */
  directors?: string[];
  genres: Array<{ id: number; name: string }>;
  /** "/movies" | "/series" — genre names link to `?genre=<id>` on that browse page */
  genreBrowsePath: string;
  originalTitle: string;
  /** Phase 3 slot: "1080p MP4 · 2.7 GB · YTS"; row hidden while absent */
  bestSource?: ReactNode;
  /** Phase 4 slot (series): "S4 T1 · 12%"; row shows "—" while absent (mockup default) */
  watching?: ReactNode;
  showWatching?: boolean;
};

/** `.kv > b + text [+ i "thêm"]` rows: Diễn viên (3 + thêm → 10), Đạo diễn, Thể loại (links), Tên gốc, Nguồn tốt nhất / Đang xem slots. */
export function DetailKvColumn({ cast, directors, genres, genreBrowsePath, originalTitle, bestSource, watching, showWatching }: Props) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? cast : cast.slice(0, CAST_PREVIEW);
  const d = copy.detail;
  return (
    <>
      {cast.length > 0 && (
        <div className="kv">
          <b>{d.cast}</b> {shown.join(", ")}
          {!expanded && cast.length > CAST_PREVIEW && (
            <>
              , <i role="button" tabIndex={0} onClick={() => setExpanded(true)} onKeyDown={onActivate(() => setExpanded(true))}>{copy.common.more}</i>
            </>
          )}
        </div>
      )}
      {directors && directors.length > 0 && (
        <div className="kv">
          <b>{d.director}</b> {directors.join(", ")}
        </div>
      )}
      {genres.length > 0 && (
        <div className="kv">
          <b>{d.genres}</b>{" "}
          {genres.map((g, i) => (
            <span key={g.id}>
              {i > 0 && ", "}
              <Link href={`${genreBrowsePath}?genre=${g.id}`}>{g.name}</Link>
            </span>
          ))}
        </div>
      )}
      {originalTitle && (
        <div className="kv">
          <b>{d.original}</b> {originalTitle}
        </div>
      )}
      {bestSource !== undefined && bestSource !== null && (
        <div className="kv">
          <b>{d.bestSource}</b> {bestSource}
        </div>
      )}
      {showWatching && (
        <div className="kv">
          <b>{d.watching}</b> {watching ?? d.none}
        </div>
      )}
    </>
  );
}
