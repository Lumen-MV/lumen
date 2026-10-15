import { AuthCard } from "@/components/ui/auth-card";
import { InviteForm } from "@/components/auth/invite-form";
import { InviteBroken } from "@/components/auth/invite-broken";
import { validateInvite } from "@/lib/invites/invite-service";

export const dynamic = "force-dynamic";

/** /invite/[token] — validates server-side and renders the form or one of the 3 broken states. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = validateInvite(token);
  return <AuthCard>{v.state === "valid" ? <InviteForm token={token} inviterName={v.inviterName} daysLeft={v.daysLeft} /> : <InviteBroken validation={v} />}</AuthCard>;
}
