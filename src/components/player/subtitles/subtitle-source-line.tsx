"use client";
import { sourceLineFor } from "@/lib/subtitles/subtitle-track-ranking";
import type { SubTrack } from "@/lib/subtitles/subtitle-types";

/** Popover footer `.small` "Phụ đề: OpenSubtitles · 81k lượt tải" / "Phụ đề: Dịch AI (DeepSeek)" (nothing when off). */
export function SubtitleSourceLine({ track }: { track: SubTrack | null }) {
  if (!track) return null;
  return <div className="small" data-source-line>{sourceLineFor(track)}</div>;
}
