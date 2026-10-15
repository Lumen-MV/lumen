"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { clampOffset } from "@/lib/subtitles/cue-offset";
import { englishSource, nextCycleTrack, shouldAutoTranslate } from "@/lib/subtitles/subtitle-auto-select";
import type { QuotaInfo, SubsSearchResponse, SubSize, SubTrack } from "@/lib/subtitles/subtitle-types";
import { useSubtitlePrefsPatch } from "./use-subtitle-prefs-patch";
import { useTranslateJob } from "./use-translate-job";

/**
 * Player-side subtitle state: GET /api/subs/search once the manifest is known (tracks, auto-selected id, quota, prefs,
 * running job), selection / `C` cycling, offset + size persisted through the debounced prefs patch, and the AI
 * translation flow. While a job runs the English source is shown LOCALLY only (never written to prefs); on failure
 * the selection returns to what the viewer had before. Toast "Phụ đề AI đã sẵn sàng" + switch to the new track on done.
 */
export type SubsStatus = "idle" | "loading" | "ready" | "error";

export function usePlayerSubtitles(mediaKey: string | null, streamId: string | null) {
  const { toast } = useToast();
  const [status, setStatus] = useState<SubsStatus>("idle");
  const [tracks, setTracks] = useState<SubTrack[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hasEnglish, setHasEnglish] = useState(false);
  const [quota, setQuota] = useState<QuotaInfo>({ remaining: 20, resetAt: null });
  const [offsetMs, setOffsetMs] = useState(0);
  const [size, setSize] = useState<SubSize>("M");
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [tick, setTick] = useState(0);
  const offsetRef = useRef(0);
  const keepSelection = useRef(false);
  const autoTried = useRef(false);
  /** selection before the interim English was shown for a running job (restored on failure) */
  const interim = useRef<{ prev: number | null } | null>(null);
  const prefs = useSubtitlePrefsPatch(mediaKey);

  const onTranslated = useCallback(
    async (subId: number) => {
      interim.current = null;
      keepSelection.current = true;
      setSelectedId(subId);
      toast({ type: "success", text: copy.subs.readyToast });
      // the refetch must see the stored selection → await the PATCH before bumping the search
      await prefs.patchNow({ selectedSubId: subId });
      setTick((t) => t + 1);
    },
    [prefs, toast],
  );
  const onTranslateFailed = useCallback(() => {
    if (!interim.current) return;
    setSelectedId(interim.current.prev);
    interim.current = null;
  }, []);
  const job = useTranslateJob(onTranslated, onTranslateFailed);
  const adopt = job.adopt;

  useEffect(() => {
    if (!mediaKey) return;
    let alive = true;
    setStatus((s) => (s === "ready" ? s : "loading"));
    const url = `/api/subs/search?mediaKey=${encodeURIComponent(mediaKey)}${streamId ? `&streamId=${streamId}` : ""}`;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const json = (await r.json().catch(() => null)) as SubsSearchResponse | null;
        if (!alive) return;
        if (!r.ok || !json) return setStatus("error");
        setTracks(json.tracks);
        setHasEnglish(json.hasEnglish);
        setQuota(json.quota);
        offsetRef.current = json.prefs.offsetMs;
        setOffsetMs(json.prefs.offsetMs);
        setSize(json.prefs.size);
        setAutoTranslate(json.autoTranslate);
        const running = json.job?.state === "running";
        // a refetch after a translation keeps whatever the viewer picked meanwhile; a running job shows English locally
        setSelectedId((cur) => {
          const kept = keepSelection.current && json.tracks.some((t) => t.id === cur) ? cur : json.selectedId;
          if (kept !== null || !running) return kept;
          const en = englishSource(json.tracks);
          if (!en) return kept;
          interim.current = { prev: null };
          return en.id;
        });
        keepSelection.current = true;
        adopt(json.job);
        setStatus("ready");
      })
      .catch((err) => {
        console.warn("[subs] search", err);
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [mediaKey, streamId, tick, adopt]);

  const select = useCallback(
    (id: number | null) => {
      interim.current = null;
      setSelectedId(id);
      void prefs.patchNow({ selectedSubId: id ?? 0 });
    },
    [prefs],
  );
  const cycle = useCallback(() => select(nextCycleTrack(tracks, selectedId)), [select, tracks, selectedId]);

  // the ref is the source of truth (no setState-updater side effects → StrictMode safe); every step is merged into one patch
  const changeOffset = useCallback(
    (deltaMs: number) => {
      const next = clampOffset(offsetRef.current + deltaMs);
      offsetRef.current = next;
      setOffsetMs(next);
      prefs.schedule({ offsetMs: next });
    },
    [prefs],
  );
  const changeSize = useCallback(
    (s: SubSize) => {
      setSize(s);
      prefs.schedule({ size: s });
    },
    [prefs],
  );

  // the English source plays meanwhile (mockup popover-translating shows "English ✓") — local only, reverted on failure
  const translate = useCallback(async () => {
    const en = englishSource(tracks);
    if (!mediaKey || !en) return;
    if (selectedId === null) {
      interim.current = { prev: selectedId };
      setSelectedId(en.id);
    }
    const out = await job.start(mediaKey, en.id);
    if (out === "limit") toast({ type: "warn", text: copy.subs.limitToast });
  }, [tracks, mediaKey, job, toast, selectedId]);
  // onboarding pref "Tự dịch bằng AI khi không có bản Việt": once per player mount
  useEffect(() => {
    if (status !== "ready" || autoTried.current || !shouldAutoTranslate({ autoTranslate, tracks, jobState: job.ui.state })) return;
    autoTried.current = true;
    void translate();
  }, [status, autoTranslate, tracks, job.ui.state, translate]);

  const selectedTrack = useMemo(() => tracks.find((t) => t.id === selectedId) ?? null, [tracks, selectedId]);
  return { status, tracks, selectedId, selectedTrack, hasEnglish, quota, offsetMs, size, select, cycle, changeOffset, changeSize, translate, job: job.ui };
}

export type PlayerSubtitles = ReturnType<typeof usePlayerSubtitles>;
