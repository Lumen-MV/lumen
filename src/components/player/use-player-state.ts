"use client";
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";

/** Mirror of the <video> element (events → state) + the imperative actions every control / hotkey / gesture calls. */
export type VideoState = {
  paused: boolean;
  ended: boolean;
  currentTime: number;
  duration: number;
  /** end of the buffered range that contains the playhead (seconds) */
  bufferedEnd: number;
  volume: number;
  muted: boolean;
  rate: number;
  fullscreen: boolean;
  pip: boolean;
  pipAvailable: boolean;
  fullscreenAvailable: boolean;
  /** the element has a decoded frame (readyState ≥ HAVE_CURRENT_DATA) — before that the backdrop stays visible */
  hasFrame: boolean;
};

const initial: VideoState = { paused: true, ended: false, currentTime: 0, duration: 0, bufferedEnd: 0, volume: 1, muted: false, rate: 1, fullscreen: false, pip: false, pipAvailable: false, fullscreenAvailable: true, hasFrame: false };

type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitExitFullscreen?: () => void; webkitSupportsFullscreen?: boolean; webkitDisplayingFullscreen?: boolean };

/** iPhone Safari: `document.fullscreenEnabled` is false; the video element itself can go full screen once it has metadata. */
const fullscreenAvailableFor = (v: IosVideo): boolean => Boolean(document.fullscreenEnabled) || Boolean(v.webkitSupportsFullscreen) || typeof v.webkitEnterFullscreen === "function";

function bufferedEndAt(v: HTMLVideoElement): number {
  const b = v.buffered;
  for (let i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + 0.5 && v.currentTime <= b.end(i)) return b.end(i);
  return b.length ? b.end(b.length - 1) : 0;
}

export function usePlayerState(videoRef: RefObject<HTMLVideoElement | null>, containerRef: RefObject<HTMLDivElement | null>) {
  const [state, setState] = useState<VideoState>(initial);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // fullscreen availability is re-read on every sync: `webkitSupportsFullscreen` only turns true after `loadedmetadata`
    const sync = () => setState((s) => ({ ...s, paused: v.paused, ended: v.ended, currentTime: v.currentTime, duration: Number.isFinite(v.duration) ? v.duration : 0, bufferedEnd: bufferedEndAt(v), volume: v.volume, muted: v.muted, rate: v.playbackRate, hasFrame: v.readyState >= 2, fullscreenAvailable: fullscreenAvailableFor(v as IosVideo) }));
    const onFs = () => setState((s) => ({ ...s, fullscreen: Boolean(document.fullscreenElement) || Boolean((v as IosVideo).webkitDisplayingFullscreen) }));
    const onPip = () => setState((s) => ({ ...s, pip: Boolean(document.pictureInPictureElement) }));
    const events = ["play", "pause", "timeupdate", "durationchange", "loadedmetadata", "progress", "volumechange", "ratechange", "ended", "seeking", "seeked", "emptied", "loadeddata", "canplay", "error"];
    for (const e of events) v.addEventListener(e, sync);
    document.addEventListener("fullscreenchange", onFs);
    v.addEventListener("webkitbeginfullscreen", onFs);
    v.addEventListener("webkitendfullscreen", onFs);
    v.addEventListener("enterpictureinpicture", onPip);
    v.addEventListener("leavepictureinpicture", onPip);
    const pipAvailable = typeof document !== "undefined" && Boolean(document.pictureInPictureEnabled) && !/iphone|ipod/i.test(navigator.userAgent);
    setState((s) => ({ ...s, pipAvailable }));
    sync();
    return () => {
      for (const e of events) v.removeEventListener(e, sync);
      document.removeEventListener("fullscreenchange", onFs);
      v.removeEventListener("webkitbeginfullscreen", onFs);
      v.removeEventListener("webkitendfullscreen", onFs);
      v.removeEventListener("enterpictureinpicture", onPip);
      v.removeEventListener("leavepictureinpicture", onPip);
    };
  }, [videoRef]);

  const play = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      await v.play();
    } catch (err) {
      // autoplay blocked (no user gesture yet) → stay paused, the centre ▶ / Space starts it
      if ((err as Error)?.name !== "AbortError") console.warn("[player] play()", (err as Error)?.name);
    }
  }, [videoRef]);
  const pause = useCallback(() => videoRef.current?.pause(), [videoRef]);
  const togglePlay = useCallback(() => (videoRef.current?.paused ? void play() : pause()), [play, pause, videoRef]);
  const seek = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      const max = Number.isFinite(v.duration) && v.duration > 0 ? v.duration - 0.1 : Number.MAX_SAFE_INTEGER;
      v.currentTime = Math.max(0, Math.min(max, t));
    },
    [videoRef],
  );
  const seekBy = useCallback((d: number) => seek((videoRef.current?.currentTime ?? 0) + d), [seek, videoRef]);
  const setVolume = useCallback(
    (vol: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.volume = Math.max(0, Math.min(1, vol));
      if (v.volume > 0) v.muted = false;
    },
    [videoRef],
  );
  /** keyboard ↑/↓: reads the element, not the (possibly one render behind) state */
  const volumeBy = useCallback((d: number) => setVolume((videoRef.current?.volume ?? 1) + d), [setVolume, videoRef]);
  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (v) v.muted = !v.muted;
  }, [videoRef]);
  const setRate = useCallback(
    (r: number) => {
      const v = videoRef.current;
      if (v) v.playbackRate = r;
    },
    [videoRef],
  );
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    const v = videoRef.current as IosVideo | null;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (v?.webkitDisplayingFullscreen) v.webkitExitFullscreen?.();
      else if (el?.requestFullscreen) await el.requestFullscreen();
      else v?.webkitEnterFullscreen?.(); // iPhone Safari: only the video element can go full screen
    } catch (err) {
      console.warn("[player] fullscreen", (err as Error)?.name);
    }
  }, [containerRef, videoRef]);
  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch (err) {
      console.warn("[player] pip", (err as Error)?.name);
    }
  }, [videoRef]);

  const actions = useMemo(() => ({ play, pause, togglePlay, seek, seekBy, setVolume, volumeBy, toggleMute, setRate, toggleFullscreen, togglePip }), [play, pause, togglePlay, seek, seekBy, setVolume, volumeBy, toggleMute, setRate, toggleFullscreen, togglePip]);
  return { state, actions };
}

export type PlayerActions = ReturnType<typeof usePlayerState>["actions"];
