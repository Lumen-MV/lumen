import { NextResponse } from "next/server";
import { EmbeddedTooLargeError } from "@/lib/subtitles/embedded-subtitle-extractor";
import { optionalStream, subsContext } from "@/lib/http/subs-route-helpers";
import { findSubRow, readVtt } from "@/lib/subtitles/subtitle-store";
import { ensureVtt, OsQuotaError, SubtitleUnavailableError } from "@/lib/subtitles/subtitle-vtt-ensure";

export const dynamic = "force-dynamic";

/**
 * GET /api/subs/[id].vtt[?streamId=] → `text/vtt; charset=utf-8`, `Cache-Control: private, max-age=31536000`
 * (the file never changes once written). First hit downloads / extracts; 429 OS_QUOTA while OpenSubtitles is exhausted;
 * 409 EMBEDDED_TOO_LARGE / 404 / 502 for the other failures. Session required (same-origin `<track>` sends cookies).
 * The session-less variant for the hand-off apps lives at `/api/subs/s/{id}/{exp}/{sig}/subtitle.srt|.vtt`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await subsContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const m = id.match(/^(\d{1,9})\.vtt$/);
  if (!m) return NextResponse.json({ code: "BAD_REQUEST", issues: ["id"] }, { status: 400 });
  const row = findSubRow(Number(m[1]));
  if (!row) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  const entry = optionalStream(req, ctx.me.user.id);
  if (entry instanceof NextResponse) return entry;
  try {
    const ready = await ensureVtt(row, ctx.scenario, entry);
    return new NextResponse(readVtt(ready), { status: 200, headers: { "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=31536000" } });
  } catch (err) {
    if (err instanceof OsQuotaError) return NextResponse.json({ code: "OS_QUOTA" }, { status: 429 });
    if (err instanceof EmbeddedTooLargeError) return NextResponse.json({ code: "EMBEDDED_TOO_LARGE" }, { status: 409 });
    if (err instanceof SubtitleUnavailableError) return NextResponse.json({ code: "SUB_UNAVAILABLE" }, { status: 404 });
    console.error("[subs/vtt]", row.id, err instanceof Error ? err.message : err);
    return NextResponse.json({ code: "PROVIDER_DOWN" }, { status: 502 });
  }
}
