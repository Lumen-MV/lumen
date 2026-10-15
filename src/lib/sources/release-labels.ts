import type { ParsedRelease } from "./sources-types";

/** Display labels for a parsed release (pure; shared by the service and the detail "Nguồn tốt nhất" text). */
const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** "2.7 GB" / "850 MB" (one decimal for GB, like Torrentio's stats line). */
export function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "?";
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  return `${Math.round(bytes / MB)} MB`;
}

/** Torrentio stats "💾 12.3 GB" / "💾 850 MB" → bytes. */
export function parseSizeToBytes(text: string): number {
  const m = text.match(/([\d.]+)\s*(GB|MB|KB)/i);
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = m[2].toUpperCase();
  return Math.round(n * (unit === "GB" ? GB : unit === "MB" ? MB : 1024));
}

export const qualityLabel = (p: ParsedRelease): string => p.resolution;

/** Codec half of "MP4 · H.264": x264 → H.264; x265 → x265 (HEVC when the name says so); AV1/HDR-only → HDR; else source. */
export function codecLabel(p: ParsedRelease, name: string): string {
  if (p.codec === "x264") return "H.264";
  if (p.codec === "x265") return /\bHEVC\b/i.test(name) && !/\bx265\b/i.test(name) ? "HEVC" : "x265";
  if (p.hdr.length) return "HDR";
  if (p.codec === "av1") return "AV1";
  return p.source;
}

/** "MP4 · H.264" — container unknown → just the codec label. */
export function formatLabel(p: ParsedRelease, name: string): string {
  const c = codecLabel(p, name);
  const container = p.container === "unknown" ? "" : p.container.toUpperCase();
  return [container, c].filter(Boolean).join(" · ");
}

/** "AAC 5.1" / "DDP 5.1 Atmos" / "AAC" (no audio tag → "AAC" for MP4 files, else "" and the meta line skips it). */
export function audioLabel(p: ParsedRelease): string {
  if (p.audio.length) return p.audio.join(" ");
  return p.container === "mp4" ? "AAC" : "";
}

/** Short container+codec label for "Nguồn tốt nhất: 1080p MP4 · 2.7 GB · YTS". */
export function shortContainer(p: ParsedRelease): string {
  return p.container === "unknown" ? codecLabel(p, "") || "?" : p.container.toUpperCase();
}
