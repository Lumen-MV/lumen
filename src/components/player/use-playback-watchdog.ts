"use client";
import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from "react";
import { decodedAudioBytes } from "@/lib/play/playability-client";
import type { PlayerManifest } from "@/lib/play/player-manifest-types";
import { initialWatchdog, MAX_RELINK_TRIES, reduceWatchdog, type WatchdogState } from "@/lib/play/watchdog-state-machine";
import { probeStream, relinkStream } from "./relink-stream";

/**
 * Feeds <video> events + a 1 s clock into the pure watchdog machine and runs the relink loop (resolve refresh → new
 * manifest → same position) when it asks for it. `onRelinkStart` fires once per expiry (the warn toast).
 * `held` = the last known position / duration / buffered end from the moment a relink starts until the new source
 * plays: the seek bar, clock, QR and link-expired dialog show it instead of the 0:00 the element reports meanwhile.
 */
type Deps = { videoRef: RefObject<HTMLVideoElement | null>; manifest: PlayerManifest | null; replaceManifest: (m: PlayerManifest) => void; onRelinkStart: () => void };
export type HeldPosition = { time: number; duration: number; buffered: number };

export function usePlaybackWatchdog({ videoRef, manifest, replaceManifest, onRelinkStart }: Deps) {
  const [wd, dispatch] = useReducer(reduceWatchdog, undefined, initialWatchdog);
  const [held, setHeld] = useState<HeldPosition | null>(null);
  const wdRef = useRef<WatchdogState>(wd);
  wdRef.current = wd;
  const streamIdRef = useRef(manifest?.streamId ?? "");
  useEffect(() => {
    if (manifest) streamIdRef.current = manifest.streamId;
  }, [manifest]);
  const relinking = useRef(false);
  const prevPhase = useRef(wd.phase);
  // last position / duration / buffered end seen while playing: a failed source reload resets the element to 0 before the error event arrives
  const last = useRef<HeldPosition>({ time: 0, duration: 0, buffered: 0 });

  // video events
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => dispatch({ type: "play-requested", at: Date.now() });
    const onPlaying = () => {
      setHeld(null); // the relinked source plays again → live values
      dispatch({ type: "playing", at: Date.now() });
    };
    const onWaiting = () => dispatch({ type: "waiting", at: Date.now() });
    const onPause = () => dispatch({ type: "pause" });
    const onEnded = () => dispatch({ type: "ended" });
    const onTime = () => {
      if (v.currentTime > 0) last.current = { time: v.currentTime, duration: Number.isFinite(v.duration) ? v.duration : last.current.duration, buffered: v.buffered.length ? v.buffered.end(v.buffered.length - 1) : last.current.buffered };
    };
    // the element resets to 0:00 the moment its source is reloaded (expired link re-request) — hold the last position from here on
    const onEmptied = () => {
      if (last.current.time > 0) setHeld({ ...last.current });
    };
    const onError = async () => {
      const code = v.error?.code ?? 0;
      const probeOk = await probeStream(streamIdRef.current);
      dispatch({ type: "error", code, probeOk });
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("emptied", onEmptied);
    return () => {
      v.removeEventListener("emptied", onEmptied);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
  }, [videoRef]);

  // 1 s clock: stall seconds + audio bytes
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current;
      dispatch({ type: "tick", at: Date.now(), audioBytes: v && !v.paused ? decodedAudioBytes(v) : null });
    }, 1000);
    return () => clearInterval(id);
  }, [videoRef]);

  // relink loop
  const runRelink = useCallback(async () => {
    if (relinking.current) return;
    relinking.current = true;
    const v = videoRef.current;
    const position = v && v.currentTime > 0 ? v.currentTime : last.current.time;
    setHeld({ time: position, duration: v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : last.current.duration, buffered: last.current.buffered });
    try {
      // local counter: the reducer's copy only lands on the next render
      for (let tries = wdRef.current.relinkTries; tries < MAX_RELINK_TRIES; tries++) {
        dispatch({ type: "relink-started" });
        const m = await relinkStream(streamIdRef.current);
        if (m && v) {
          streamIdRef.current = m.streamId;
          replaceManifest(m);
          v.src = m.src;
          v.load();
          v.currentTime = position;
          dispatch({ type: "relink-ok", at: Date.now() });
          void v.play().catch(() => {});
          return;
        }
        dispatch({ type: "relink-failed" });
      }
    } finally {
      relinking.current = false;
    }
  }, [replaceManifest, videoRef]);

  useEffect(() => {
    if (wd.phase === "relinking" && prevPhase.current !== "relinking") {
      if (wd.relinkTries === 0) onRelinkStart();
      void runRelink();
    }
    prevPhase.current = wd.phase;
  }, [wd.phase, wd.relinkTries, onRelinkStart, runRelink]);

  /** "Thử lại" in the link-expired-fail dialog: start over with a fresh try budget. */
  const retryRelink = useCallback(() => {
    dispatch({ type: "reset" });
    dispatch({ type: "error", code: 2, probeOk: false });
  }, []);
  /** Safari + MKV (canPlayType "") → codec dialog without even trying. */
  const forceCodecError = useCallback(() => dispatch({ type: "error", code: 4, probeOk: true }), []);
  const resetWatchdog = useCallback(() => {
    setHeld(null);
    dispatch({ type: "reset" });
  }, []);

  return { wd, held, retryRelink, forceCodecError, resetWatchdog };
}
