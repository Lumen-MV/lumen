/**
 * Pure playback watchdog (phase-04 Key Insights): drives the loading / buffering / stall / no-audio / codec-error /
 * link-expired (×2) states from <video> events + a clock. `use-playback-watchdog.ts` feeds it; unit tests cover it.
 *   stall   = no `playing` within 8 s of play(), or `waiting` lasting > 10 s
 *   noAudio = 5 s after `playing` the browser decoded 0 audio bytes
 *   error   = probe failed (link dead / 403) or MEDIA_ERR_NETWORK after a prior success → relink (max 2 tries) · codes 3/4 → codec error
 */
export const STALL_START_MS = 8_000;
export const STALL_WAITING_MS = 10_000;
export const NO_AUDIO_AFTER_MS = 5_000;
export const MAX_RELINK_TRIES = 2;

export type WatchdogPhase = "idle" | "loading" | "playing" | "buffering" | "stalled" | "relinking" | "relink-failed" | "codec-error" | "ended";

export type WatchdogState = {
  phase: WatchdogPhase;
  /** when play() was requested / `waiting` began (ms) — stall timers count from here */
  since: number | null;
  playedOnce: boolean;
  playingAt: number | null;
  noAudio: boolean;
  relinkTries: number;
  /** seconds shown in "Đang tải… (12 giây)" */
  stallSeconds: number;
};

export const initialWatchdog = (): WatchdogState => ({ phase: "idle", since: null, playedOnce: false, playingAt: null, noAudio: false, relinkTries: 0, stallSeconds: 0 });

export type WatchdogEvent =
  | { type: "play-requested"; at: number }
  | { type: "playing"; at: number }
  | { type: "waiting"; at: number }
  | { type: "pause" }
  | { type: "ended" }
  | { type: "tick"; at: number; audioBytes: number | null }
  | { type: "error"; code: number; probeOk: boolean }
  | { type: "relink-started" }
  | { type: "relink-ok"; at: number }
  | { type: "relink-failed" }
  | { type: "reset" };

export function reduceWatchdog(s: WatchdogState, ev: WatchdogEvent): WatchdogState {
  switch (ev.type) {
    case "reset":
      return initialWatchdog();
    case "play-requested":
      return s.phase === "playing" ? s : { ...s, phase: "loading", since: ev.at, stallSeconds: 0 };
    case "playing":
      return { ...s, phase: "playing", since: null, playedOnce: true, playingAt: s.playingAt ?? ev.at, stallSeconds: 0 };
    case "waiting":
      return s.phase === "playing" || s.phase === "idle" ? { ...s, phase: "buffering", since: ev.at, stallSeconds: 0 } : s;
    case "pause":
      return s.phase === "loading" || s.phase === "buffering" || s.phase === "stalled" ? { ...s, phase: "idle", since: null, stallSeconds: 0 } : s;
    case "ended":
      return { ...s, phase: "ended", since: null };
    case "tick": {
      let next = s;
      if (s.since !== null && (s.phase === "loading" || s.phase === "buffering" || s.phase === "stalled")) {
        const elapsed = ev.at - s.since;
        const limit = s.phase === "loading" ? STALL_START_MS : STALL_WAITING_MS;
        if (s.phase === "stalled" || elapsed >= limit) next = { ...next, phase: "stalled", stallSeconds: Math.floor(elapsed / 1000) };
      }
      if (!s.noAudio && s.playingAt !== null && ev.audioBytes === 0 && ev.at - s.playingAt >= NO_AUDIO_AFTER_MS) next = { ...next, noAudio: true };
      return next;
    }
    case "error": {
      // a dead link (probe failed) or a network error after a successful start → re-resolve; a decode/format error → codec dialog
      const linkDead = !ev.probeOk || (ev.code === 2 && s.playedOnce);
      if (linkDead) return s.relinkTries >= MAX_RELINK_TRIES ? { ...s, phase: "relink-failed", since: null } : { ...s, phase: "relinking", since: null };
      if (ev.code === 3 || ev.code === 4) return { ...s, phase: "codec-error", since: null };
      return s.relinkTries >= MAX_RELINK_TRIES ? { ...s, phase: "relink-failed", since: null } : { ...s, phase: "relinking", since: null };
    }
    case "relink-started":
      return { ...s, phase: "relinking", relinkTries: s.relinkTries + 1 };
    case "relink-ok":
      return { ...s, phase: "loading", since: ev.at, stallSeconds: 0 };
    case "relink-failed":
      return s.relinkTries >= MAX_RELINK_TRIES ? { ...s, phase: "relink-failed", since: null } : { ...s, phase: "relinking", since: null };
  }
}

/** What the centre overlay should show for a phase (null = nothing). */
export function overlayFor(s: WatchdogState, manifestLoaded: boolean): "loading-link" | "loading" | "buffering" | "stall" | "relink" | null {
  if (!manifestLoaded) return "loading-link";
  switch (s.phase) {
    case "loading":
      return "loading";
    case "buffering":
      return "buffering";
    case "stalled":
      return "stall";
    case "relinking":
      return "relink";
    default:
      return null;
  }
}
