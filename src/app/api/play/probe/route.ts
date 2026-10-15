import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { isSampleEntry } from "@/lib/play/sample-stream";
import { getStream } from "@/lib/play/stream-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/play/probe?streamId= → {status} — ONE server-side `Range: bytes=0-0` request against the stream's CDN URL,
 * body discarded. The player's watchdog asks this after a <video> error to tell a dead / expired link (403, 404, 5xx,
 * network) from a codec problem (link fine, browser cannot decode) — a cross-origin HEAD from the browser is opaque.
 */
export async function GET(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const streamId = new URL(req.url).searchParams.get("streamId") ?? "";
  const entry = getStream(streamId, me.user.id);
  if (!entry) return NextResponse.json({ code: "STREAM_EXPIRED", status: 410 }, { status: 410 });
  const headers: Record<string, string> = { range: "bytes=0-0" };
  if (isSampleEntry(entry) && req.headers.get("cookie")) headers.cookie = req.headers.get("cookie")!;
  try {
    const res = await fetch(entry.cdnUrl, { headers, signal: AbortSignal.timeout(10_000) });
    await res.body?.cancel().catch(() => {});
    return NextResponse.json({ status: res.status });
  } catch (err) {
    console.warn("[play/probe]", err instanceof Error ? err.name : err);
    return NextResponse.json({ status: 0 });
  }
}
