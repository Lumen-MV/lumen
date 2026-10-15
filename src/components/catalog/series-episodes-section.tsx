"use client";
import { useEffect, useRef, useState } from "react";
import { EpisodeMoreMenu } from "@/components/sources/episode-more-menu";
import { EpisodeStatusChip } from "@/components/sources/episode-status-chip";
import { useSources } from "@/components/sources/sources-provider";
import { useSeasonSources } from "@/components/sources/use-season-sources";
import { ErrorBox } from "@/components/ui/error-box";
import { copy } from "@/lib/copy-vi";
import type { EpisodeItem, SeasonSummary } from "@/lib/tmdb/catalog-types";
import { EpisodeList } from "./episode-list";
import { EpisodeListSkeleton } from "./episode-list-skeleton";
import { SeasonDropdown } from "./season-dropdown";
import { useSeriesProgress } from "./series-progress-provider";

type SeasonData = { episodes: EpisodeItem[]; unairedCount: number };
type Props = { seriesId: number; seasons: SeasonSummary[]; initialSeason: number; initialData: SeasonData | null };

/**
 * `.eps > .hd(h2 "Tập" + SeasonDropdown) + rows` — season N is server-rendered; switching seasons fetches
 * /api/catalog/series/[id]/season/[n], shows the 4-row skeleton meanwhile and keeps `?s=N` in the URL via
 * `history.replaceState` (Next syncs it) — no server re-render, no remount, fetched seasons stay cached.
 */
export function SeriesEpisodesSection({ seriesId, seasons, initialSeason, initialData }: Props) {
  const [season, setSeason] = useState(initialSeason);
  const [cache, setCache] = useState<Record<number, SeasonData>>(initialData ? { [initialSeason]: initialData } : {});
  const [status, setStatus] = useState<"ready" | "loading" | "error">(initialData ? "ready" : "loading");
  const [unaired, setUnaired] = useState<Record<number, number>>(initialData ? { [initialSeason]: initialData.unairedCount } : {});

  useEffect(() => {
    if (cache[season]) {
      setStatus("ready");
      return;
    }
    const ctrl = new AbortController();
    setStatus("loading");
    fetch(`/api/catalog/series/${seriesId}/season/${season}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`season ${r.status}`);
        const data = (await r.json()) as SeasonData;
        setCache((c) => ({ ...c, [season]: data }));
        setUnaired((u) => ({ ...u, [season]: data.unairedCount }));
        setStatus("ready");
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.warn("[season]", err); // handled: ErrorBox + Thử lại
        setStatus("error");
      });
    return () => ctrl.abort();
  }, [season, seriesId, cache]);

  // Phase 3: cache chips per episode (title_sources + live jobs) and the ⋯ menu; the hero follows the season (S{n} T1)
  const sources = useSources();
  // Phase 4: progress bars / "Đã xem ✓" per episode, watched counts per season, the primary's episode highlighted
  const { progress, episodeOf } = useSeriesProgress();
  const watchedCounts = Object.fromEntries(Object.entries(progress.seasons).map(([n, v]) => [n, v.watched]));
  const current = sources.episode?.season === season ? sources.episode.episode : undefined;
  // marking an episode watched / unwatched moves the primary target (e.g. "Phát tập tiếp S4 T2"): the hero + highlighted row
  // follow it — only when the primary actually CHANGES after mount, so a `?s=&e=` deep link (QR, next-episode picker) keeps
  // its own episode highlighted and `?pick=1` / `?play=1` act on the requested episode
  const primary = progress.primary;
  const seenPrimary = useRef(`${primary.season}:${primary.episode}`);
  const { episode: sourcesEpisode, setEpisode } = sources;
  useEffect(() => {
    const id = `${primary.season}:${primary.episode}`;
    if (seenPrimary.current === id) return;
    seenPrimary.current = id;
    if (primary.season === season && (sourcesEpisode?.season !== primary.season || sourcesEpisode?.episode !== primary.episode)) setEpisode(primary.season, primary.episode);
  }, [primary.season, primary.episode, season, sourcesEpisode, setEpisode]);
  const { episodes: chips } = useSeasonSources(seriesId, season, status === "ready");
  const change = (n: number) => {
    setSeason(n);
    sources.setEpisode(n, 1);
    window.history.replaceState(null, "", `?s=${n}`);
  };
  // live unaired counts from fetched seasons refine the dropdown meta (summary only knows "whole season unaired")
  const seasonList = seasons.map((s) => (unaired[s.n] !== undefined ? { ...s, unairedCount: unaired[s.n] } : s));
  const data = cache[season];
  return (
    <div className="eps" data-season={season} data-status={status}>
      <div className="hd">
        <h2>{copy.series.episodes}</h2>
        <SeasonDropdown seasons={seasonList} current={season} onChange={change} watchedCounts={watchedCounts} />
      </div>
      {status === "loading" && <EpisodeListSkeleton />}
      {status === "error" && <ErrorBox message={copy.home.errRow} onAction={() => setCache((c) => { const next = { ...c }; delete next[season]; return next; })} />}
      {status === "ready" && data && (
        <EpisodeList
          episodes={data.episodes}
          current={current}
          statusChipFor={(e) => (episodeOf(season, e.n)?.completed ? <span className="watched">{copy.progressUi.watchedChip}</span> : <EpisodeStatusChip cacheState={chips[e.n]?.cacheState} job={chips[e.n]?.job} />)}
          progressFor={(e) => episodeOf(season, e.n)?.percent}
          menuFor={(e) => <EpisodeMoreMenu season={season} episode={e} />}
        />
      )}
    </div>
  );
}
