import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/require-admin";
import { deviceLabelFromUserAgent } from "@/lib/auth/session-service";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { markWatched } from "@/lib/progress/progress-store";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ mediaKey: z.string().min(4).max(40), watched: z.boolean() });

/** POST /api/progress/mark {mediaKey, watched} → 204 (episode ⋯ menu "Đánh dấu đã xem / chưa xem"). */
export async function POST(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  const key = parseMediaKey(body.mediaKey);
  if (!key) return NextResponse.json({ code: "BAD_REQUEST", issues: ["mediaKey"] }, { status: 400 });
  try {
    markWatched(me.user.id, key, body.watched, deviceLabelFromUserAgent(req.headers.get("user-agent") ?? ""));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[progress/mark]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
