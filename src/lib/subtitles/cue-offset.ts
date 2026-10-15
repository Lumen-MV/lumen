import { OFFSET_LIMIT_MS, type Cue } from "./subtitle-types";

/**
 * Offset math for the band (client) and its tests. A positive offset shows every cue LATER: the cue whose window
 * contains `videoMs - offsetMs` is active. Cues are sorted by start (parsers normalise) but may overlap or nest
 * (an ASS sign spanning several dialogue lines), so a binary search finds the last cue that has started and the scan
 * walks backwards no further than the longest cue of the file (cached per array).
 */
const spanCache = new WeakMap<Cue[], number>();
const longestCue = (cues: Cue[]): number => {
  let span = spanCache.get(cues);
  if (span === undefined) {
    span = cues.reduce((m, c) => Math.max(m, c.end - c.start), 0);
    spanCache.set(cues, span);
  }
  return span;
};

export function activeCueTexts(cues: Cue[], videoMs: number, offsetMs: number): string[] {
  const t = videoMs - offsetMs;
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) lo = mid + 1;
    else hi = mid;
  }
  const floor = t - longestCue(cues);
  const out: string[] = [];
  for (let i = lo - 1; i >= 0 && cues[i].start >= floor; i--) if (cues[i].end > t) out.push(cues[i].text);
  return out.reverse();
}

/** Clamp to ±60 s and snap to 100 ms so repeated ±0.1 clicks never drift (floating point). */
export function clampOffset(ms: number): number {
  const snapped = Math.round(ms / 100) * 100;
  return Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, snapped));
}

/** "0.0" · "+0.5" · "-1.2" for the `− 0.0s +` control */
export function formatOffsetSeconds(ms: number): string {
  const s = (ms / 1000).toFixed(1);
  return ms > 0 ? `+${s}` : ms < 0 ? s : "0.0";
}

/** Shift every cue (used when a VTT is re-exported with a baked-in offset; the band itself shifts at render time). */
export function shiftCues(cues: Cue[], deltaMs: number): Cue[] {
  return cues.map((c) => ({ ...c, start: Math.max(0, c.start + deltaMs), end: Math.max(0, c.end + deltaMs) })).filter((c) => c.end > c.start);
}
