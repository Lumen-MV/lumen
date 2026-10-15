import { NextResponse } from "next/server";
import { optionalStream, subsContext, subsErrorResponse, validMediaKey } from "@/lib/http/subs-route-helpers";
import { searchSubtitles } from "@/lib/subtitles/subtitle-search-service";

export const dynamic = "force-dynamic";

/** GET /api/subs/search?mediaKey=&streamId= → {tracks, selectedId, hasEnglish, quota, prefs, job?} */
export async function GET(req: Request) {
  const ctx = await subsContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const mediaKey = validMediaKey(new URL(req.url).searchParams.get("mediaKey"));
  if (mediaKey instanceof NextResponse) return mediaKey;
  const entry = optionalStream(req, ctx.me.user.id);
  if (entry instanceof NextResponse) return entry;
  if (entry && entry.mediaKey !== mediaKey) return NextResponse.json({ code: "BAD_REQUEST", issues: ["streamId"] }, { status: 400 });
  try {
    const result = await searchSubtitles({ mediaKey, entry, userId: ctx.me.user.id, scenario: ctx.scenario, params: ctx.params });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return subsErrorResponse("subs/search", err);
  }
}
