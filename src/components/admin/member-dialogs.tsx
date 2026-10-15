"use client";
import { copyText } from "@/components/settings/download-qr";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import type { MemberRow } from "@/lib/admin/admin-users-service";
import { copy } from "@/lib/copy-vi";
import { renderBold } from "@/lib/format/render-bold";

const codeStyle = { display: "block", fontSize: 20, textAlign: "center", padding: 14, marginBottom: 10, letterSpacing: 2 } as const;
const linkStyle = { display: "block", textAlign: "center", marginBottom: 6, wordBreak: "break-all" } as const;

/**
 * "Mật khẩu tạm cho “quang”": the one-time code (20 px, letter-spacing 2) + "Sao chép và đóng". With `loginUrl` ("Gửi lại
 * link" for a member who never logged in) the login link is shown above the code and both are copied together.
 */
export function ResetPasswordDialog({ member, tempPassword, loginUrl, onClose }: { member: MemberRow; tempPassword: string; loginUrl?: string; onClose: () => void }) {
  const m = copy.admin.members;
  const { toast } = useToast();
  const payload = loginUrl ? m.resendClipboard(loginUrl, member.username, tempPassword) : tempPassword;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} variant="info" title={loginUrl ? m.resendTitle(member.username) : m.resetTitle(member.username)} body={loginUrl ? m.resendText(member.displayName) : m.resetText(member.displayName)} actions={[{ label: m.resetOk, variant: "white", onClick: async () => void ((await copyText(payload)) && toast({ type: "success", text: loginUrl ? m.copiedLogin : m.copiedPw })) }]}>
      {loginUrl && (
        <code style={linkStyle} data-login-url>
          {loginUrl}
        </code>
      )}
      <code style={codeStyle} data-temp-password>
        {tempPassword}
      </code>
    </Dialog>
  );
}

/** "Khoá tài khoản “quang”?" confirm → Huỷ / Khoá (red). */
export function LockMemberDialog({ member, onCancel, onConfirm }: { member: MemberRow; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const m = copy.admin.members;
  return <Dialog open onOpenChange={(o) => !o && onCancel()} title={m.lockTitle(member.username)} body={m.lockText(member.displayName)} actions={[{ label: copy.common.cancel }, { label: m.lockOk, variant: "red", onClick: onConfirm }]} />;
}

/** "Xoá thành viên “khang”?" danger dialog: typed username enables "Xoá vĩnh viễn". */
export function DeleteMemberDialog({ member, onCancel, onConfirm }: { member: MemberRow; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const d = copy.dialog.deleteMember;
  return <Dialog open onOpenChange={(o) => !o && onCancel()} variant="danger" confirmText={member.username} title={d.title(member.username)} body={renderBold(d.text(member.displayName, member.username))} actions={[{ label: copy.common.cancel }, { label: d.ok, variant: "red", primary: true, onClick: onConfirm }]} />;
}
