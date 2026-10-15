import type { Cue } from "./subtitle-types";

/**
 * Cues → a SubRip document for the hand-off players (Infuse / VLC take `.srt` sidecars everywhere; WebVTT support is
 * patchy and its positioning is ignored anyway). Numbered blocks, `hh:mm:ss,mmm --> hh:mm:ss,mmm`, CRLF line ends,
 * UTF-8 without BOM. `<i>` / `<b>` / `<u>` survive (SubRip players render them); every other tag — WebVTT voice /
 * class spans, `<font>`, positioning — is stripped so no player shows raw markup. Blank payload lines are dropped
 * (they would end the block early) and `-->` can never appear inside a payload.
 */
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** ms → `hh:mm:ss,mmm` (SubRip) */
export function formatSrtTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(t % 1000, 3)}`;
}

export function srtCueText(text: string): string {
  return text
    .replace(/<\/?(?!\/?[ibu]>)[^>]*>/gi, "")
    .replace(/-->/g, "→")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .join("\r\n");
}

export function cuesToSrt(cues: Cue[]): string {
  const blocks: string[] = [];
  for (const c of cues) {
    const text = srtCueText(c.text);
    if (!text) continue;
    blocks.push(`${blocks.length + 1}\r\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\r\n${text}`);
  }
  return blocks.length ? `${blocks.join("\r\n\r\n")}\r\n` : "";
}
