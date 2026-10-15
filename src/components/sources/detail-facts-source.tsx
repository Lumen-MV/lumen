"use client";
import { copy } from "@/lib/copy-vi";
import { preferredIsStale } from "@/lib/sources/release-pref-select";
import { factsText } from "./detail-source-state";
import { useSources } from "./sources-provider";

const TONE = { green: undefined, grey: { color: "#aaa" }, amber: { color: "#f59e0b" } } as const;

/**
 * First `.facts` span: `.match` green "Đã cache · Phát trực tiếp" / grey "Chưa cache · 2–10 phút để tải" / amber "Đã cache · Cần app (MKV DTS)".
 * A remembered release that is no longer cached adds the small grey note "Bản đã chọn không còn sẵn, dùng bản đề xuất".
 */
export function DetailFactsSource() {
  const s = useSources();
  const { text, tone } = factsText(s.detailState, s.primary);
  const stale = s.status === "ready" && preferredIsStale(s.data);
  return (
    <>
      <span className={tone === "green" ? "match" : undefined} style={TONE[tone]} data-facts={s.detailState}>
        {text}
      </span>
      {stale && (
        <span style={{ color: "#888", fontSize: 12 }} data-pref-note="gone">
          {copy.detailSource.prefGone}
        </span>
      )}
    </>
  );
}
