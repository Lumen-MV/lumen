"use client";
import { DropdownMenu, type MenuItem } from "@/components/ui/dropdown-menu";
import { copy } from "@/lib/copy-vi";
import type { EpisodeItem } from "@/lib/tmdb/catalog-types";
import { useSeriesProgressOptional } from "@/components/catalog/series-progress-provider";
import { useSources } from "./sources-provider";

/** Episode `.more` ⋯ → `.menu2`: ▶ Phát · ✓ Đánh dấu đã xem | Đánh dấu chưa xem · ⬇ Tải lên cloud · 📺 Xem bằng app · Chọn bản khác. */
export function EpisodeMoreMenu({ season, episode }: { season: number; episode: EpisodeItem }) {
  const s = useSources();
  const sp = useSeriesProgressOptional();
  const m = copy.episodeMenu;
  const watched = sp?.episodeOf(season, episode.n)?.completed ?? false;
  const items: MenuItem[] = [
    { label: m.play, onSelect: () => s.runOnEpisode(season, episode.n, "play") },
    ...(sp ? [{ label: watched ? copy.progressUi.markUnwatched : copy.progressUi.markWatched, onSelect: () => void sp.markWatched(season, episode.n, !watched) }] : []),
    { label: m.cloud, onSelect: () => s.runOnEpisode(season, episode.n, "cloud") },
    { label: m.openApp, onSelect: () => s.runOnEpisode(season, episode.n, "app") },
    { label: m.other, onSelect: () => s.runOnEpisode(season, episode.n, "picker") },
  ];
  return (
    <DropdownMenu
      items={items}
      anchor={
        <button type="button" className="more" aria-label={copy.series.more} data-episode-menu={episode.n}>
          {copy.series.more}
        </button>
      }
    />
  );
}
