/** `.mini > i` — 70px inline progress bar used in rows/tables. */
export function MiniProgressBar({ percent, color }: { percent: number; color?: string }) {
  const w = Math.max(0, Math.min(100, percent));
  return (
    <span className="mini" role="progressbar" aria-valuenow={w} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${w}%`, ...(color ? { background: color } : {}) }} />
    </span>
  );
}
