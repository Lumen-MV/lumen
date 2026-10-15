/**
 * Post-login redirect target sanitiser (edge/client/server safe, no Node imports).
 * Resolves `next` against `origin` with the WHATWG parser so `//evil`, `/\evil.com`,
 * `javascript:` and absolute URLs all collapse to "/" — only a same-origin path survives.
 */
export function safeNextPath(next: string | undefined | null, origin = "http://localhost"): string {
  if (!next || !next.startsWith("/")) return "/";
  try {
    const base = new URL(origin);
    const u = new URL(next, base);
    if (u.origin !== base.origin || !u.pathname.startsWith("/")) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}
