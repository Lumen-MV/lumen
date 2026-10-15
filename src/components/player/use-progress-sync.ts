"use client";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { HEARTBEAT_MS } from "@/lib/progress/progress-rules";

/**
 * Progress heartbeat: POST /api/progress every 10 s of playback, and on pause / ended / tab hidden / page unload via
 * `navigator.sendBeacon` (survives navigation). The server applies the 92 % completion rule and beats the viewer's seat;
 * a `429 LIMIT_5` (seat lost after > 60 s without beats and the group is full) → `onLimit` (the player pauses + shows
 * the limit dialog; "Thử lại" calls `beat()` to re-acquire). While `heldPosition` is set (relink in flight / failed)
 * it is what gets saved — the element reports 0:00 meanwhile and a saved resume point must never regress to 0.
 */
type Deps = { videoRef: RefObject<HTMLVideoElement | null>; mediaKey: string | null; streamId: string | null; enabled: boolean; heldPosition: number | null; onLimit: () => void };

export function useProgressSync({ videoRef, mediaKey, streamId, enabled, heldPosition, onLimit }: Deps) {
  const lastSent = useRef(0);
  const deps = useRef({ mediaKey, streamId, enabled, heldPosition, onLimit });
  deps.current = { mediaKey, streamId, enabled, heldPosition, onLimit };

  /** resolves true when the server accepted the beat (fetch path); beacons always resolve true */
  const send = useCallback(
    (beacon: boolean, forcePosition?: number): Promise<boolean> => {
      const v = videoRef.current;
      const { mediaKey, streamId, enabled, heldPosition, onLimit } = deps.current;
      if (!v || !mediaKey || !enabled) return Promise.resolve(false);
      const durationS = Number.isFinite(v.duration) ? v.duration : 0;
      const positionS = forcePosition ?? heldPosition ?? v.currentTime;
      if (durationS <= 0 && positionS <= 0) return Promise.resolve(false);
      const body = JSON.stringify({ mediaKey, positionS: Math.round(positionS * 10) / 10, durationS: Math.round(durationS * 10) / 10, streamId: streamId ?? undefined });
      lastSent.current = Date.now();
      if (beacon && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/progress", new Blob([body], { type: "application/json" }));
        return Promise.resolve(true);
      }
      return fetch("/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: beacon })
        .then((r) => {
          if (r.status === 429) onLimit();
          return r.ok;
        })
        .catch((err) => {
          console.warn("[progress] heartbeat", err);
          return false;
        });
    },
    [videoRef],
  );

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (!v.paused && Date.now() - lastSent.current >= HEARTBEAT_MS) void send(false);
    };
    const onPause = () => void send(false);
    const onEnded = () => void send(false, v.duration);
    const onHidden = () => {
      if (document.visibilityState === "hidden") void send(true);
    };
    const onUnload = () => void send(true);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onUnload);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onUnload);
      void send(true); // leaving the player (back arrow, next episode) saves the position
    };
  }, [videoRef, send]);

  /** explicit save (back arrow) before navigating */
  const flush = useCallback(() => void send(true), [send]);
  /** re-acquire the seat ("Thử lại" in the limit dialog): true = seat granted */
  const beat = useCallback(() => send(false), [send]);
  return { flush, beat };
}
