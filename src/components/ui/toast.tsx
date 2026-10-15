"use client";
import { cx } from "@/lib/format/class-names";
import { copy } from "@/lib/copy-vi";

export type ToastType = "success" | "info" | "warn" | "err";
export type ToastAction = { label: string; onClick: () => void };
export type ToastItem = { id: number; type: ToastType; text: string; action?: ToastAction; closable: boolean };

type Props = { item: ToastItem; onDismiss: (id: number) => void; onPause: (id: number) => void; onResume: (id: number) => void };

/** `.toast[.info|.warn|.err]` with optional `.act` link and `.x` close, exactly like global.html. */
export function Toast({ item, onDismiss, onPause, onResume }: Props) {
  const cls = cx("toast", item.type !== "success" && item.type);
  return (
    <div className={cls} role="status" onMouseEnter={() => onPause(item.id)} onMouseLeave={() => onResume(item.id)}>
      {item.text}
      {item.action && (
        <button
          type="button"
          className="act"
          onClick={() => {
            item.action?.onClick();
            onDismiss(item.id);
          }}
        >
          {item.action.label}
        </button>
      )}
      {item.closable && (
        <button type="button" className="x" aria-label={copy.common.close} onClick={() => onDismiss(item.id)}>
          {copy.common.closeGlyph}
        </button>
      )}
    </div>
  );
}
