"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import type { ContinueItem } from "@/lib/play/player-manifest-types";
import { MediaRow } from "./media-row";
import { RemoveContinueDialog } from "./remove-continue-dialog";
import { useContinuePlay } from "./use-continue-play";
import { WideProgressCard } from "./wide-progress-card";

type Props = { items: ContinueItem[]; /** home: "Xem tất cả ›" → /my-list; My List passes its "Xoá lịch sử" action instead */ seeAllHref?: string; headerAction?: ReactNode; onItemsChange?: (items: ContinueItem[]) => void; style?: CSSProperties };

/** "Tiếp tục xem" section of wide cards; ✕ → confirm dialog → DELETE /api/progress?mediaKey= (optimistic); click → resume without prompt. */
export function ContinueWatchingRow({ items: initial, seeAllHref, headerAction, onItemsChange, style }: Props) {
  const [items, setItems] = useState(initial);
  const [removing, setRemoving] = useState<ContinueItem | null>(null);
  const { play, busyKey } = useContinuePlay();
  const { toast } = useToast();
  const update = (next: ContinueItem[]) => {
    setItems(next);
    onItemsChange?.(next);
  };
  const remove = async (item: ContinueItem) => {
    const prev = items;
    update(items.filter((i) => i.mediaKey !== item.mediaKey));
    try {
      const r = await fetch(`/api/progress?mediaKey=${encodeURIComponent(item.mediaKey)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`progress delete ${r.status}`);
    } catch (err) {
      console.warn("[continue] remove", err);
      update(prev);
      toast({ type: "err", text: copy.home.errRow });
    }
  };
  if (!items.length) return null;
  return (
    <>
      <MediaRow title={copy.home.rows.continue} seeAllHref={seeAllHref} headerAction={headerAction} style={style}>
        {items.map((it) => (
          <WideProgressCard key={it.mediaKey} item={it} busy={busyKey === it.mediaKey} onPlay={(i) => void play(i.mediaKey)} onRemove={setRemoving} />
        ))}
      </MediaRow>
      <RemoveContinueDialog item={removing} onClose={() => setRemoving(null)} onConfirm={(i) => void remove(i)} />
    </>
  );
}
