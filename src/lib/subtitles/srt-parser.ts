import { cleanCueText, normalizeCues } from "./subtitle-text-clean";
import { parseCueTimingLine } from "./subtitle-timestamp";
import type { Cue } from "./subtitle-types";

/**
 * SubRip → cues. Tolerant of: BOM, CRLF, missing / non-numeric index lines, `.` instead of `,` in timestamps, extra blank
 * lines inside a block (joined) and trailing garbage. Blocks without a valid timing line are skipped; the result is
 * normalised (sorted, invalid / nested-overlapping cues dropped).
 */
export function parseSrt(text: string): Cue[] {
  const body = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const cues: Cue[] = [];
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split("\n");
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const timing = parseCueTimingLine(lines[ti]);
    if (!timing) continue;
    const t = cleanCueText(lines.slice(ti + 1).join("\n"));
    if (t) cues.push({ start: timing[0], end: timing[1], text: t });
  }
  return normalizeCues(cues);
}
