/**
 * Rules for the native `<track>` that shadows the DOM band (client-safe, unit-tested). iOS Safari's full screen is the
 * system player (`webkitEnterFullscreen`): it paints only native cues, never our `.subs` band, so the selected VTT is
 * also attached as a real `<track>` — `hidden` while the band renders (no double subtitles), `showing` only while the
 * video element itself is full screen.
 */
export type NativeTrackMode = "hidden" | "showing";
export type NativeFsEvent = "webkitbeginfullscreen" | "webkitendfullscreen" | "fullscreenchange";

/** Next "the video element itself is full screen" flag after one of the three events. */
export function nextNativeFullscreen(event: NativeFsEvent, ctx: { fullscreenElementIsVideo: boolean; webkitDisplayingFullscreen: boolean }): boolean {
  if (event === "webkitbeginfullscreen") return true;
  if (event === "webkitendfullscreen") return false;
  // standard API (iPadOS / desktop): only the element matters — our container going full screen keeps the band
  return ctx.fullscreenElementIsVideo || ctx.webkitDisplayingFullscreen;
}

export const nativeTrackMode = (nativeFullscreen: boolean): NativeTrackMode => (nativeFullscreen ? "showing" : "hidden");

/** The subset of VTTCue the offset touches (real cues in the browser, plain objects in tests). */
export type TimedCue = { startTime: number; endTime: number };
export type CueBaseTimes = WeakMap<TimedCue, { start: number; end: number }>;

/**
 * Apply the viewer's offset to native cues the way the band does (+offset = every cue later). The file's own times are
 * remembered per cue the first time it is seen, so re-applying never drifts; starts are clamped at 0 like `shiftCues`.
 */
export function applyNativeCueOffset(cues: Iterable<TimedCue>, base: CueBaseTimes, offsetMs: number): number {
  let n = 0;
  for (const cue of cues) {
    let b = base.get(cue);
    if (!b) {
      b = { start: cue.startTime, end: cue.endTime };
      base.set(cue, b);
    }
    const start = Math.max(0, b.start + offsetMs / 1000);
    const end = Math.max(start, b.end + offsetMs / 1000);
    if (cue.startTime !== start) cue.startTime = start;
    if (cue.endTime !== end) cue.endTime = end;
    n++;
  }
  return n;
}
