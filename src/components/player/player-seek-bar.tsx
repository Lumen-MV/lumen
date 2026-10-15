"use client";
import { useCallback, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { copy } from "@/lib/copy-vi";
import { formatClock } from "@/lib/format/time-format";
import { SeekHoverPreview } from "./seek-hover-preview";

type Props = { current: number; duration: number; buffered: number; onSeek: (t: number) => void; showRemaining: boolean; onToggleRemaining: () => void; backdropUrl: string | null };

/**
 * `.seek > .trk(.buf .pos .dot) + span.time` — buffered grey, played red, red dot handle; drag / click seeks; hover shows
 * the time + thumbnail preview; the clock toggles remaining (`-1:01:12`) on click.
 */
export function PlayerSeekBar({ current, duration, buffered, onSeek, showRemaining, onToggleRemaining, backdropUrl }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ pct: number; time: number } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const pctOf = useCallback((clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }, []);
  const played = duration > 0 ? ((dragging ?? current) / duration) * 100 : 0;
  const buf = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const p = pctOf(e.clientX);
    setHover({ pct: p * 100, time: p * duration });
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(pctOf(e.clientX) * duration);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging !== null) setDragging(pctOf(e.clientX) * duration);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging === null) return;
    const t = pctOf(e.clientX) * duration;
    setDragging(null);
    onSeek(t);
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      onSeek(current + (e.key === "ArrowLeft" ? -10 : 10));
    }
  };
  const shown = showRemaining && duration > 0 ? `-${formatClock(duration - (dragging ?? current))}` : formatClock(dragging ?? current);
  return (
    <div className="seek">
      <div ref={trackRef} className="trk" role="slider" tabIndex={0} aria-label={copy.player.aria.seek} aria-valuemin={0} aria-valuemax={Math.floor(duration)} aria-valuenow={Math.floor(current)} aria-valuetext={formatClock(current)} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDragging(null)} onKeyDown={onKey}>
        <div className="buf" style={{ width: `${buf}%` }} />
        <div className="pos" style={{ width: `${played}%` }} />
        <div className="dot" style={{ left: `${played}%` }} />
        {hover && duration > 0 && <SeekHoverPreview time={hover.time} pct={hover.pct} backdropUrl={backdropUrl} />}
      </div>
      <span className="time" role="button" tabIndex={0} aria-label={copy.player.aria.time} data-remaining={showRemaining || undefined} onClick={onToggleRemaining} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggleRemaining()}>
        {shown}
      </span>
    </div>
  );
}
