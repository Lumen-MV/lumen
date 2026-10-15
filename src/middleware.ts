import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session-config";
import { unsealSessionId } from "@/lib/auth/session-seal";

/**
 * Edge gate: every page + API needs a valid sealed session cookie except the public routes below.
 * The DB-backed check (session row exists, not expired, user not disabled) happens in getSessionUser() per request.
 * `/api/dev/*` is public here only so the handlers can answer 404 in production regardless of auth:
 * `/api/dev/scenario` just sets a cookie; `/api/dev/seed` additionally requires an admin session (requireAdminApi).
 * Every forwarded request carries `x-pathname` so the server layout / API guards can apply the temp-password gate.
 */
// `/manifest.webmanifest`: iPhone "Thêm vào màn hình chính" fetches it without the session cookie.
// `/api/subs/s/{id}/{exp}/{sig}/subtitle.srt|.vtt`: the hand-off apps (Infuse / VLC) fetch it without our cookie; the
// route verifies the HMAC itself and answers 404 on anything invalid — no session fallback.
const PUBLIC = [/^\/login$/, /^\/invite\//, /^\/api\/auth\//, /^\/api\/invites\//, /^\/api\/username-available$/, /^\/stremio\//, /^\/api\/health$/, /^\/api\/dev\//, /^\/manifest\.webmanifest$/, /^\/api\/subs\/s\//];
const PATHNAME_HEADER = "x-pathname";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.set(PATHNAME_HEADER, pathname);
  const next = () => NextResponse.next({ request: { headers } });
  if (PUBLIC.some((re) => re.test(pathname))) return next();

  const sessionId = await unsealSessionId(req.cookies.get(SESSION_COOKIE)?.value);
  if (sessionId) return next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:png|jpg|jpeg|svg|ico|webp|txt|webmanifest)$).*)"],
};
