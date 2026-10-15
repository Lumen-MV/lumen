"use client";
import { copy } from "@/lib/copy-vi";
import { formatClock } from "@/lib/format/time-format";
import { primaryLabel } from "./detail-source-state";
import { useSources } from "./sources-provider";

/**
 * Hero `.btn.w` per the phase-03 state table: "▶ Phát · 1080p" / "📺 Xem bằng app · 1080p" / "⬇ Tải lên cloud · 1080p" /
 * "⟳ Đang tìm nguồn…" (opacity .7, disabled) / "Không có nguồn" (opacity .4, not-allowed, tooltip). Inline styles = mockup.
 * Movie with saved progress (detail `resume`): "▶ Tiếp tục · 1:01:12" + the small "Xem từ đầu" link (`/watch?t=0`).
 * The label follows `s.primary` (the viewer's "Lần trước" release when it applies, else the best row).
 */
export function DetailPrimaryButton() {
  const s = useSources();
  const rel = s.primary;
  const state = s.detailState;
  const busy = rel !== null && s.actions.busyHash === rel.hash;
  const style = state === "loading" ? { opacity: 0.7 } : state === "none" ? { opacity: 0.4, cursor: "not-allowed" } : undefined;
  const playable = state === "direct" || state === "maybe";
  const resume = playable && s.resume ? s.resume : null;
  const label = busy ? copy.detail.gettingLink : resume ? copy.progressUi.continueAt(formatClock(resume.positionS)) : primaryLabel(state, rel);
  return (
    <>
      <button type="button" className="btn w" style={style} disabled={state === "loading" || state === "none" || busy} title={state === "none" ? copy.detailSource.noneTip : undefined} data-primary={state} data-primary-hash={rel?.hash} data-preferred={s.data?.preferredApplies || undefined} data-resume={resume ? Math.floor(resume.positionS) : undefined} aria-busy={busy || undefined} onClick={() => s.primaryAction()}>
        {label}
      </button>
      {resume && rel && (
        <a className="restart" role="button" tabIndex={0} data-action="restart" onClick={() => void s.actions.play(rel, { restart: true }, "primary")} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && void s.actions.play(rel, { restart: true }, "primary")}>
          {copy.progressUi.restart}
        </a>
      )}
    </>
  );
}
