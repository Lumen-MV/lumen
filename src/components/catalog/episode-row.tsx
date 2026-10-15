"use client";
import { useState, type ReactNode } from "react";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import { formatDayMonth, formatRuntimeVi, parseLocalDate } from "@/lib/format/time-format";
import type { EpisodeItem } from "@/lib/tmdb/catalog-types";

type Props = {
  episode: EpisodeItem;
  current?: boolean;
  /** Phase 3/4 slot: cache tag / "Đã xem ✓"; unaired episodes always show "Phát sóng dd/mm" */
  statusChip?: ReactNode;
  /** Phase 4 slot: 0–100 → red bar under the still */
  progress?: number;
  /** ⋯ menu (Radix) — Phase 3: Phát / Tải lên cloud / Xem bằng app / Chọn bản khác */
  menu?: ReactNode;
};

/** `.ep[.future][.on] > .num + .th(img + .bar) + .tx(.n(title + span runtime) + .p) + chip + .more` — overview clamps to 2 lines, click expands. */
export function EpisodeRow({ episode, current, statusChip, progress, menu }: Props) {
  const [expanded, setExpanded] = useState(false);
  // TMDB air dates are calendar days: parse as local so "Phát sóng dd/mm" never shifts a day west of UTC
  const airDate = parseLocalDate(episode.airDate);
  const airs = airDate ? copy.series.airs(formatDayMonth(airDate)) : null;
  return (
    <div className={cx("ep", !episode.aired && "future", current && "on")} data-episode={episode.n}>
      <div className="num">{episode.n}</div>
      <div className="th">
        {episode.stillUrl ? <img src={episode.stillUrl} alt="" loading="lazy" /> : <div style={{ width: "100%", height: "100%", background: "#222", borderRadius: 4 }} />}
        {progress !== undefined && progress > 0 && (
          <div className="bar">
            <i style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
        )}
      </div>
      <div className="tx">
        <div className="n">
          {episode.title}
          {episode.runtimeMin ? <span>{formatRuntimeVi(episode.runtimeMin)}</span> : null}
        </div>
        {episode.overview && (
          <div className={cx("p", !expanded && "clamp")} onClick={() => setExpanded((e) => !e)}>
            {episode.overview}
          </div>
        )}
      </div>
      <div>{!episode.aired && airs ? <span className="tag x">{airs}</span> : statusChip}</div>
      {menu ? (
        menu
      ) : (
        <div className="more" aria-hidden="true">
          {copy.series.more}
        </div>
      )}
    </div>
  );
}
