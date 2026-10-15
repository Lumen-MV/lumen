import { NextResponse } from "next/server";
import { devScenariosEnabled } from "@/lib/config/env";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { getStream } from "@/lib/play/stream-registry";

/**
 * GET /api/dev/stream-probe?streamId= → {status, contentType, contentRange, bytes} — ONE server-side
 * `Range: bytes=0-1048575` request against the registry's CDN URL (never returned). QA proves a resolved stream
 * plays (206) without the key-bearing URL ever reaching a client. 404 unless LUMEN_SCENARIOS=1; admin session required.
 */
const RANGE = "bytes=0-1048575";

export async function GET(req: Request) {
  if (!devScenariosEnabled()) return new NextResponse(null, { status: 404 });
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  const streamId = new URL(req.url).searchParams.get("streamId") ?? "";
  const entry = getStream(streamId, me.user.id);
  if (!entry) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  try {
    const res = await fetch(entry.cdnUrl, { headers: { Range: RANGE }, signal: AbortSignal.timeout(20_000) });
    const buf = await res.arrayBuffer();
    // status + bytes (+ content headers) only — no part of the CDN URL leaves the server
    return NextResponse.json({ status: res.status, contentType: res.headers.get("content-type"), contentRange: res.headers.get("content-range"), bytes: buf.byteLength });
  } catch (err) {
    return NextResponse.json({ code: "PROBE_FAILED", message: err instanceof Error ? err.name : "error" }, { status: 502 });
  }
}
