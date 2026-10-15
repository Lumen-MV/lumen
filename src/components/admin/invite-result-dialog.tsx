"use client";
import { copyText, downloadQrPng } from "@/components/settings/download-qr";
import { Dialog } from "@/components/ui/dialog";
import { QrCode } from "@/components/ui/qr-code";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { formatDate } from "@/lib/format/time-format";
import type { CreatedInvite } from "./create-invite-dialog";

/** `https://phim.example.com/invite/k3JdPq9xA2…Qw` — 10 + 2 characters of the token in the result dialog. */
export const shortenInviteUrl = (url: string): string => url.replace(/\/invite\/([A-Za-z0-9_-]{32})$/, (_, t: string) => `/invite/${t.slice(0, 10)}…${t.slice(-2)}`);
/** "Mời Đạt" → "Đạt" (the recipient named in the note), else the generic fallback. */
export const recipientFromNote = (note: string): string => note.replace(/^m[ờo]i\s+/i, "").trim() || copy.admin.invites.recipientFallback;

/** "Link mời đã tạo": `.qrbig` + shortened link + "Gửi link này cho Đạt. Link dùng 1 lần, hết hạn 21/10/2026." + Tải mã QR / Sao chép link. */
export function InviteResultDialog({ invite, onClose }: { invite: CreatedInvite | null; onClose: () => void }) {
  const t = copy.admin.invites;
  const { toast } = useToast();
  if (!invite) return null;
  const text = invite.maxUses === null ? t.resultTextMany(formatDate(new Date(invite.expiresAt))) : t.resultText(recipientFromNote(invite.note), formatDate(new Date(invite.expiresAt)));
  const copyLink = async () => {
    toast((await copyText(invite.url)) ? { type: "success", text: t.copiedToast } : { type: "err", text: copy.player.handoff.copyFailToast });
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="info"
      title={t.resultTitle}
      body={text}
      bodyAfterChildren
      actions={[
        { label: t.downloadQr, keepOpen: true, onClick: () => downloadQrPng(invite.url, t.qrFile).catch((err) => console.error("[qr]", err)) },
        { label: t.copyLink, variant: "white", onClick: copyLink },
      ]}
    >
      <QrCode value={invite.url} size={180} className="qrbig" />
      <code style={{ display: "block", textAlign: "center", marginBottom: 10 }} data-invite-url>
        {shortenInviteUrl(invite.url)}
      </code>
    </Dialog>
  );
}
