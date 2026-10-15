import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { profilePatchSchema, updateProfile } from "@/lib/users/profile-service";

export const dynamic = "force-dynamic";

/** PATCH /api/me/profile {displayName?, avatarColor?} → {user} (avatarColor must be one of the 8 swatches). */
export async function PATCH(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, profilePatchSchema);
  if (body instanceof NextResponse) return body;
  try {
    return NextResponse.json({ user: updateProfile(me.user.id, body) });
  } catch (err) {
    console.error("[me/profile]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
