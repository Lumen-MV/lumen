"use client";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy-vi";

/** `.bulkbar` "Đã chọn 3" + `.btn.sm` "Bỏ khỏi danh sách (3)" + "Huỷ" (fixed, bottom centre). */
export function BulkActionBar({ count, busy, onRemove, onCancel }: { count: number; busy: boolean; onRemove: () => void; onCancel: () => void }) {
  const m = copy.myList;
  return (
    <div className="bulkbar" role="toolbar" data-bulkbar>
      {m.selected(count)}{" "}
      <Button size="sm" loading={busy} disabled={count === 0} data-action="bulk-remove" onClick={onRemove}>
        {m.removeN(count)}
      </Button>
      <Button size="sm" data-action="bulk-cancel" onClick={onCancel}>
        {copy.common.cancel}
      </Button>
    </div>
  );
}
