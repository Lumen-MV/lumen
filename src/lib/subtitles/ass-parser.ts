import { cleanCueText, normalizeCues } from "./subtitle-text-clean";
import { parseTimestamp } from "./subtitle-timestamp";
import type { Cue } from "./subtitle-types";

/**
 * Advanced SubStation Alpha (.ass / .ssa) `[Events]` → cues. The `Format:` line maps the columns (Start, End, Text, …);
 * `Text` is always the last column, so commas inside it are preserved. Override tags `{\…}` are stripped, `\N` → line
 * break; drawing / positioning is ignored. Comment lines (`Comment:`) are skipped.
 */
export function parseAss(text: string): Cue[] {
  const lines = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  let format: string[] | null = null;
  let inEvents = false;
  const cues: Cue[] = [];
  for (const line of lines) {
    if (/^\[.*\]\s*$/.test(line)) {
      inEvents = /^\[Events\]/i.test(line);
      format = null;
      continue;
    }
    if (!inEvents) continue;
    if (/^Format:/i.test(line)) {
      format = line.slice(7).split(",").map((s) => s.trim().toLowerCase());
      continue;
    }
    if (!format || !/^Dialogue:/i.test(line)) continue;
    const textIdx = format.indexOf("text");
    const startIdx = format.indexOf("start");
    const endIdx = format.indexOf("end");
    if (textIdx < 0 || startIdx < 0 || endIdx < 0) continue;
    const parts = line.slice(9).split(",");
    if (parts.length <= textIdx) continue;
    const start = parseTimestamp(parts[startIdx]);
    const end = parseTimestamp(parts[endIdx]);
    if (start === null || end === null) continue;
    const t = cleanCueText(parts.slice(textIdx).join(","));
    if (t) cues.push({ start, end, text: t });
  }
  return normalizeCues(cues);
}
