"use client";
import { copy } from "@/lib/copy-vi";

type Props = { state: "idle" | "running" | "error"; percent: number; onTranslate: () => void };

/**
 * `.it.ai` "＋ Dịch sang tiếng Việt bằng AI" (+ hint) → "⟳ Đang dịch sang tiếng Việt… 42%" with the 120 px `.mini` bar →
 * red "✕ Dịch lỗi (DeepSeek không phản hồi) · Thử lại" (mockup popover-none / -translating / -translate-failed).
 */
export function TranslateAiRow({ state, percent, onTranslate }: Props) {
  const s = copy.subs;
  if (state === "running")
    return (
      <div className="it ai" data-translate="running" role="status" aria-live="polite">
        {s.translating(percent)}
        <span className="mini" style={{ width: 120 }}>
          <i style={{ width: `${percent}%` }} />
        </span>
      </div>
    );
  if (state === "error")
    return (
      <div className="it err" data-translate="error" role="status">
        {s.translateFailed}
        <button type="button" className="linkbtn" data-action="retry-translate" onClick={onTranslate}>
          <u>{s.retry}</u>
        </button>
      </div>
    );
  return (
    <button type="button" className="it ai" data-translate="idle" data-action="translate" onClick={onTranslate}>
      {s.translate}
      <small>{s.translateHint}</small>
    </button>
  );
}
