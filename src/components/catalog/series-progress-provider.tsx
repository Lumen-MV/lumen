"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { formatMediaKey } from "@/lib/catalog/media-key";
import type { SeriesProgressDto } from "@/lib/play/player-manifest-types";
import { episodeKey } from "@/lib/progress/series-progress-rules";

/**
 * Series-page progress (hero primary / facts / kv, episode bars + "Đã xem ✓", season watched counts): server snapshot
 * first, refetched after the ⋯ menu marks an episode watched / unwatched so every consumer updates together.
 */
export type SeriesProgressContextValue = {
  progress: SeriesProgressDto;
  episodeOf: (season: number, episode: number) => { percent: number; completed: boolean; positionS: number } | null;
  markWatched: (season: number, episode: number, watched: boolean) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<SeriesProgressContextValue | null>(null);

export function SeriesProgressProvider({ seriesId, initial, children }: { seriesId: number; initial: SeriesProgressDto; children: ReactNode }) {
  const [progress, setProgress] = useState(initial);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/series/${seriesId}/progress`, { cache: "no-store" });
      if (r.ok) setProgress((await r.json()) as SeriesProgressDto);
    } catch (err) {
      console.warn("[series progress] refresh", err);
    }
  }, [seriesId]);
  const markWatched = useCallback(
    async (season: number, episode: number, watched: boolean) => {
      try {
        const r = await fetch("/api/progress/mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaKey: formatMediaKey("tv", seriesId, season, episode), watched }) });
        if (!r.ok) throw new Error(`mark ${r.status}`);
      } catch (err) {
        console.warn("[series progress] mark", err);
      }
      await refresh();
    },
    [seriesId, refresh],
  );
  const episodeOf = useCallback((s: number, e: number) => progress.episodes[episodeKey(s, e)] ?? null, [progress]);
  const value = useMemo(() => ({ progress, episodeOf, markWatched, refresh }), [progress, episodeOf, markWatched, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSeriesProgress(): SeriesProgressContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSeriesProgress must be used inside <SeriesProgressProvider>");
  return ctx;
}

/** Optional variant for components that also render outside a series page (episode ⋯ menu). */
export const useSeriesProgressOptional = (): SeriesProgressContextValue | null => useContext(Ctx);
