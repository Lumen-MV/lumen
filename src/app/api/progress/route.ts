import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/require-admin";
import { deviceLabelFromUserAgent } from "@/lib/auth/session-service";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { clearHistory, removeFromContinue, upsertProgress } from "@/lib/progress/progress-store";
import { getStream } from "@/lib/play/stream-registry";
import { beatView, checkViewerLimit } from "@/lib/play/viewer-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ mediaKey: z.string().min(4).max(40), positionS: z.number().min(0).max(360_000), durationS: z.number().min(0).max(360_000), streamId: z.string().regex(/^[0-9a-f]{32}$/).optional() });

/**
 * POST /api/progress {mediaKey, positionS, durationS, streamId?} (fetch or sendBeacon JSON blob) → 204: upserts progress +
 * beats the viewer's direct view. The seat is gated like the manifest: a viewer whose seat expired (> 60 s without
 * beats) only gets it back while a seat is free — otherwise 429 LIMIT_5 (the position is still saved) and the player
 * pauses with the limit dialog. A viewer already counted always keeps the seat.
 */
export async function POST(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  const key = parseMediaKey(body.mediaKey);
  if (!key) return NextResponse.json({ code: "BAD_REQUEST", issues: ["mediaKey"] }, { status: 400 });
  try {
    const device = deviceLabelFromUserAgent(req.headers.get("user-agent") ?? "");
    upsertProgress(me.user.id, key, body.positionS, body.durationS, device);
    const limit = checkViewerLimit(me.user.id);
    if (!limit.ok) return NextResponse.json({ code: "LIMIT_5", active: limit.active, limit: limit.limit }, { status: 429 });
    const entry = body.streamId ? getStream(body.streamId, me.user.id) : null;
    beatView(me.user.id, key, "direct", entry?.release.hash ?? "", device);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[progress]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}

/** DELETE /api/progress?mediaKey= (remove from "Tiếp tục xem") · ?all=1 (clear history) → 204 */
export async function DELETE(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const url = new URL(req.url);
  try {
    if (url.searchParams.get("all") === "1") {
      clearHistory(me.user.id);
      return new NextResponse(null, { status: 204 });
    }
    const key = parseMediaKey(url.searchParams.get("mediaKey"));
    if (!key) return NextResponse.json({ code: "BAD_REQUEST", issues: ["mediaKey"] }, { status: 400 });
    removeFromContinue(me.user.id, key);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[progress delete]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
