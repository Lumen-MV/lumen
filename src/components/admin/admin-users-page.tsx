"use client";
import { useState } from "react";
import { copyText } from "@/components/settings/download-qr";
import { useToast } from "@/components/ui/toast-provider";
import type { MemberRow } from "@/lib/admin/admin-users-service";
import { copy } from "@/lib/copy-vi";
import { CreateInviteDialog, type CreatedInvite } from "./create-invite-dialog";
import { InviteResultDialog } from "./invite-result-dialog";
import { InvitesTable, type InviteRowDto } from "./invites-table";
import { DeleteMemberDialog, LockMemberDialog, ResetPasswordDialog } from "./member-dialogs";
import { MembersTable, MembersToolbar } from "./members-table";
import { useAdminMembers } from "./use-admin-members";

type Props = { invites: InviteRowDto[]; members: MemberRow[]; meId: number };

/** /admin/users — "Link mời" table + create / result dialogs, then "Thành viên · N" toolbar + table + ⋯ menu + dialogs (admin.html `users` + 5 dialog states). */
export function AdminUsersPage({ invites: initialInvites, members: initialMembers, meId }: Props) {
  const { toast } = useToast();
  const t = copy.admin.invites;
  const [invites, setInvites] = useState(initialInvites);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const members = useAdminMembers(initialMembers);

  const reloadInvites = async () => {
    const res = await fetch("/api/admin/invites");
    if (res.ok) setInvites(((await res.json()) as { invites: InviteRowDto[] }).invites);
  };
  const copyInvite = async (inv: InviteRowDto) => {
    if (inv.url) toast((await copyText(inv.url)) ? { type: "success", text: t.copiedToast } : { type: "err", text: copy.player.handoff.copyFailToast });
  };
  const revoke = async (inv: InviteRowDto) => {
    const res = await fetch(`/api/admin/invites/${inv.id}`, { method: "DELETE" });
    if (!res.ok) return void toast({ type: "err", text: copy.settings.errToast });
    await reloadInvites();
  };
  const recreate = async (inv: InviteRowDto) => {
    const res = await fetch(`/api/admin/invites/${inv.id}`, { method: "POST" });
    if (res.status === 409) return void toast({ type: "err", text: copy.admin.members.stillValidToast });
    if (!res.ok) return void toast({ type: "err", text: copy.settings.errToast });
    setCreated((await res.json()) as CreatedInvite);
    await reloadInvites();
  };

  return (
    <>
      <InvitesTable invites={invites} onCreate={() => setCreateOpen(true)} onCopy={(i) => void copyInvite(i)} onRevoke={(i) => void revoke(i)} onRecreate={(i) => void recreate(i)} />
      <div className="h">
        <h2 style={{ fontSize: 18 }}>{copy.admin.members.title(members.members.length)}</h2>
      </div>
      <MembersToolbar q={members.q} filter={members.filter} onQuery={members.setQ} onFilter={members.setFilter} />
      <MembersTable members={members.members} meId={meId} onAction={(a, u) => void members.act(a, u)} />

      <CreateInviteDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(inv) => { setCreated(inv); void reloadInvites(); }} />
      <InviteResultDialog invite={created} onClose={() => { setCreated(null); void reloadInvites(); void members.refresh(); }} />
      {members.dialog?.kind === "reset" && <ResetPasswordDialog member={members.dialog.member} tempPassword={members.dialog.tempPassword} loginUrl={members.dialog.loginUrl} onClose={() => members.setDialog(null)} />}
      {members.dialog?.kind === "lock" && <LockMemberDialog member={members.dialog.member} onCancel={() => members.setDialog(null)} onConfirm={() => members.confirmLock(members.dialog!.member)} />}
      {members.dialog?.kind === "delete" && <DeleteMemberDialog member={members.dialog.member} onCancel={() => members.setDialog(null)} onConfirm={() => members.confirmDelete(members.dialog!.member)} />}
    </>
  );
}
