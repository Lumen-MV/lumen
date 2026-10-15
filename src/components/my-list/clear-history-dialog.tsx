"use client";
import { Dialog } from "@/components/ui/dialog";
import { copy } from "@/lib/copy-vi";

/** my-list.html `clear-confirm`: "Xoá toàn bộ lịch sử xem?" → Huỷ / `.btn.r` "Xoá lịch sử". */
export function ClearHistoryDialog({ open, count, onClose, onConfirm }: { open: boolean; count: number; onClose: () => void; onConfirm: () => void }) {
  const m = copy.myList;
  return <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={m.clearTitle} body={m.clearText(count)} actions={[{ label: copy.common.cancel }, { label: m.clearOk, variant: "red", onClick: onConfirm }]} />;
}
