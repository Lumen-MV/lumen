"use client";
import { useCallback, useEffect, useState } from "react";
import type { EpisodeSourceStatus, SeasonSourcesResponse } from "@/lib/sources/sources-types";
import { JOBS_POLL_MS } from "./use-sources-fetch";

/**
 * Episode chips for one season from /api/sources/season (title_sources + live jobs). Re-polled every 3 s while an
 * episode job is active; `refresh()` after an action (cloud / cancel) from the ⋯ menu.
 */
export function useSeasonSources(seriesId: number, season: number, enabled: boolean) {
  const [episodes, setEpisodes] = useState<Record<number, EpisodeSourceStatus>>({});
  const [gen, setGen] = useState(0);
  const refresh = useCallback(() => setGen((g) => g + 1), []);
  const active = Object.values(episodes).some((e) => e.job && (e.job.state === "queued" || e.job.state === "downloading"));

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    const load = () =>
      fetch(`/api/sources/season?key=tv:${seriesId}&s=${season}`, { signal: ctrl.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error(`season sources ${r.status}`);
          const body = (await r.json()) as SeasonSourcesResponse;
          setEpisodes(body.episodes ?? {});
        })
        .catch((err: unknown) => {
          if ((err as Error | null)?.name !== "AbortError") console.warn("[season sources]", err); // handled: chips stay empty
        });
    void load();
    const handle = active ? setInterval(load, JOBS_POLL_MS) : null;
    return () => {
      ctrl.abort();
      if (handle) clearInterval(handle);
    };
  }, [seriesId, season, enabled, gen, active]);

  return { episodes, refresh };
}
