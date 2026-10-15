"use client";
import { useEffect, useRef } from "react";
import { copy } from "@/lib/copy-vi";
import { formatOffsetSeconds } from "@/lib/subtitles/cue-offset";
import { OFFSET_LONG_PRESS_STEP_MS, OFFSET_STEP_MS } from "@/lib/subtitles/subtitle-types";

type Props = { offsetMs: number; onChange: (deltaMs: number) => void };
const LONG_PRESS_MS = 500;
const REPEAT_MS = 400;

/** `.ctrl` "Lệch thời gian  − 0.0s +": click ±0.1 s, hold ≥ 0.5 s → ±0.5 s repeated; keyboard Enter/Space = ±0.1 s. */
export function SubtitleOffsetControl({ offsetMs, onChange }: Props) {
  const s = copy.subs;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const longFired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    if (repeat.current) clearInterval(repeat.current);
    timer.current = null;
    repeat.current = null;
  };
  useEffect(() => clear, []);

  const press = (dir: 1 | -1) => {
    longFired.current = false;
    clear();
    timer.current = setTimeout(() => {
      longFired.current = true;
      onChange(dir * OFFSET_LONG_PRESS_STEP_MS);
      repeat.current = setInterval(() => onChange(dir * OFFSET_LONG_PRESS_STEP_MS), REPEAT_MS);
    }, LONG_PRESS_MS);
  };
  const release = (dir: 1 | -1) => {
    const wasLong = longFired.current;
    clear();
    if (!wasLong && timer.current === null) onChange(dir * OFFSET_STEP_MS);
    longFired.current = false;
  };
  const btn = (dir: 1 | -1, label: string, action: string) => (
    <button
      type="button"
      className="step"
      data-action={action}
      aria-label={`${s.offset} ${label}`}
      onPointerDown={(e) => { e.preventDefault(); press(dir); }}
      onPointerUp={() => release(dir)}
      onPointerLeave={() => { if (timer.current || repeat.current) { clear(); longFired.current = true; } }}
      onPointerCancel={clear}
      onClick={(e) => { if (e.detail === 0) onChange(dir * OFFSET_STEP_MS); }} // keyboard activation only (pointer path handled above)
    >
      {label}
    </button>
  );
  const value = formatOffsetSeconds(offsetMs);
  return (
    <div className="ctrl" data-ctrl="offset">
      <span>{s.offset}</span>
      <b aria-label={s.offsetAria(value)}>
        {btn(-1, s.offsetMinus, "offset-minus")} <span data-offset-value>{s.offsetValue(value)}</span> {btn(1, s.offsetPlus, "offset-plus")}
      </b>
    </div>
  );
}
