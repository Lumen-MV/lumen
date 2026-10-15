import { NextResponse } from "next/server";
import { clientIp } from "@/lib/auth/session-service";
import { getEnv } from "@/lib/config/env";
import { readScenario } from "@/lib/dev/scenario-flags";
import { contentRange, parseRange, unsatisfiableRange } from "@/lib/play/range-header";
import { EmbeddedTooLargeError } from "@/lib/subtitles/embedded-subtitle-extractor";
import { signedSubtitleFormat, signedSubtitleRateLimited, verifySubtitleSig, type SignedSubtitleFormat } from "@/lib/subtitles/signed-subtitle-url";
import { cuesToSrt } from "@/lib/subtitles/srt-writer";
import { findSubRow, readVtt } from "@/lib/subtitles/subtitle-store";
import { ensureVtt, OsQuotaError, SubtitleUnavailableError } from "@/lib/subtitles/subtitle-vtt-ensure";
import { parseVtt } from "@/lib/subtitles/vtt-parser";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; exp: string; sig: string; file: string }> };

/**
 * GET/HEAD /api/subs/s/{id}/{exp}/{sig}/subtitle.srt|.vtt — the signed, session-less subtitle for the hand-off apps
 * (Infuse / VLC fetch it with no cookie; the middleware lets `/api/subs/s/*` through). Extension LAST, no query string,
 * so players sniff the format from the URL. HMAC from `/api/play/external` must verify (≤ 60 min) or the answer is
 * 404 — no hint whether the id, the signature or the expiry failed. `.srt` is converted on the fly from the cached
 * VTT (numbered, CRLF, `<i>`/`<b>` kept, positioning stripped). Headers players expect from a sidecar: exact
 * `Content-Type`, `Content-Length`, `Accept-Ranges: bytes` (single Range honoured, 206 / 416), `Content-Disposition`
 * with the extension. No stream handle here, so an embedded track is served only once its VTT exists. 60/min/IP.
 * `Cache-Control: private, max-age=3600` = the link lifetime, not the file's.
 */
const CONTENT_TYPE: Record<SignedSubtitleFormat, string> = { srt: "application/x-subrip; charset=utf-8", vtt: "text/vtt; charset=utf-8" };

async function handle(req: Request, ctx: Ctx, head: boolean): Promise<NextResponse> {
  const { id, exp, sig, file } = await ctx.params;
  const format = signedSubtitleFormat(file);
  if (!format || !/^\d{1,9}$/.test(id) || !verifySubtitleSig(Number(id), exp, sig, getEnv().SESSION_SECRET)) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  if (signedSubtitleRateLimited(clientIp(req))) return NextResponse.json({ code: "RATE_LIMITED" }, { status: 429 });
  const row = findSubRow(Number(id));
  if (!row) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  let body: Buffer;
  try {
    const vtt = readVtt(await ensureVtt(row, readScenario(req), null));
    body = Buffer.from(format === "srt" ? cuesToSrt(parseVtt(vtt)) : vtt, "utf8");
  } catch (err) {
    if (err instanceof OsQuotaError) return NextResponse.json({ code: "OS_QUOTA" }, { status: 429 });
    if (err instanceof EmbeddedTooLargeError) return NextResponse.json({ code: "EMBEDDED_TOO_LARGE" }, { status: 409 });
    if (err instanceof SubtitleUnavailableError) return NextResponse.json({ code: "SUB_UNAVAILABLE" }, { status: 404 });
    console.error("[subs/signed]", row.id, err instanceof Error ? err.message : err);
    return NextResponse.json({ code: "PROVIDER_DOWN" }, { status: 502 });
  }
  const headers = new Headers({
    "content-type": CONTENT_TYPE[format],
    "content-disposition": `inline; filename="${row.id}.${format}"`,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
  });
  const range = parseRange(req.headers.get("range"), body.length);
  if (range === "unsatisfiable") {
    headers.set("content-range", unsatisfiableRange(body.length));
    return new NextResponse(null, { status: 416, headers });
  }
  const part = range ? body.subarray(range.start, range.end + 1) : body;
  headers.set("content-length", String(part.length));
  if (range) headers.set("content-range", contentRange(range, body.length));
  // a HEAD answer carries the GET headers (Content-Length of the full body) and no body
  return new NextResponse(head ? null : new Uint8Array(part), { status: range ? 206 : 200, headers });
}

export const GET = (req: Request, ctx: Ctx) => handle(req, ctx, false);
export const HEAD = (req: Request, ctx: Ctx) => handle(req, ctx, true);
