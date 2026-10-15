import { formatVttTime } from "./subtitle-timestamp";
import type { Cue } from "./subtitle-types";

/** Cue text → WebVTT payload: `&` / `<` escaped except the allowed <i> <b> <u> tags; `-->` and blank lines can never appear. */
export function escapeVttText(text: string): string {
  return text
    .replace(/&(?!(amp|lt|gt|nbsp|lrm|rlm|#\d+);)/g, "&amp;")
    .replace(/<(?!\/?[ibu]>)/g, "&lt;")
    .replace(/-->/g, "→")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .join("\n");
}

/** Cues → a complete WebVTT document (numbered identifiers, `hh:mm:ss.mmm` timings, LF line ends, trailing newline). */
export function cuesToVtt(cues: Cue[]): string {
  const blocks = cues.map((c, i) => `${i + 1}\n${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${escapeVttText(c.text)}`);
  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}
