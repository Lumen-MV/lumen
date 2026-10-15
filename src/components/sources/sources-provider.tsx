"use client";
import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { formatMediaKey, type MediaType } from "@/lib/catalog/media-key";
import { primaryRelease } from "@/lib/sources/release-pref-select";
import type { CloudJob, Release, SourcesResponse } from "@/lib/sources/sources-types";
import { CancelDownloadDialog } from "./cancel-download-dialog";
import { DetailHandoffSheet } from "./detail-handoff-sheet";
import { detailSourceState, type DetailSourceState } from "./detail-source-state";
import { SourcePickerModal } from "./source-picker-modal";
import { useSourceActions, type SourceActions } from "./use-source-actions";
import { useSourcesFetch, type SourcesStatus } from "./use-sources-fetch";

/**
 * One sources context per detail page: the hero primary/facts/best, "Chọn bản khác" / "📺 Xem bằng app", the episode
 * ⋯ menu and the picker all read it. Series pages switch the episode (`setEpisode`) — the key becomes `tv:id:s:e`.
 * `?play=1` runs the primary action once sources are ready (QR deep link); `?pick=1` opens the picker (next-episode
 * fallback). `resume` (movie progress) turns the primary into "▶ Tiếp tục" (`/watch?resume=1`).
 * `primary` = the release every primary path uses: the viewer's applied "Lần trước" release, else `best` (release-pref-select.ts).
 */
export type EpisodeActionKind = "play" | "resume" | "app" | "picker" | "cloud";

export type SourcesContextValue = {
  mediaKey: string;
  title: string;
  episode: { season: number; episode: number } | null;
  status: SourcesStatus;
  data: SourcesResponse | null;
  primary: Release | null;
  detailState: DetailSourceState;
  jobs: Map<string, CloudJob>;
  show4k: boolean;
  setShow4k: (on: boolean) => void;
  reload: () => void;
  pickerOpen: boolean;
  highlightHash: string | null;
  openPicker: (highlightHash?: string | null) => void;
  closePicker: () => void;
  setEpisode: (season: number, episode: number) => void;
  /** series ⋯ menu / hero: switch episode, then run play / resume / app / picker once that episode's sources are ready */
  runOnEpisode: (season: number, episode: number, kind: EpisodeActionKind) => void;
  requestCancel: (job: CloudJob) => void;
  primaryAction: (opts?: { t?: number }) => void;
  /** movie: saved in-progress position (detail `resume` state) */
  resume: { positionS: number } | null;
  actions: SourceActions;
};

const Ctx = createContext<SourcesContextValue | null>(null);

type Props = { type: MediaType; tmdbId: number; title: string; initialShow4k: boolean; initialEpisode?: { season: number; episode: number } | null; resume?: { positionS: number } | null; children: ReactNode };

