import { describe, expect, it } from "vitest";
import { initialWatchdog, MAX_RELINK_TRIES, NO_AUDIO_AFTER_MS, overlayFor, reduceWatchdog, STALL_START_MS, STALL_WAITING_MS, type WatchdogEvent, type WatchdogState } from "@/lib/play/watchdog-state-machine";

/** Player watchdog: stall 8 s / 10 s, no-audio after 5 s of silence, codec vs link-expired classification, relink ×2. */
const run = (events: WatchdogEvent[], start: WatchdogState = initialWatchdog()) => events.reduce(reduceWatchdog, start);
const T = 1_000_000;

describe("watchdog: loading / buffering / stall", () => {
  it("play() without `playing` for 8 s → stalled with the elapsed seconds", () => {
    const s = run([{ type: "play-requested", at: T }, { type: "tick", at: T + 7_900, audioBytes: null }]);
    expect(s.phase).toBe("loading");
    const stalled = reduceWatchdog(s, { type: "tick", at: T + STALL_START_MS + 4_000, audioBytes: null });
    expect(stalled.phase).toBe("stalled");
    expect(stalled.stallSeconds).toBe(12);
    expect(overlayFor(stalled, true)).toBe("stall");
  });
  it("`waiting` while playing → buffering, > 10 s → stalled; `playing` clears it", () => {
    const s = run([{ type: "play-requested", at: T }, { type: "playing", at: T + 500 }, { type: "waiting", at: T + 5_000 }]);
    expect(s.phase).toBe("buffering");
    expect(overlayFor(s, true)).toBe("buffering");
    expect(reduceWatchdog(s, { type: "tick", at: T + 5_000 + STALL_WAITING_MS - 1, audioBytes: null }).phase).toBe("buffering");
    const stalled = reduceWatchdog(s, { type: "tick", at: T + 5_000 + STALL_WAITING_MS, audioBytes: null });
    expect(stalled.phase).toBe("stalled");
    expect(reduceWatchdog(stalled, { type: "playing", at: T + 20_000 }).phase).toBe("playing");
  });
  it("manifest not loaded → 'Đang lấy link từ Torbox…' overlay; pause while loading drops the spinner", () => {
    expect(overlayFor(initialWatchdog(), false)).toBe("loading-link");
    const s = run([{ type: "play-requested", at: T }, { type: "pause" }]);
    expect(s.phase).toBe("idle");
    expect(overlayFor(s, true)).toBeNull();
  });
});

describe("watchdog: no-audio", () => {
  it("0 decoded audio bytes 5 s after `playing` → noAudio (unknown bytes never trigger it)", () => {
    const playing = run([{ type: "play-requested", at: T }, { type: "playing", at: T + 1_000 }]);
    expect(reduceWatchdog(playing, { type: "tick", at: T + 1_000 + NO_AUDIO_AFTER_MS - 1, audioBytes: 0 }).noAudio).toBe(false);
    expect(reduceWatchdog(playing, { type: "tick", at: T + 1_000 + NO_AUDIO_AFTER_MS, audioBytes: null }).noAudio).toBe(false);
    expect(reduceWatchdog(playing, { type: "tick", at: T + 1_000 + NO_AUDIO_AFTER_MS, audioBytes: 4096 }).noAudio).toBe(false);
    expect(reduceWatchdog(playing, { type: "tick", at: T + 1_000 + NO_AUDIO_AFTER_MS, audioBytes: 0 }).noAudio).toBe(true);
  });
});

describe("watchdog: errors", () => {
  it("decode / format error with a live link → codec-error", () => {
    expect(run([{ type: "play-requested", at: T }, { type: "error", code: 4, probeOk: true }]).phase).toBe("codec-error");
    expect(run([{ type: "play-requested", at: T }, { type: "error", code: 3, probeOk: true }]).phase).toBe("codec-error");
  });
  it("dead link (probe failed) or network error after a successful start → relinking", () => {
    expect(run([{ type: "play-requested", at: T }, { type: "error", code: 4, probeOk: false }]).phase).toBe("relinking");
    expect(run([{ type: "play-requested", at: T }, { type: "playing", at: T + 1 }, { type: "error", code: 2, probeOk: true }]).phase).toBe("relinking");
  });
  it("relink succeeds → loading again, tries counted; two failures → relink-failed", () => {
    const first = run([{ type: "play-requested", at: T }, { type: "error", code: 2, probeOk: false }, { type: "relink-started" }]);
    expect(first.relinkTries).toBe(1);
    const ok = reduceWatchdog(first, { type: "relink-ok", at: T + 2_000 });
    expect(ok.phase).toBe("loading");
    expect(overlayFor(first, true)).toBe("relink");
    const again = run([{ type: "error", code: 2, probeOk: false }, { type: "relink-started" }, { type: "relink-failed" }], ok);
    expect(again.relinkTries).toBe(MAX_RELINK_TRIES);
    expect(again.phase).toBe("relink-failed");
    // a third error with no tries left goes straight to the dialog
    expect(reduceWatchdog(again, { type: "error", code: 2, probeOk: false }).phase).toBe("relink-failed");
    expect(reduceWatchdog(again, { type: "reset" })).toEqual(initialWatchdog());
  });
});
