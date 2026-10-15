"use client";
import { Banner } from "@/components/ui/banner";
import { copy } from "@/lib/copy-vi";

/** `.banner.info` (all uncached) / `.banner.err` + "Thử lại" (TorBox down) above the rows — screen-detail.js picker(o.banner). */
export function SourcePickerBanner({ kind, onRetry }: { kind: "all-uncached" | "torbox-down"; onRetry: () => void }) {
  if (kind === "all-uncached") return <Banner kind="info">{copy.picker.bannerUncached}</Banner>;
  return (
    <Banner kind="err" action={{ label: copy.picker.retry, onClick: onRetry }}>
      {copy.picker.bannerDown}
    </Banner>
  );
}
