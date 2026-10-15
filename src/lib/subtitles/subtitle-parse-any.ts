import { parseAss } from "./ass-parser";
import { parseSrt } from "./srt-parser";
import type { Cue } from "./subtitle-types";
import { parseVtt } from "./vtt-parser";

export type SubtitleFormat = "srt" | "ass" | "vtt";

/** Sniff the container from the text (file names from providers lie often enough). */
export function detectSubtitleFormat(text: string, fileName = ""): SubtitleFormat {
  const head = text.replace(/^﻿/, "").slice(0, 4000);
  if (/^WEBVTT/.test(head)) return "vtt";
  if (/^\[Script Info\]/im.test(head) || /^\[Events\]/im.test(head) || /\.(ass|ssa)$/i.test(fileName)) return "ass";
  return "srt";
}

/** Any supported subtitle text → normalised cues (empty array when nothing parses). */
export function parseSubtitleText(text: string, fileName = ""): { format: SubtitleFormat; cues: Cue[] } {
  const format = detectSubtitleFormat(text, fileName);
  if (format === "vtt") return { format, cues: parseVtt(text) };
  if (format === "ass") return { format, cues: parseAss(text) };
  return { format, cues: parseSrt(text) };
}
