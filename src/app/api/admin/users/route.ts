import { NextResponse } from "next/server";
import { z } from "zod";
import { AdminActionError, changeRole, lockMember, resendLogin, revokeMemberStremio, unlockMember } from "@/lib/admin/admin-user-actions";
import { filterMembers, listMembers, type MemberFilter } from "@/lib/admin/admin-users-service";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { copy } from "@/lib/copy-vi";
import { parseJsonBody } from "@/lib/http/parse-json-body";

export const dynamic = "force-dynamic";

const FILTERS = copy.admin.members.filterKeys;
const patchSchema = z.object({ id: z.number().int().positive(), action: z.enum(["lock", "unlock", "role", "resend", "revoke-stremio"]), role: z.enum(["admin", "member"]).optional() });

/** GET /api/admin/users?q=&filter=all|active|locked|pending → {members:[MemberRow]} sorted by views/month. */
export async function GET(req: Request) {
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  const url = new URL(req.url);
  const filterRaw = url.searchParams.get("filter") ?? "all";
  if (!(FILTERS as readonly string[]).includes(filterRaw)) return NextResponse.json({ code: "BAD_REQUEST", issues: ["filter"] }, { status: 400 });
  try {
    const members = filterMembers(await listMembers(), url.searchParams.get("q") ?? "", filterRaw as MemberFilter);
    return NextResponse.json({ members }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[admin/users GET]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}

/** PATCH /api/admin/users {id, action, role?} → {user} · resend → {user, tempPassword, loginUrl} (never-logged-in members only, else 409 ALREADY_ACTIVE) · 409 SELF / LAST_ADMIN · 404 */
export async function PATCH(req: Request) {
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, patchSchema);
  if (body instanceof NextResponse) return body;
  const actor = { id: me.user.id, displayName: me.user.displayName };
  try {
    switch (body.action) {
      case "lock":
        return NextResponse.json({ user: await lockMember(actor, body.id) });
      case "unlock":
        return NextResponse.json({ user: unlockMember(actor, body.id) });
      case "role":
        if (!body.role) return NextResponse.json({ code: "BAD_REQUEST", issues: ["role"] }, { status: 400 });
        return NextResponse.json({ user: changeRole(actor, body.id, body.role) });
      case "revoke-stremio":
        return NextResponse.json({ user: revokeMemberStremio(actor, body.id) });
      case "resend":
        return NextResponse.json(await resendLogin(actor, body.id), { headers: { "cache-control": "no-store" } });
    }
  } catch (err) {
    if (err instanceof AdminActionError) return NextResponse.json({ code: err.code }, { status: err.status });
    console.error("[admin/users PATCH]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
