"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import { formatRuntimeVi } from "@/lib/format/time-format";
import type { SeasonInfoDto, SeriesProgressDto } from "@/lib/play/player-manifest-types";
import { episodeKey } from "@/lib/progress/series-progress-rules";
import type { SeasonSourcesResponse } from "@/lib/sources/sources-types";
import type { EpisodeItem } from "@/lib/tmdb/catalog-types";

type Props = { seriesId: number; seasons: SeasonInfoDto[]; current: { season: number; episode: number }; livePercent: number; onPick: (season: number, episode: number) => void; onClose: () => void };

/**
 * `.drawer > h3("Mùa N ▾" + ✕) + .ep rows(.num .th(img + .bar) .tx(.n title + span runtime) + chip Cache/Chưa)` — the
 * episode picker inside the player; the current episode is `.on` with its live progress bar, others show saved progress.
 */
export function EpisodeDrawer({ seriesId, seasons, current, livePercent, onPick, onClose }: Props) {
  const [season, setSeason] = useState(current.season);
  const [episodes, setEpisodes] = useState<EpisodeItem[] | null>(null);
  const [chips, setChips] = useState<SeasonSourcesResponse["episodes"]>({});
  const [progress, setProgress] = useState<SeriesProgressDto["episodes"]>({});
  const d = copy.player.drawer;

  useEffect(() => {
    const ctrl = new AbortController();
    setEpisodes(null);
    fetch(`/api/catalog/series/${seriesId}/season/${season}`, { signal: ctrl.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as { episodes: EpisodeItem[] }).episodes : []))
      .then(setEpisodes)
      .catch((err) => err?.name !== "AbortError" && console.warn("[drawer] season", err));
    fetch(`/api/sources/season?key=tv:${seriesId}&s=${season}`, { signal: ctrl.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as SeasonSourcesResponse).episodes : {}))
      .then(setChips)
      .catch((err) => err?.name !== "AbortError" && console.warn("[drawer] chips", err));
    return () => ctrl.abort();
  }, [seriesId, season]);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/series/${seriesId}/progress`, { signal: ctrl.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as SeriesProgressDto).episodes : {}))
      .then(setProgress)
      .catch((err) => err?.name !== "AbortError" && console.warn("[drawer] progress", err));
    return () => ctrl.abort();
  }, [seriesId]);

  // dialog semantics: initial focus on the season select, Tab / Shift+Tab cycle inside the drawer (Esc = player hotkey → close)
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("select")?.focus();
  }, []);
  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>("select, button, [role=button]"));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const pctFor = (n: number) => (season === current.season && n === current.episode ? livePercent : (progress[episodeKey(season, n)]?.percent ?? 0));
  return (
    <div ref={ref} className="drawer" role="dialog" aria-modal="true" aria-label={copy.player.aria.episodes} data-drawer="episodes" onKeyDown={trapTab}>
      <h3>
        <select value={season} aria-label={copy.series.episodes} onChange={(e) => setSeason(Number(e.target.value))} data-drawer-season={season}>
          {seasons.map((s) => (
            <option key={s.n} value={s.n}>
              {d.season(s.n)}
            </option>
          ))}
        </select>
        <button type="button" className="x" aria-label={copy.player.aria.closeDrawer} onClick={onClose}>
          {copy.common.closeGlyph}
        </button>
      </h3>
      {episodes?.map((e) => {
        const on = season === current.season && e.n === current.episode;
        const pct = pctFor(e.n);
        const cached = chips[e.n]?.cacheState;
        return (
          <div key={e.n} className={cx("ep", on && "on")} role="button" tabIndex={0} data-drawer-episode={e.n} onClick={() => !on && onPick(season, e.n)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && !on && onPick(season, e.n)}>
            <div className="num">{e.n}</div>
            <div className="th">
              {e.stillUrl ? <img src={e.stillUrl} alt="" loading="lazy" /> : <div style={{ width: "100%", height: "100%", background: "#222", borderRadius: 4 }} />}
              {pct > 0 && (
                <div className="bar">
                  <i style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              )}
            </div>
            <div className="tx">
              <div className="n">
                {e.title}
                {e.runtimeMin ? <span>{formatRuntimeVi(e.runtimeMin)}</span> : null}
              </div>
            </div>
            <div>{cached === "cached" ? <span className="tag g">{d.cached}</span> : cached === "uncached" ? <span className="tag x">{d.uncached}</span> : null}</div>
          </div>
        );
      })}
    </div>
  );
}
