/** Timestamp helpers shared by the SRT / ASS / VTT parsers and the VTT writer. */

/** `hh:mm:ss,mmm` · `hh:mm:ss.mmm` · `mm:ss.mmm` · ASS `h:mm:ss.cc` → ms, or null when malformed. */
export function parseTimestamp(raw: string): number | null {
  const m = raw.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const s = Number(m[3]);
  const frac = Number(m[4].padEnd(3, "0"));
  if (min > 59 || s > 59) return null;
  return ((h * 60 + min) * 60 + s) * 1000 + frac;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** ms → `hh:mm:ss.mmm` (WebVTT) */
export function formatVttTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(t % 1000, 3)}`;
}

/** `start --> end` line → [startMs, endMs] (VTT allows cue settings after the end time; they are ignored). */
export function parseCueTimingLine(line: string): [number, number] | null {
  const m = line.match(/^\s*(\S+)\s*-->\s*(\S+)/);
  if (!m) return null;
  const start = parseTimestamp(m[1]);
  const end = parseTimestamp(m[2]);
  return start === null || end === null ? null : [start, end];
}