export function SourcesProvider({ type, tmdbId, title, initialShow4k, initialEpisode = null, resume = null, children }: Props) {
  const [episode, setEp] = useState(initialEpisode);
  const mediaKey = formatMediaKey(type, tmdbId, episode?.season, episode?.episode);
  const [show4k, setShow4kState] = useState(initialShow4k);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlightHash, setHighlight] = useState<string | null>(null);
  const [cancelJob, setCancelJob] = useState<CloudJob | null>(null);
  const [handoffStreamId, setHandoffStreamId] = useState<string | null>(null);
  const { toast } = useToast();
  const onJobReady = useCallback(
    (job: CloudJob) => {
      setHighlight(job.hash);
      toast({ type: "success", text: copy.picker.readyToast(job.fileName || job.title) });
    },
    [toast],
  );
  const fetched = useSourcesFetch(mediaKey, show4k, pickerOpen, onJobReady);
  const actions = useSourceActions({ mediaKey, setJob: fetched.setJob, setPref: fetched.setPref, reload: fetched.reload, onHandoff: setHandoffStreamId });
  const detailState = detailSourceState(fetched.status, fetched.data);
  const primary = primaryRelease(fetched.data);

  const setShow4k = useCallback((on: boolean) => {
    setShow4kState(on);
    fetch("/api/me/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ show_4k: on }) }).catch((err) => console.warn("[settings] show_4k", err));
  }, []);
  const openPicker = useCallback((hash: string | null = null) => {
    setHighlight(hash);
    setPickerOpen(true);
  }, []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const setEpisode = useCallback((season: number, ep: number) => setEp({ season, episode: ep }), []);
  const pending = useRef<{ key: string; kind: EpisodeActionKind } | null>(null);
  const runOnEpisode = useCallback(
    (season: number, ep: number, kind: EpisodeActionKind) => {
      pending.current = { key: formatMediaKey(type, tmdbId, season, ep), kind };
      setEp({ season, episode: ep });
    },
    [type, tmdbId],
  );
  useEffect(() => {
    const p = pending.current;
    if (!p || p.key !== mediaKey || fetched.status !== "ready") return;
    pending.current = null;
    const target = primaryRelease(fetched.data);
    const firstUncached = fetched.data?.releases.find((r) => r.cacheState === "uncached")?.hash ?? null;
    if (p.kind === "picker" || !target) openPicker(target?.hash ?? null);
    else if (p.kind === "cloud") openPicker(firstUncached ?? target.hash);
    else if (p.kind === "app") void actions.app(target, "primary");
    else if (target.cacheState === "cached") void actions.play(target, { resume: p.kind === "resume" }, "primary");
    else openPicker(target.hash);
  }, [mediaKey, fetched.status, fetched.data, actions, openPicker]);

  /** `t` (QR deep link `?play=1&t=`) wins over the saved position: the player starts there without a prompt */
  const primaryAction = useCallback(
    (opts: { t?: number } = {}) => {
      if (!primary || detailState === "loading" || detailState === "none") return;
      if (detailState === "uncached" || detailState === "down") return openPicker(primary.hash);
      if (detailState === "app") return void actions.app(primary, "primary");
      void actions.play(primary, opts.t !== undefined ? { t: opts.t } : { resume: resume !== null }, "primary");
    },
    [actions, detailState, primary, openPicker, resume],
  );

  // ?play=1[&t=N] → auto primary once (QR deep link, movie or series episode from `?s=&e=`); ?pick=1 → picker once (next episode with nothing cached)
  const sp = useSearchParams();
  const autoRan = useRef(false);
  useEffect(() => {
    if (fetched.status !== "ready" || autoRan.current) return;
    if (sp.get("play") === "1") {
      autoRan.current = true;
      const t = sp.get("t");
      primaryAction(t !== null && /^\d+(\.\d+)?$/.test(t) ? { t: Number(t) } : {});
    } else if (sp.get("pick") === "1") {
      autoRan.current = true;
      openPicker(primary?.hash ?? null);
    }
  }, [sp, fetched.status, primary, primaryAction, openPicker]);

  const value = useMemo<SourcesContextValue>(
    () => ({ mediaKey, title, episode, status: fetched.status, data: fetched.data, primary, detailState, jobs: fetched.jobs, show4k, setShow4k, reload: fetched.reload, pickerOpen, highlightHash, openPicker, closePicker, setEpisode, runOnEpisode, requestCancel: setCancelJob, primaryAction, resume, actions }),
    [mediaKey, title, episode, fetched.status, fetched.data, fetched.jobs, fetched.reload, primary, detailState, show4k, setShow4k, pickerOpen, highlightHash, openPicker, closePicker, setEpisode, runOnEpisode, primaryAction, resume, actions],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <SourcePickerModal />
      <CancelDownloadDialog job={cancelJob} onClose={() => setCancelJob(null)} onStop={(job) => void actions.cancel(job)} />
      <DetailHandoffSheet streamId={handoffStreamId} mediaKey={mediaKey} onClose={() => setHandoffStreamId(null)} />
    </Ctx.Provider>
  );
}

export function useSources(): SourcesContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSources must be used inside <SourcesProvider>");
  return ctx;
}

/** Releases merged with the live job map (the list itself is only refetched on reload / 4K toggle). */
export function withLiveJobs(releases: Release[], jobs: Map<string, CloudJob>): Release[] {
  return releases.map((r) => {
    const job = jobs.get(r.hash);
    if (job && job.state !== "ready") return { ...r, job };
    if (job?.state === "ready") return { ...r, job: undefined, cacheState: "cached" };
    return r.job ? { ...r, job: undefined } : r;
  });
}
