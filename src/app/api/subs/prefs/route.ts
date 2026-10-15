import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/require-admin";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { validMediaKey } from "@/lib/http/subs-route-helpers";
import { setSubtitlePrefs } from "@/lib/subtitles/subtitle-store";
import { OFFSET_LIMIT_MS } from "@/lib/subtitles/subtitle-types";
import { getUserSettings } from "@/lib/users/user-settings";

export const dynamic = "force-dynamic";
// selectedSubId: id · 0 = "Tắt" chosen · null = forget the choice
const bodySchema = z.object({ mediaKey: z.string().min(4).max(40), offsetMs: z.number().int().min(-OFFSET_LIMIT_MS).max(OFFSET_LIMIT_MS).optional(), size: z.enum(["S", "M", "L"]).optional(), selectedSubId: z.number().int().min(0).nullable().optional() });

/** PATCH /api/subs/prefs {mediaKey, offsetMs?, size?, selectedSubId?} → 204 (per user × title). */
export async function PATCH(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  const mediaKey = validMediaKey(body.mediaKey);
  if (mediaKey instanceof NextResponse) return mediaKey;
  try {
    const { mediaKey: _k, ...patch } = body;
    void _k;
    setSubtitlePrefs(me.user.id, mediaKey, patch, getUserSettings(me.user.id).sub_size);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[subs/prefs]", err instanceof Error ? err.message : err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
