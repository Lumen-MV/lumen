"use client";
import { MiniProgressBar } from "@/components/ui/mini-progress-bar";
import { Tag } from "@/components/ui/tag";
import { copy } from "@/lib/copy-vi";
import type { CloudJob, PlayClass } from "@/lib/sources/sources-types";

type Props = { cacheState: "cached" | "uncached"; job?: CloudJob; playClass: PlayClass };

/**
 * `.l1` tags exactly like srcRow(): cache tag by state — `.tag.g` Đã cache · `.tag.x` Chưa cache · blue fill "Đang tải 73%" +
 * `.mini` + "~1 phút" · `.tag.o` "Xếp hàng · 10/10 slot" · red "Tải thất bại (ít seed)" — then the play-class tag.
 */
export function SourceRowBadges({ cacheState, job, playClass }: Props) {
  const t = copy.tags;
  const p = copy.picker;
  return (
    <>
      {job?.state === "downloading" ? (
        <>
          <Tag kind="blue">{t.downloading(job.progress)}</Tag>
          <MiniProgressBar percent={job.progress} />
          {job.etaMin !== undefined && <span style={{ color: "#888", fontSize: 12 }}>{p.eta(job.etaMin)}</span>}
        </>
      ) : job?.state === "queued" ? (
        <Tag kind="o">{p.queuedSlots(job.queuedSlots?.active ?? 0, job.queuedSlots?.limit ?? 0)}</Tag>
      ) : job?.state === "error" ? (
        <Tag kind="red">{job.errorMsg || p.failed}</Tag>
      ) : cacheState === "cached" ? (
        <Tag kind="g">{t.cached}</Tag>
      ) : (
        <Tag kind="x">{t.uncached}</Tag>
      )}
      {playClass === "direct" ? <Tag kind="b">{t.direct}</Tag> : playClass === "maybe" ? <Tag kind="b-outline">{t.maybe}</Tag> : <Tag kind="o">{t.app}</Tag>}
    </>
  );
}
