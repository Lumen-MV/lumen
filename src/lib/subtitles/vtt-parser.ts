import { normalizeCues } from "./subtitle-text-clean";
import { parseCueTimingLine } from "./subtitle-timestamp";
import type { Cue } from "./subtitle-types";

const unescape = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");

/**
 * WebVTT → cues (header check, NOTE / STYLE / REGION blocks skipped, optional identifiers, cue settings ignored).
 * Used by the player band (fetch + render), by the translate job to read a cached source file, and by the tests to
 * prove the writer's output is valid. Throws on a missing `WEBVTT` header.
 */
export function parseVtt(text: string): Cue[] {
  const body = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!/^WEBVTT(\s|$)/.test(body)) throw new Error("not a WebVTT file");
  const cues: Cue[] = [];
  const blocks = body.split(/\n{2,}/).slice(1);
  for (const block of blocks) {
    const lines = block.split("\n");
    if (/^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0] ?? "")) continue;
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const timing = parseCueTimingLine(lines[ti]);
    if (!timing) continue;
    const t = unescape(lines.slice(ti + 1).join("\n")).split("\n").map((l) => l.trim()).filter((l) => l !== "").join("\n");
    if (t) cues.push({ start: timing[0], end: timing[1], text: t });
  }
  return normalizeCues(cues);
}

/** Strict structural check used by tests: header, every block = optional id + timing + ≥ 1 non-empty payload line, ascending starts. */
export function validateVtt(text: string): string[] {
  const problems: string[] = [];
  if (!/^WEBVTT\n\n/.test(text)) problems.push("header");
  if (!text.endsWith("\n")) problems.push("trailing newline");
  let lastStart = -1;
  for (const block of text.replace(/^WEBVTT\n\n/, "").trimEnd().split(/\n{2,}/)) {
    const lines = block.split("\n");
    const ti = lines.findIndex((l) => /^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}$/.test(l));
    if (ti < 0 || ti > 1) problems.push(`timing: ${lines[0]}`);
    const timing = ti >= 0 ? parseCueTimingLine(lines[ti]) : null;
    if (!timing || timing[1] <= timing[0]) problems.push(`range: ${lines[ti]}`);
    if (timing && timing[0] < lastStart) problems.push(`order: ${lines[ti]}`);
    if (timing) lastStart = timing[0];
    if (lines.slice(ti + 1).filter((l) => l.trim() !== "").length === 0) problems.push(`empty payload at ${lines[ti]}`);
    if (lines.slice(ti + 1).some((l) => l.includes("-->"))) problems.push("arrow in payload");
  }
  return problems;
}
