/**
 * Cue payload → inline segments for the band. Only `<i>`, `<b>`, `<u>` survive (as flags on the segment — the band
 * emits real React elements, never HTML); every other tag is dropped. Unbalanced tags are tolerated.
 */
export type CueSegment = { text: string; i: boolean; b: boolean; u: boolean };
const TAG = /(<\/?[ibu]>)/i;

export function tokenizeCueMarkup(line: string): CueSegment[] {
  const flags = { i: false, b: false, u: false };
  const out: CueSegment[] = [];
  for (const part of line.split(TAG)) {
    const m = part.match(/^<(\/?)([ibu])>$/i);
    if (m) {
      flags[m[2].toLowerCase() as "i" | "b" | "u"] = m[1] === "";
      continue;
    }
    const text = part.replace(/<[^>]*>/g, "");
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.i === flags.i && last.b === flags.b && last.u === flags.u) last.text += text;
    else out.push({ text, ...flags });
  }
  return out;
}

/** Plain text of a line (tags removed) — used where markup cannot be rendered (tests, aria). */
export const stripCueMarkup = (line: string): string => tokenizeCueMarkup(line).map((s) => s.text).join("");
