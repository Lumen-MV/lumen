"use client";
import { useSources } from "@/components/sources/sources-provider";
import { copy } from "@/lib/copy-vi";
import { formatClock } from "@/lib/format/time-format";
import { useSeriesProgress } from "./series-progress-provider";

/**
 * Series hero slots driven by progress (spec phase-04 / screen-series.js): primary "▶ Phát S1 T1" / "▶ Tiếp tục S4 T1 · 12:40" /
 * "▶ Phát tập tiếp S4 T2" / "▶ Xem lại S1 T1"; facts "Đang xem · S4 T1 · 12%" / "Chưa xem" / "Đã xem S4 T1" / "Đã xem hết 5 mùa ✓";
 * kv "Đang xem:" "S4 T1 · 12%" / "S4 T2 tiếp theo" / "Hoàn thành" / "—".
 */
export function SeriesPrimaryButton() {
  const s = useSources();
  const { progress } = useSeriesProgress();
  const p = progress.primary;
  const u = copy.progressUi;
  const label = p.kind === "continue" ? u.seriesContinue(p.season, p.episode, formatClock(p.positionS)) : p.kind === "next" ? u.seriesNext(p.season, p.episode) : p.kind === "replay" ? u.seriesReplay : u.seriesPlayFirst;
  const busy = s.primary !== null && s.actions.busyHash === s.primary.hash;
  const disabled = s.status === "loading" && s.episode?.season === p.season && s.episode?.episode === p.episode;
  return (
    <button type="button" className="btn w" disabled={disabled || busy} data-primary={s.detailState} data-series-primary={p.kind} data-target={`${p.season}:${p.episode}`} aria-busy={busy || undefined} onClick={() => s.runOnEpisode(p.season, p.episode, p.kind === "continue" ? "resume" : "play")}>
      {busy ? copy.detail.gettingLink : label}
    </button>
  );
}

export function SeriesFacts() {
  const { progress } = useSeriesProgress();
  const p = progress.primary;
  const u = copy.progressUi;
  if (p.kind === "first") return <span style={{ color: "#aaa" }} data-facts="fresh">{u.factsFresh}</span>;
  if (p.kind === "continue") return <span className="match" data-facts="watching">{u.factsWatching(p.season, p.episode, p.percent)}</span>;
  if (p.kind === "replay") return <span className="match" data-facts="done">{u.factsDone(progress.seasonCount)}</span>;
  const last = progress.lastCompleted;
  return <span className="match" data-facts="watched">{last ? u.factsWatchedEp(last.season, last.episode) : u.factsFresh}</span>;
}

export function SeriesWatchingKv() {
  const { progress } = useSeriesProgress();
  const p = progress.primary;
  const u = copy.progressUi;
  const text = p.kind === "continue" ? u.kvWatching(p.season, p.episode, p.percent) : p.kind === "next" ? u.kvNext(p.season, p.episode) : p.kind === "replay" ? u.kvDone : u.kvNone;
  return <span data-watching={p.kind}>{text}</span>;
}
