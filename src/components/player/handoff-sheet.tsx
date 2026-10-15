"use client";
import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { copy } from "@/lib/copy-vi";
import { detectDevice, orderApps, type HandoffApp } from "@/lib/play/external-player-links";

type Props = { onApp: (app: HandoffApp) => void; onCopy: () => void; onCopySub: () => void; onQr: () => void; onClose: () => void };

/**
 * `.sheet2 > h4 + .it(small)…` — "Phát trên TV / app khác": Stremio / Infuse / VLC (device's own app first; Infuse carries
 * the "nếu Infuse không tự bật phụ đề…" hint), Sao chép link, Sao chép link phụ đề, Hiện mã QR. Outside click / Esc
 * closes; items are real buttons (`role=menu` with ↑/↓/Home/End roving focus).
 */
export function HandoffSheet({ onApp, onCopy, onCopySub, onQr, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const h = copy.player.handoff;
  const apps = useMemo(() => orderApps(detectDevice(typeof navigator === "undefined" ? "" : navigator.userAgent)), []);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-action="cast"]')) onClose();
    };
    document.addEventListener("mousedown", onDown);
    ref.current?.querySelector("button")?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button.it") ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === "ArrowDown" ? (i + 1) % items.length : e.key === "ArrowUp" ? (i - 1 + items.length) % items.length : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    items[to].focus();
  };
  const label: Record<HandoffApp, { text: string; hints: string[] }> = { stremio: { text: h.stremio, hints: [h.stremioHint] }, infuse: { text: h.infuse, hints: [h.infuseHint, h.infuseSubHint] }, vlc: { text: h.vlc, hints: [] } };
  return (
    <div ref={ref} className="sheet2" role="menu" aria-label={h.title} data-sheet="handoff" onKeyDown={onKeyDown}>
      <h4>{h.title}</h4>
      {apps.map((app) => (
        <button key={app} type="button" className="it" role="menuitem" data-handoff={app} onClick={() => onApp(app)}>
          {label[app].text}
          {label[app].hints.map((hint) => (
            <small key={hint}>{hint}</small>
          ))}
        </button>
      ))}
      <button type="button" className="it" role="menuitem" data-handoff="copy" onClick={onCopy}>
        {h.copy}
        <small>{h.copyHint}</small>
      </button>
      <button type="button" className="it" role="menuitem" data-handoff="copy-sub" onClick={onCopySub}>
        {h.copySub}
        <small>{h.copySubHint}</small>
      </button>
      <button type="button" className="it" role="menuitem" data-handoff="qr" onClick={onQr}>
        {h.qr}
      </button>
    </div>
  );
}
