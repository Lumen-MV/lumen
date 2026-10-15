import type { Cue } from "./subtitle-types";

/**
 * Cue text normalisation shared by every parser: ASS drawing blocks (`{\p1}…{\p0}`, pure `m 0 0 l …` command lines)
 * are removed, override tags `{\an8}` / `{\pos(…)}` go, `\N` / `\n` become line breaks, `\h` a space, `<br>` a line
 * break, HTML tags other than <i> <b> <u> are stripped (SRT `<font>` colours, WebVTT voice / class spans), and
 * surrounding whitespace / empty lines are trimmed. Returns "" for cues with nothing to show.
 */
const DRAWING_BLOCK = /\{[^}]*\\p[1-9]\d*[^}]*\}[\s\S]*?(?:\{[^}]*\\p0[^}]*\}|$)/g;
const DRAWING_ONLY = /^(?:[mnlbspc]\s+(?:-?\d+(?:\.\d+)?\s*)+)+$/i;

export function cleanCueText(raw: string): string {
  return raw
    .replace(DRAWING_BLOCK, "")
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\\N/gi, "\n")
    .replace(/\\h/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?!\/?[ibu]>)[^>]*>/gi, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l !== "" && !DRAWING_ONLY.test(l))
    .join("\n");
}

/** Re-clean cues that came from an external VTT (ffmpeg extraction) — `<v>`/`<c>` spans, drawing lines, empties. */
export function cleanCues(cues: Cue[]): Cue[] {
  return normalizeCues(cues.map((c) => ({ ...c, text: cleanCueText(c.text) })));
}

/**
 * Sort by start (then end); drop invalid (end ≤ start, negative start), empty and exact duplicates (same timing AND
 * text). Everything else is kept as-is: nested cues (an ASS sign over dialogue), identical-timing cues from two
 * speakers and partial overlaps all render simultaneously — the band and native <track> both support multiple
 * active cues, so trimming or dropping them only loses dialogue.
 */
export function normalizeCues(cues: Cue[]): Cue[] {
  const sorted = cues.filter((c) => c.text !== "" && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start && c.start >= 0).sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Cue[] = [];
  const seen = new Set<string>();
  for (const c of sorted) {
    const key = `${c.start}|${c.end}|${c.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c });
  }
  return out;
}
