import { Tag } from "@/components/ui/tag";
import { copy } from "@/lib/copy-vi";
import type { CloudJob } from "@/lib/sources/sources-types";

type Props = { cacheState?: "cached" | "uncached"; job?: CloudJob };

/** Episode row chip: `.tag.g` Đã cache · `.tag.x` Chưa cache · blue "Đang tải 40%" · `.tag.o` Xếp hàng · red Lỗi. Unknown → nothing (`.watched` arrives in Phase 4). */
export function EpisodeStatusChip({ cacheState, job }: Props) {
  if (job?.state === "downloading") return <Tag kind="blue">{copy.tags.downloading(job.progress)}</Tag>;
  if (job?.state === "queued") return <Tag kind="o">{copy.tags.queued}</Tag>;
  if (job?.state === "error") return <Tag kind="red">{copy.tags.error}</Tag>;
  if (cacheState === "cached") return <Tag kind="g">{copy.tags.cached}</Tag>;
  if (cacheState === "uncached") return <Tag kind="x">{copy.tags.uncached}</Tag>;
  return null;
}
