import { NextResponse } from "next/server";
import { isUsernameAvailable, normalizeUsername, USERNAME_RE, usernameSuggestions } from "@/lib/users/user-service";

/** GET /api/username-available?u=<name>&name=<displayName> → {available, valid, suggestions} (public; used while typing). */
export function GET(req: Request) {
  const url = new URL(req.url);
  const u = normalizeUsername(url.searchParams.get("u") ?? "");
  const displayName = (url.searchParams.get("name") ?? "").slice(0, 40);
  if (!USERNAME_RE.test(u)) return NextResponse.json({ available: false, valid: false, suggestions: [] });
  try {
    const available = isUsernameAvailable(u);
    return NextResponse.json({ available, valid: true, suggestions: available ? [] : usernameSuggestions(u, displayName) });
  } catch (err) {
    console.error("[username-available]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
