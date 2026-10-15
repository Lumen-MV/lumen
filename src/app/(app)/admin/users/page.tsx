import { redirect } from "next/navigation";
import { AdminUsersPage } from "@/components/admin/admin-users-page";
import { filterMembers, listMembers } from "@/lib/admin/admin-users-service";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { listInvites } from "@/lib/invites/invite-service";

export const dynamic = "force-dynamic";

/** /admin/users — invites + members (server-loaded, client-interactive). */
export default async function AdminUsersRoute() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const [invites, members] = await Promise.all([listInvites(), listMembers().then((rows) => filterMembers(rows, "", "all"))]);
  return <AdminUsersPage invites={invites.map((i) => ({ id: i.id, note: i.note, createdByName: i.createdByName, expiresAt: i.expiresAt.toISOString(), state: i.state, usedByName: i.usedByName, url: i.url, maskedUrl: i.maskedUrl }))} members={members} meId={me.user.id} />;
}
