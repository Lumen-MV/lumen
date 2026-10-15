"use client";
import { Dialog } from "@/components/ui/dialog";
import { QrCode } from "@/components/ui/qr-code";
import { copy } from "@/lib/copy-vi";
import { formatClock } from "@/lib/format/time-format";

/** The player's one-shot `.dlg .card2` dialogs (screen-player.js `dlg()`): hand-off sent, QR, codec error, link-expired-fail, viewer limit. */

export function HandoffSentDialog({ app, onClose }: { app: string | null; onClose: () => void }) {
  const h = copy.player.handoff;
  return <Dialog open={app !== null} onOpenChange={(o) => !o && onClose()} title={h.sentTitle(app ?? "")} body={h.sentText} variant="info" actions={[{ label: h.guide, onClick: () => void window.open("/settings#tv", "_blank", "noopener") }, { label: copy.common.close, variant: "white" }]} />;
}

export function QrDialog({ url, positionS, onClose }: { url: string | null; positionS: number; onClose: () => void }) {
  const h = copy.player.handoff;
  return (
    <Dialog open={url !== null} onOpenChange={(o) => !o && onClose()} title={h.qrTitle} body={h.qrText(formatClock(positionS))} variant="info" actions={[{ label: copy.common.close, variant: "white" }]}>
      {url && <QrCode value={url} size={200} />}
    </Dialog>
  );
}

type CodecProps = { open: boolean; group: string; format: string; alt: { group: string; sizeLabel: string } | null; onOpenApp: () => void; onPickMp4: () => void; onClose: () => void };

/** "Trình duyệt không phát được bản MKV này" → "📺 Xem bằng app" / `.btn.w` "Chọn bản MP4 (YTS 2.7 GB)" (hidden when no cached MP4 exists). */
export function CodecErrorDialog({ open, group, format, alt, onOpenApp, onPickMp4, onClose }: CodecProps) {
  const c = copy.player.codec;
  // both outcomes close the dialog through state (hand-off sheet opens / navigation): only Esc / overlay reaches onClose
  const actions = [{ label: copy.player.openApp, onClick: onOpenApp, keepOpen: true }];
  if (alt) actions.push({ label: c.pickMp4(alt.group, alt.sizeLabel), variant: "white", onClick: onPickMp4, keepOpen: true } as (typeof actions)[number]);
  return <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={c.title} body={c.text(group, format)} variant="info" actions={actions} />;
}

export function LinkExpiredDialog({ open, positionS, onBack, onRetry }: { open: boolean; positionS: number; onBack: () => void; onRetry: () => void }) {
  const r = copy.player.relinkFail;
  return <Dialog open={open} onOpenChange={(o) => !o && onBack()} title={r.title} body={r.text(formatClock(positionS))} variant="info" actions={[{ label: r.back, onClick: onBack, keepOpen: true }, { label: r.retry, variant: "white", onClick: onRetry, keepOpen: true }]} />;
}

/** global.html `limit-5`: "Đang có 5 người xem" → "📺 Xem bằng app" (hand-off is not counted) / `.btn.w` "Thử lại". */
export function ViewerLimitDialog({ open, onOpenApp, onRetry, onClose }: { open: boolean; onOpenApp: () => void; onRetry: () => void; onClose: () => void }) {
  const l = copy.player.limit;
  return <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={l.title} body={l.text} variant="info" actions={[{ label: l.app, onClick: onOpenApp, keepOpen: true }, { label: l.retry, variant: "white", onClick: onRetry, keepOpen: true }]} />;
}

/** Stream handle gone (50 min) before the player even loaded. */
export function StreamExpiredDialog({ open, onBack }: { open: boolean; onBack: () => void }) {
  const e = copy.player.expired;
  return <Dialog open={open} onOpenChange={(o) => !o && onBack()} title={e.title} body={e.text} variant="info" actions={[{ label: e.back, variant: "white", onClick: onBack, keepOpen: true }]} />;
}
