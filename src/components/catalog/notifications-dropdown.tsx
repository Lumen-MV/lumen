"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { onActivate } from "@/components/ui/activate-key";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import { renderBold } from "@/lib/format/render-bold";
import type { NotificationItem } from "@/lib/notifications/notifications-service";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; onUnreadChange: (n: number) => void; anchorRef: React.RefObject<HTMLElement | null> };

/** `.notif > .hd(Thông báo + Đánh dấu đã đọc) + .it[.unread](.ico2 + text + .t)` — rows navigate to their target and mark themselves read. */
export function NotificationsDropdown({ open, onOpenChange, onUnreadChange, anchorRef }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setError(false);
    fetch("/api/notifications", { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`notifications ${r.status}`);
        const data = (await r.json()) as { items: NotificationItem[]; unread: number };
        setItems(data.items);
        onUnreadChange(data.unread);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.warn("[notifications]", err); // handled: inline error row
        setError(true);
      });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      ctrl.abort();
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange, onUnreadChange, anchorRef]);

  const patch = async (body: { all: true } | { id: number }) => {
    try {
      const r = await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`patch ${r.status}`);
      const { unread } = (await r.json()) as { unread: number };
      onUnreadChange(unread);
      setItems((list) => list?.map((it) => ("all" in body || it.id === body.id ? { ...it, read: true } : it)) ?? null);
    } catch (err) {
      console.warn("[notifications] mark read failed", err);
    }
  };

  const openItem = async (it: NotificationItem) => {
    if (!it.read) await patch({ id: it.id });
    onOpenChange(false);
    router.push(it.href);
  };

  if (!open) return null;
  const hasUnread = Boolean(items?.some((i) => !i.read));
  return (
    <div className="notif" ref={rootRef} role="dialog" aria-label={copy.notif.title}>
      <div className="hd">
        {copy.notif.title}
        {hasUnread && (
          <button type="button" onClick={() => patch({ all: true })}>
            {copy.notif.markRead}
          </button>
        )}
      </div>
      {items === null && !error && <div className="it" style={{ color: "#888" }}>{copy.browse.pending}</div>}
      {error && <div className="it" style={{ color: "#f0a0a0" }}>{copy.home.errRow}</div>}
      {items && items.length === 0 && <div className="it" style={{ color: "#888" }}>{copy.notif.empty}</div>}
      {items?.map((it) => (
        <div key={it.id} className={cx("it", !it.read && "unread")} role="link" tabIndex={0} onClick={() => openItem(it)} onKeyDown={onActivate(() => void openItem(it))}>
          <div className="ico2">{it.icon}</div>
          <div>
            {renderBold(it.html)}
            <div className="t">{it.timeAgo}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
