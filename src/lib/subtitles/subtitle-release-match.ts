import { parseRelease } from "@/lib/sources/release-parser";

/**
 * How closely a community subtitle's release name matches the release being played. A subtitle file is timed for ONE
 * release (a WEB-DL and a BluRay differ by studio intros / cuts; a 25 fps rip drifts against a 23.976 one), so the
 * most-downloaded file is often the wrong one for the torrent Torrentio picked. Pure, client-safe; feeds the ranking.
 */
export type PlayingRelease = { title: string; fileName?: string };

export const MATCH_EXACT = 8;
export const MATCH_GROUP = 4;
export const MATCH_SOURCE = 2;
export const MATCH_RESOLUTION = 1;
/** A CAM / telesync subtitle against a proper release: timed for a cinema recording, ranks below everything else. */
export const MATCH_CAM_PENALTY = -5;
/** Score from which a track is shown as "khớp bản đang phát" (same release group, or the same release name). */
export const MATCH_CONFIDENT = MATCH_GROUP;

/** Subtitle names carry a subtitle extension and often a language suffix (`…-CMRG.vi.srt`) that would hide the group. */
const cleanSubName = (s: string): string => s.trim().replace(/\.(srt|ass|ssa|vtt|sub)$/i, "").replace(/[._ -](vi|vie|en|eng|vietnamese|english)$/i, "");
const normalize = (s: string): string => s.toLowerCase().replace(/\.(srt|ass|ssa|vtt|mkv|mp4|avi|m4v)$/, "").replace(/[^a-z0-9]+/g, "");
/** BluRay / REMUX / BDRip share timing; WEB-DL / WEBRip / WEB share timing (same streaming master). */
const sourceFamily = (source: string): string => (/remux|blu/i.test(source) ? "bluray" : /web/i.test(source) ? "web" : source.toLowerCase());

export function releaseMatchScore(subName: string, playing: PlayingRelease | null): number {
  if (!playing || !subName.trim()) return 0;
  const name = cleanSubName(subName);
  const sub = parseRelease(name);
  const play = parseRelease(playing.title, playing.fileName);
  let score = 0;
  if (sub.group && play.group && sub.group.toLowerCase() === play.group.toLowerCase()) score += MATCH_GROUP;
  if (sub.source && play.source && sourceFamily(sub.source) === sourceFamily(play.source)) score += MATCH_SOURCE;
  if (sub.resolution !== "SD" && sub.resolution === play.resolution) score += MATCH_RESOLUTION;
  if (sub.bad && !play.bad) score += MATCH_CAM_PENALTY;
  // the subtitle was named after the very same release (`Title.2021.1080p.WEB-DL.x264-CMRG` ⊂ `…-CMRG.vi`)
  const n = normalize(name);
  const titles = [playing.title, playing.fileName ?? ""].map(normalize).filter((t) => t.length >= 12);
  if (titles.some((t) => n === t || n.includes(t))) score += MATCH_EXACT;
  return score;
}

/** Compact "NTb · WEB-DL · 1080p" shown under a track when a language has several files; the raw name when nothing parses. */
export function releaseTag(subName: string): string {
  const name = cleanSubName(subName);
  const p = parseRelease(name);
  const parts = [p.group, p.source, p.resolution !== "SD" ? p.resolution : ""].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return name.length > 36 ? `${name.slice(0, 35)}…` : name;
}
