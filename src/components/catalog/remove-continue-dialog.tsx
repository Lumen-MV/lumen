"use client";
import { Dialog } from "@/components/ui/dialog";
import { copy } from "@/lib/copy-vi";
import type { ContinueItem } from "@/lib/play/player-manifest-types";

/** global.html `dialog-confirm`: "Xoá khỏi Tiếp tục xem?" → Huỷ / `.btn.r` Xoá. */
export function RemoveContinueDialog({ item, onClose, onConfirm }: { item: ContinueItem | null; onClose: () => void; onConfirm: (item: ContinueItem) => void }) {
  const d = copy.dialog.removeContinue;
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(o) => !o && onClose()}
      title={d.title}
      body={item ? d.text(item.title, item.percent) : ""}
      actions={[
        { label: copy.common.cancel },
        {
          label: d.ok,
          variant: "red",
          onClick: () => {
            if (item) onConfirm(item);
          },
        },
      ]}
    />
  );
}
