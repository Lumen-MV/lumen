"use client";
import { copy } from "@/lib/copy-vi";
import { resetHours } from "@/lib/subtitles/quota-format";
import type { QuotaInfo } from "@/lib/subtitles/subtitle-types";

/** Amber `.small` under the list when the OpenSubtitles quota is gone (mockup popover-quota). */
export function QuotaNote({ quota }: { quota: QuotaInfo }) {
  return (
    <div className="small quota" data-quota-note role="status">
      {copy.subs.quota(resetHours(quota))}
    </div>
  );
}
