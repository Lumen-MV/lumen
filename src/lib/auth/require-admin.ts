import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./get-session-user";
import { passwordChangeBlocks } from "./password-change-gate";

/** Pathname of the current request (set by the middleware); empty outside a request. */
export async function requestPathname(): Promise<string> {
  return (await headers()).get("x-pathname") ?? "";
}

/** Route-handler guard: `const g = await requireUserApi(); if (g instanceof NextResponse) return g;` — a member on a temp password only reaches /api/me + /api/me/password (403 PASSWORD_CHANGE_REQUIRED elsewhere). */
export async function requireUserApi(): Promise<SessionUser | NextResponse> {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  if (passwordChangeBlocks(me.user.mustChangePassword, await requestPathname())) return NextResponse.json({ code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 });
  return me;
}

export async function requireAdminApi(): Promise<SessionUser | NextResponse> {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  if (me.user.role !== "admin") return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  return me;
}
