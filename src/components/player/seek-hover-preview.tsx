"use client";
import { formatClock } from "@/lib/format/time-format";

/** half the 160px thumb + its 2px borders: the preview is clamped so it never leaves the track at 0 % / 100 % */
const HALF_W = 82;

/** Mockup `seek-hover`: 160×90 thumbnail box (backdrop placeholder, 2px white border) + 13px time, centred on the hover x. */
export function SeekHoverPreview({ time, pct, backdropUrl }: { time: number; pct: number; backdropUrl: string | null }) {
  return (
    <div className="seekprev" style={{ left: `clamp(${HALF_W}px, ${pct}%, calc(100% - ${HALF_W}px))` }} data-seek-preview>
      <div className="thumb" style={backdropUrl ? { backgroundImage: `url(${backdropUrl})` } : undefined} />
      <div className="t">{formatClock(time)}</div>
    </div>
  );
}
