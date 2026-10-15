"use client";
import { bestSourceText } from "./detail-source-state";
import { useSources } from "./sources-provider";

/** kv "Nguồn tốt nhất:" value — "1080p MP4 · 2.7 GB · YTS" (+ " (chưa cache)" / " (cần app)"), "…" while loading, "—" when none. */
export function BestSourceLabel() {
  const s = useSources();
  return <span data-best={s.detailState}>{bestSourceText(s.detailState, s.data?.best ?? null)}</span>;
}
