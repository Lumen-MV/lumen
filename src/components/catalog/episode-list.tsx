"use client";
import type { ReactNode } from "react";
import { EmptyBox } from "@/components/ui/empty-box";
import { copy } from "@/lib/copy-vi";
import type { EpisodeItem } from "@/lib/tmdb/catalog-types";
import { EpisodeRow } from "./episode-row";

type Props = {
  episodes: EpisodeItem[];
  current?: number;
  /** Phase 3/4 slot per episode */
  statusChipFor?: (episode: EpisodeItem) => ReactNode;
  /** Phase 4 slot per episode */
  progressFor?: (episode: EpisodeItem) => number | undefined;
  /** Phase 3: ⋯ menu per episode */
  menuFor?: (episode: EpisodeItem) => ReactNode;
};

/** Episode rows for one season; 0 episodes → emptyBox "Chưa có thông tin tập" (series.html `empty`). */
export function EpisodeList({ episodes, current, statusChipFor, progressFor, menuFor }: Props) {
  if (episodes.length === 0) return <EmptyBox title={copy.series.emptyTitle} hint={copy.series.emptyHint} />;
  return (
    <>
      {episodes.map((e) => (
        <EpisodeRow key={e.n} episode={e} current={e.n === current} statusChip={statusChipFor?.(e)} progress={progressFor?.(e)} menu={menuFor?.(e)} />
      ))}
    </>
  );
}
