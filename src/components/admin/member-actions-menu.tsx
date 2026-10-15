"use client";
import { DropdownMenu, type MenuItem } from "@/components/ui/dropdown-menu";
import type { MemberRow } from "@/lib/admin/admin-users-service";
import { copy } from "@/lib/copy-vi";

export type MemberAction = "reset" | "role-admin" | "role-member" | "history" | "revoke-stremio" | "lock" | "unlock" | "delete" | "resend";

/** `⋯` (`.btn.sm.more`) → `.menu2`: Đặt lại mật khẩu · Đổi vai trò → … · Xem lịch sử xem · Thu hồi link Stremio · ─ · Khoá/Mở khoá · Xoá (red). Own account: no role / lock / delete / reset. */
export function MemberActionsMenu({ member, isSelf, onAction }: { member: MemberRow; isSelf: boolean; onAction: (a: MemberAction) => void }) {
  const t = copy.admin.members.menu;
  const items: MenuItem[] = [
    ...(isSelf ? [] : [{ label: t.resetPw, onSelect: () => onAction("reset") }]),
    ...(isSelf ? [] : [member.role === "admin" ? { label: t.roleMember, onSelect: () => onAction("role-member") } : { label: t.roleAdmin, onSelect: () => onAction("role-admin") }]),
    { label: t.history, onSelect: () => onAction("history") },
    { label: t.revokeStremio, onSelect: () => onAction("revoke-stremio") },
    ...(isSelf
      ? []
      : [
          { label: "", sep: true },
          member.status === "off" ? { label: t.unlock, onSelect: () => onAction("unlock") } : { label: t.lock, onSelect: () => onAction("lock") },
          { label: t.delete, danger: true, onSelect: () => onAction("delete") },
        ]),
  ];
  return <DropdownMenu items={items} anchor={<button type="button" className="btn sm more" title={copy.admin.members.moreTitle} aria-label={`${copy.admin.members.moreTitle} · ${member.displayName}`} data-more={member.username}>{copy.admin.members.more}</button>} />;
}
